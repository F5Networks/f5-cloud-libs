/**
 * Copyright 2016-2017 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {

    const MAX_DISCONNECTED_MS = 10 * 60000; // 10 minutes
    const MASTER_FILE_PATH = "/config/cloud/master";

    var fs = require('fs');
    var q = require('q');
    var AutoscaleProvider = require('../lib/autoscaleProvider');
    var runner;
    var logger;

    module.exports = runner = {

        /**
         * Runs the autoscale script
         *
         * Provider is passed in only for testing. In production, provider will be instantiated
         * based on the --cloud option
         *
         * @param {String[]} argv                - The process arguments.
         * @param {Ojbect}   [testOpts]          - Options used during testing
         * @param {Object}   [testOpts.provider] - Mock for provider.
         * @param {Object}   [testOpts.bigIp]    - Mock for BigIp.
         * @param {Function} [cb]                - Optional cb to call when done
         */
        run: function(argv, testOpts, cb) {

            const DEFAULT_LOG_FILE = "/tmp/autoscale.log";
            const ARGS_FILE_ID = 'autoscale_' + Date.now();

            var options = require('commander');
            var BigIp = require('../lib/bigIp');
            var Logger = require('../lib/logger');
            var util = require('../lib/util');
            var ipc = require('../lib/ipc');
            var loggerOptions = {};
            var providerOptions = [];
            var bigIp;
            var loggableArgs;
            var logFileName;
            var masterInstance;
            var masterIid;
            var masterExpired;
            var newMaster;
            var Provider;
            var provider;
            var i;

            var KEYS_TO_MASK = ['-p', '--password'];

            testOpts = testOpts || {};

            options = require('./commonOptions');

            options = options.getCommonOptions(DEFAULT_LOG_FILE)
                .option('--cloud <provider>', 'Cloud provider (aws | azure | etc.)')
                .option('--provider-options <cloud_options>', 'Any options that are required for the specific cloud provider. Ex: param1:value1,param2:value2', util.map, providerOptions)
                .option('-c, --cluster-action <type>', 'join (join a cluster) | update (update cluster to match existing instances | unblock-sync (allow other devices to sync to us)')
                .option('--device-group <device_group>', 'Device group name.')
                .option('--block-sync', 'If this device is master, do not allow other devices to sync to us. This prevents other devices from syncing to it until we are called again with --cluster-action unblock-sync.')
                .parse(argv);

            loggerOptions.console = options.console;
            loggerOptions.logLevel = options.logLevel;
            loggerOptions.module = module;

            if (options.output) {
                loggerOptions.fileName = options.output;
            }

            logger = Logger.getLogger(loggerOptions);
            util.logger = logger;

            if (!options.password && !options.passwordUrl) {
                logger.error("One of --password or --password-url is required.");
                return;
            }

            // When running in cloud init, we need to exit so that cloud init can complete and
            // allow the BIG-IP services to start
            if (options.background) {
                logFileName = options.output || DEFAULT_LOG_FILE;
                logger.info("Spawning child process to do the work. Output will be in", logFileName);
                util.runInBackgroundAndExit(process, logFileName);
            }

            // Log the input, but don't log passwords
            loggableArgs = argv.slice();
            for (i = 0; i < loggableArgs.length; ++i) {
                if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                    loggableArgs[i + 1] = "*******";
                }
            }
            logger.info(loggableArgs[1] + " called with", loggableArgs.join(' '));

            // Get the concrete provider instance
            provider = testOpts.provider;
            if (!provider) {
                Provider = require('f5-cloud-libs-' + options.cloud).provider;
                provider = new Provider({clOptions: options, loggerOptions: loggerOptions});
            }

            // Save args in restart script in case we need to reboot to recover from an error
            util.saveArgs(argv, ARGS_FILE_ID)
                .then(function() {
                    if (options.waitFor) {
                        logger.info("Waiting for", options.waitFor);
                        return ipc.once(options.waitFor);
                    }
                })
                .then(function() {
                    // Whatever we're waiting for is done, so don't wait for
                    // that again in case of a reboot
                    return util.saveArgs(argv, ARGS_FILE_ID, ['--wait-for']);
                })
                .then(function() {
                    if (testOpts.bigIp) {
                        bigIp = testOpts.bigIp;
                    }
                    else {
                        bigIp = new BigIp({loggerOptions: loggerOptions});

                        logger.info("Initializing BIG-IP.");
                        return bigIp.init(
                            options.host,
                            options.user,
                            options.password || options.passwordUrl,
                            {
                                port: options.port,
                                passwordIsUrl: typeof options.passwordUrl !== 'undefined'
                            }
                        );
                    }
                }.bind(this))
                .then(function() {
                    return provider.init(providerOptions[0], {autoscale: true});
                })
                .then(function() {
                    logger.info('Getting this instance ID.');
                    return provider.getInstanceId();
                })
                .then(function(response) {
                    logger.debug('This instance ID:', response);
                    this.instanceId = response;

                    logger.info('Getting info on all instances.');
                    return provider.getInstances();
                }.bind(this))
                .then(function (response) {
                    this.instances = response || {};
                    this.instance = this.instances[this.instanceId];
                    logger.debug('instances:', this.instances);

                    if (Object.keys(this.instances).length === 0) {
                        throw new Error('Instance list is empty. Exiting.');
                    }

                    if (!this.instance) {
                        throw new Error('Our instance ID is not in instance list. Exiting');
                    }

                    return provider.putInstance(this.instanceId, this.instance);
                }.bind(this))
                .then(function() {
                    var status = AutoscaleProvider.STATUS_UNKNOWN;

                    logger.info('Determining master instance id.');
                    masterInstance = getMasterInstance(this.instances);

                    if (masterInstance) {
                        // check to see if the master instance is currently visible to the cloud
                        // provider
                        if (masterInstance.instance.providerVisible) {
                            masterIid = masterInstance.id;

                            if (this.instanceId === masterIid) {
                                this.instance.isMaster = true;
                            }

                            status = AutoscaleProvider.STATUS_OK;
                        }
                        else {
                            // The cloud provider does not currently see this instance,
                            // check to see if it's been gone for a while or if this is a
                            // random error
                            status = AutoscaleProvider.STATUS_NOT_IN_CLOUD_LIST;
                        }
                    }

                    return updateMasterStatus.call(this, provider, status);
                }.bind(this))
                .then(function() {
                    if (masterInstance && isMasterExpired(this.instance)) {
                        masterExpired = true;
                        return provider.masterExpired(masterInstance.id, this.instances);
                    }
                }.bind(this))
                .then(function() {
                    if (masterIid) {
                        logger.info('Possible master ID:', masterIid);
                        return provider.isValidMaster(masterIid, this.instances);
                    }
                    else if (masterExpired) {
                        logger.info('Old master expired.');
                    }
                    else {
                        logger.info('No master ID found.');
                    }
                }.bind(this))
                .then(function(validMaster) {
                    if (validMaster) {
                        // true validMaster means we have a valid masterIid, just pass it on
                        logger.info('Valid master ID:', masterIid);
                        return masterIid;
                    }
                    else {
                        // false or undefined validMaster means no masterIid or invalid masterIid
                        if (validMaster === false) {
                            logger.info('Invalid master ID:', masterIid);
                            provider.masterInvalidated(masterIid);
                        }

                        // if no master, master is visible or expired, elect, otherwise, wait
                        if (!masterInstance ||
                            masterInstance.instance.providerVisible ||
                            masterExpired) {

                            logger.info('Electing master.');
                            return provider.electMaster(this.instances);
                        }
                    }
                }.bind(this))
                .then(function(response) {
                    var now = new Date();

                    if (response) {
                        // we just elected a master
                        masterIid = response;
                        if (this.instanceId === masterIid) {
                            this.instance.isMaster = true;
                        }
                        logger.info('Using master ID:', masterIid);
                        logger.info('This instance', (this.instance.isMaster ? 'is' : 'is not'), 'master');

                        if (this.instance.masterStatus.instanceId !== masterIid) {
                            logger.info('New master elected');
                            newMaster = true;

                            this.instance.masterStatus = {
                                instanceId: masterIid,
                                status: AutoscaleProvider.STATUS_OK,
                                lastUpdate: now,
                                lastStatusChange: now
                            };

                            return provider.putInstance(this.instanceId, this.instance);
                        }
                    }
                }.bind(this))
                .then(function() {
                    if (this.instance.isMaster && newMaster) {
                        return becomeMaster(provider, bigIp, options);
                    }
                }.bind(this))
                .then(function(response) {
                    if (response === true) {
                        logger.silly('Became master');
                    }

                    if (masterIid) {
                        return provider.masterElected(masterIid);
                    }
                }.bind(this))
                .then(function() {
                    switch(options.clusterAction) {
                        case 'join':
                            return handleJoin.call(this, provider, bigIp, masterIid, masterExpired, options);
                        case 'update':
                            return handleUpdate.call(this, provider, bigIp, masterIid, masterExpired, options);
                        case 'unblock-sync':
                            logger.info("Cluster action UNBLOCK-SYNC");
                            return bigIp.cluster.configSyncIp(this.instance.privateIp);
                    }
                }.bind(this))
                .then(function() {
                    if (provider.features[AutoscaleProvider.FEATURE_MESSAGING]) {
                        logger.info('Checking for messages');
                        return handleMessages.call(this, provider, bigIp, options);
                    }
                }.bind(this))
                .catch(function(err) {
                    logger.error(err.message);
                })
                .done(function() {
                    util.deleteArgs(ARGS_FILE_ID);

                    if (cb) {
                        cb();
                    }

                    // Exit so that any listeners don't keep us alive
                    util.logAndExit("Autoscale finished.");
                });

                // If we reboot, exit - otherwise cloud providers won't know we're done
                ipc.once('REBOOT')
                    .then(function() {
                        util.logAndExit("REBOOT signaled. Exiting.");
                    });

            }
    };

    /**
     * Handles --cluster-action join
     *
     * Called with this bound to the caller
     */
    var handleJoin = function(provider, bigIp, masterIid, masterExpired, options) {
        var deferred = q.defer();
        var promise;

        logger.info('Cluster action JOIN');

        // If we are master and are replacing an expired master, other instances
        // will join to us. Just set our config sync ip.
        if (this.instance.isMaster) {

            if (!provider.features[AutoscaleProvider.FEATURE_MESSAGING]) {
                logger.info('Storing master credentials.');
                promise = provider.putMasterCredentials();
            }
            else {
                promise = q();
            }

            promise
                .then(function(response) {
                    logger.debug(response);

                    // Configure cm configsync-ip on this BIG-IP node
                    if (!options.blockSync) {
                        logger.info('Setting config sync IP.');
                        return bigIp.cluster.configSyncIp(this.instance.privateIp);
                    }
                    else {
                        logger.info('Not seting config sync IP because block-sync is specified.');
                    }
                }.bind(this))
                .then(function() {
                    // Create the device group
                    logger.info('Creating device group.');

                    return bigIp.cluster.createDeviceGroup(
                        options.deviceGroup,
                        'sync-failover',
                        [this.instance.hostname],
                        {autoSync: true}
                    );

                }.bind(this))
                .then(function() {
                    deferred.resolve();
                })
                .catch(function(err) {
                    // rethrow here, otherwise error is hidden
                    throw(err);
                });
        }

        else {
            // We're not the master

            // Make sure the master file is not on our disk
            if (fs.existsSync(MASTER_FILE_PATH)) {
                fs.unlinkSync(MASTER_FILE_PATH);
            }

            // Configure cm configsync-ip on this BIG-IP node and join the cluster
            logger.info("Setting config sync IP.");
            bigIp.cluster.configSyncIp(this.instance.privateIp)
                .then(function() {
                    // If there is a master, joint it. Otherwise wait for an update event
                    // when we have a master.
                    if (masterIid) {
                        return joinCluster.call(this, provider, bigIp, masterIid, options);
                    }
                }.bind(this))
                .then(function() {
                    deferred.resolve();
                })
                .catch(function(err) {
                    // rethrow here, otherwise error is hidden
                    throw(err);
                });
        }

        return deferred.promise;
    };

    /**
     * Handles --cluster-action update
     *
     * Called with this bound to the caller
     */
    var handleUpdate = function(provider, bigIp, masterIid, masterExpired, options) {
        logger.info('Cluster action UPDATE');

        if (this.instance.isMaster && !masterExpired) {
            return checkForDisconnectedDevices.call(this, bigIp);
        }
        else if (!this.instance.isMaster) {
            // We're not the master, make sure the master file is not on our disk
            if (fs.existsSync(MASTER_FILE_PATH)) {
                fs.unlinkSync(MASTER_FILE_PATH);
            }

            // If there is a new master, join the cluster
            if (masterExpired && masterIid) {
                return joinCluster.call(this, provider, bigIp, masterIid, options);
            }
            else if (masterIid) {
                // Double check that we are in the device group
                return bigIp.cluster.hasDeviceGroup(options.deviceGroup)
                    .then(function(response) {
                        if (response === false) {
                            logger.info("This instance is not in cluster. Requesting join.");
                            return joinCluster.call(this, provider, bigIp, masterIid, options);
                        }
                    }.bind(this))
                    .catch(function(err) {
                        throw(err);
                    });
            }
        }
    };

    /**
     * Called with this bound to the caller
     */
    var handleMessages = function(provider, bigIp, options) {
        var deferred = q.defer();
        var instanceIdsBeingAdded = [];
        var actions = [];

        if (this.instance.isMaster && !options.blockSync) {
            actions.push(AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER);
            actions.push(AutoscaleProvider.MESSAGE_JOIN_CLUSTER);
        }

        if (!this.instance.isMaster) {
            actions.push(AutoscaleProvider.MESSAGE_SYNC_COMPLETE);
        }

        provider.getMessages(actions)
            .then(function(messages) {
                var promises = [];
                var message;
                var i;

                messages = messages || [];

                var alreadyAdding = function(instanceId) {
                    return instanceIdsBeingAdded.find(function(element) {
                        return instanceId === element.toInstanceId;
                    });
                };

                var alreadyJoining = false;

                logger.debug('Handling', messages.length, 'message(s)');

                for (i = 0; i < messages.length; ++i) {
                    message = messages[i];

                    switch (message.action) {
                        // Add an instance to our cluster
                        case AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER:

                            logger.silly('message add to cluster', message.data.host);

                            // Make sure the message is for this instance not an old master
                            if (message.data.masterIid !== this.instanceId) {
                                logger.debug('Received message for a different master, discarding');
                                continue;
                            }

                            if (alreadyAdding(message.data.instanceId)) {
                                logger.debug('Already adding', message.data.instanceId, ', discarding');
                                continue;
                            }

                            instanceIdsBeingAdded.push({
                                toInstanceId: message.data.instanceId,
                                fromUser: bigIp.user,
                                fromPassword: bigIp.password
                            });

                            promises.push(
                                bigIp.cluster.joinCluster(
                                    message.data.deviceGroup,
                                    message.data.host,
                                    message.data.username,
                                    message.data.password,
                                    true,
                                    {
                                        remotePort: message.data.port,
                                        remoteHostname: message.data.hostname
                                    }
                                )
                            );

                            break;

                        // Add ourselves to another instance's cluster
                        case AutoscaleProvider.MESSAGE_JOIN_CLUSTER:

                            logger.silly('message join cluster', message.data.host);

                            if (alreadyJoining) {
                                logger.debug('Already joining cluster, discarding');
                                continue;
                            }

                            promises.push(
                                bigIp.cluster.joinCluster(
                                    message.data.deviceGroup,
                                    message.data.host,
                                    message.data.username,
                                    message.data.password,
                                    false,
                                    {
                                        remotePort: message.data.port,
                                        remoteHostname: message.data.hostname,
                                    }
                                )
                            );

                            break;

                        case AutoscaleProvider.MESSAGE_SYNC_COMPLETE:
                            // See if the message is for us
                            if (message.data.toInstanceId !== this.instanceId) {
                                continue;
                            }

                            logger.silly('calling sync complete');
                            promises.push(provider.syncComplete(message.data.fromUser, message.data.fromPassword));

                            break;

                        default:
                            deferred.reject('Unknown message action', message.action);
                    }
                }

                return q.all(promises);
            }.bind(this))
            .then(function(responses) {
                var i;
                responses = responses || [];

                if (instanceIdsBeingAdded.length > 0) {
                    for (i = 0; i < responses.length; ++i) {
                        // responses[i] === true iff that instance was successfully synced
                        if (responses[i] === true) {
                            provider.sendMessage(
                                AutoscaleProvider.MESSAGE_SYNC_COMPLETE,
                                {
                                    toInstanceId: instanceIdsBeingAdded[i].toInstanceId,
                                    fromUser: instanceIdsBeingAdded[i].fromUser,
                                    fromPassword: instanceIdsBeingAdded[i].fromPassword
                                }
                            );
                        }
                    }
                }
            }.bind(this))
            .then(function() {
                deferred.resolve();
            })
            .catch(function(err) {
                deferred.reject(err);
            });

        return deferred.promise;
    };

    var becomeMaster = function(provider, bigIp, options) {
        var hasUcs = false;
        logger.info("Becoming master.");
        logger.info("Checking for backup UCS.");
        return provider.getStoredUcs()
            .then(function(response) {
                if (response) {
                    hasUcs = true;
                    return loadUcs(bigIp, response, options.cloud);
                }
            })
            .then(function() {
                logger.info("Writing master file.");
                return writeMasterFile(hasUcs);
            });
    };

    /**
     * Called with this bound to the caller
     */
    var joinCluster = function(provider, bigIp, masterIid, options) {
        var masterInstance;

        if (!masterIid) {
            return q.reject(new Error('Must have a master ID to join'));
        }

        logger.info('Joining cluster.');

        if (provider.features[AutoscaleProvider.FEATURE_MESSAGING]) {
                logger.debug('Resetting current device trust');
                return bigIp.cluster.resetTrust()
                .then(function(response) {
                    logger.debug(response);
                    return bigIp.deviceInfo();
                })
                .then(function(response) {
                    var managementIp = response.managementAddress;

                    logger.debug('Sending message to join cluster.');
                    return provider.sendMessage(
                        AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER,
                        {
                            masterIid: masterIid,
                            instanceId: this.instanceId,
                            host: managementIp,
                            port: bigIp.port,
                            username: bigIp.user,
                            password: bigIp.password,
                            hostname: this.instance.hostname,
                            deviceGroup: options.deviceGroup
                        }
                    );
                }.bind(this))
                .catch(function(err) {
                    // need to bubble up nested errors
                    return q.reject(err);
                });
        }
        else {
            masterInstance = this.instances[masterIid];

            logger.debug('Resetting current device trust');
            return bigIp.cluster.resetTrust()
                .then(function(response) {
                    logger.debug(response);
                    return provider.getMasterCredentials(masterInstance.mgmtIp, options.port);
                })
                .then(function(credentials) {
                    logger.debug('Sending request to join cluster.');
                    return bigIp.cluster.joinCluster(
                        options.deviceGroup,
                        masterInstance.mgmtIp,
                        credentials.username,
                        credentials.password,
                        false,
                        {remotePort: options.port}
                    );
                });
        }
    };

    /**
     * Called with this bound to the caller
     */
    var checkForDisconnectedDevices = function(bigIp) {
        return bigIp.cluster.getCmSyncStatus()
            .then(function(response) {
                logger.silly('cmSyncStatus:', response);

                var hostnames = [];
                var hostnamesToRemove = [];
                var instanceId;

                response = response || {};

                // response is an object of two lists (connected/disconnected) from getCmSyncStatus()
                var disconnected = response.disconnected;
                if (disconnected.length > 0) {

                    logger.info('Possibly disconnected devices:', disconnected);

                    // get a list of hostnames still in the instances list
                    for (instanceId in this.instances) {
                        hostnames.push(this.instances[instanceId].hostname);
                    }

                    // make sure this is not still in the instances list
                    disconnected.forEach(function(hostname) {
                        if (hostnames.indexOf(hostname) === -1) {
                            logger.info('Disconnected device:', hostname);
                            hostnamesToRemove.push(hostname);
                        }
                    });

                    if (hostnamesToRemove.length > 0) {
                        logger.info('Removing devices from cluster:', hostnamesToRemove);
                        return bigIp.cluster.removeFromCluster(hostnamesToRemove);
                    }
                }
            }.bind(this))
            .catch(function(err) {
                logger.warn('Could not get sync status');
                return q.reject(err);
            });

    };

    /**
     * Gets the instance marked as master
     *
     * @param {Object} instances - Instances map
     *
     * @returns {Object} master instance if one is found
     *
     *                   {
     *                       id: instance_id,
     *                       instance: instance_data
     *                   }
     */
    var getMasterInstance = function(instances) {
        var instanceId;

        for (instanceId in instances) {
            if (instances[instanceId].isMaster) {
                return {
                    id: instanceId,
                    instance: instances[instanceId]
                };
            }
        }
    };

    /*
     * Determines if the master status has been bad for more than a certain
     * amount of time.
     *
     * @param {Object} instance - instance as returned by getInstances
     *
     * @returns {Boolean} Whether or not the master status has been bad for too long
     */
    var isMasterExpired = function(instance) {
        var masterStatus = instance.masterStatus || {};
        var isExpired = false;
        var disconnectedMs;

        if (masterStatus.status !== AutoscaleProvider.STATUS_OK) {
            disconnectedMs = new Date() - new Date(masterStatus.lastStatusChange);
            logger.silly('master has been disconnected for', disconnectedMs.toString(), 'ms');
            if (disconnectedMs > MAX_DISCONNECTED_MS) {
                logger.info('master has been disconnected for too long (', disconnectedMs.toString(), 'ms )');
                isExpired = true;
            }

        }
        return isExpired;
    };

    var updateMasterStatus = function(provider, status) {
        var now = new Date();
        this.instance.masterStatus = this.instance.masterStatus || {};
        this.instance.masterStatus.lastUpdate = now;
        if (this.instance.masterStatus.status !== status) {
            this.instance.masterStatus.status = status;
            this.instance.masterStatus.lastStatusChange = now;
        }
        return provider.putInstance(this.instanceId, this.instance);
    };

    /**
     * Loads UCS
     *
     * @param {Object} bigIp - bigIp instances
     * @param {Buffer|Stream} ucsData - Either a Buffer or a ReadableStream containing UCS data
     * @param {String} cloudProvider - Cloud provider (aws, azure, etc)
     *
     * @returns {Promise} Promise that will be resolved when the UCS is loaded or rejected
     *                    if an error occurs.
     */
    var loadUcs = function(bigIp, ucsData, cloudProvider) {
        const timeStamp = Date.now();
        const originalPath = '/config/ucsOriginal_' + timeStamp + '.ucs';
        const updatedPath = '/config/ucsUpdated_' + timeStamp + '.ucs';
        const updateScript = '/config/cloud/' + (cloudProvider === 'aws' ? 'aws/' : '') + 'node_modules/f5-cloud-libs/scripts/updateAutoScaleUcs';

        var deferred = q.defer();
        var originalFile;

        var doLoad = function() {
            var childProcess = require('child_process');
            var args = ['--original-ucs', originalPath, '--updated-ucs', updatedPath, '--cloud-provider', cloudProvider];
            var cp;

            cp = childProcess.execFile(updateScript, args, function(err) {
                if (err) {
                    logger.warn(updateScript + ' failed:', err);
                    deferred.reject(err);
                    return;
                }

                if (!fs.existsSync(updatedPath)) {
                    logger.warn(updatedPath + ' does not exist after running ' + updateScript);
                    deferred.reject(new Error('load ucs failed'));
                    return;
                }

                bigIp.loadUcs(updatedPath, {"no-license": true, "reset-trust": true})
                    .then(function() {
                        // reset-trust on load does not always seem to work
                        // use a belt-and-suspenders approach and reset now as well
                        return bigIp.cluster.resetTrust();
                    })
                    .then(function() {
                        // Attempt to delete the file, but ignore errors
                        try {
                            fs.unlinkSync(originalPath);
                            fs.unlinkSync(updatedPath);
                        }
                        finally {
                            deferred.resolve();
                        }
                    })
                    .catch(function(err) {
                        deferred.reject(err);
                    });
                }
            );
        };

        // If ucsData has a pipe method (is a stream), use it
        if (ucsData.pipe) {
            logger.silly('ucsData is a Stream');
            originalFile = fs.createWriteStream(originalPath);

            ucsData.pipe(originalFile);

            originalFile.on('finish', function() {
                logger.silly('finished piping ucsData');
                originalFile.close(function() {
                    doLoad();
                });
            });

            originalFile.on('error', function(err) {
                logger.warn('Error piping ucsData', err);
                deferred.reject(err);
            });

            ucsData.on('error', function(err) {
                logger.warn('Error reading ucs data', err);
                deferred.reject(err);
            });
        }

        // Otherwise, assume it's a Buffer
        else {
            logger.silly('ucsData is a Buffer');
            fs.writeFile(originalPath, ucsData, function(err) {
                logger.silly('finished writing ucsData');
                if (err) {
                    logger.warn('Error writing ucsData', err);
                    deferred.reject(err);
                    return;
                }
                doLoad();
            });
        }

        return deferred.promise;
    };

    var writeMasterFile = function(ucsLoaded) {
        var deferred = q.defer();
        var masterInfo = {
            ucsLoaded: ucsLoaded
        };

        // Mark ourself as master on disk so other scripts have access to this info
        fs.writeFile(MASTER_FILE_PATH, JSON.stringify(masterInfo), function(err) {
            if (err) {
                logger.warn('Error saving master file', err);
                deferred.reject(err);
                return;
            }

            logger.silly('Wrote master file', MASTER_FILE_PATH, masterInfo);
            deferred.resolve(true);
        });

        return deferred.promise;
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
