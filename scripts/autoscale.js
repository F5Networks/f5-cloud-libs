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
            var masterIid;
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
                provider = new Provider({clOptions: options, logger: logger});
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
                        bigIp = new BigIp({logger: logger});

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
                    var instanceIds;

                    this.instances = response || {};
                    this.instance = this.instances[this.instanceId];
                    logger.debug('instances:', this.instances);

                    instanceIds = Object.keys(this.instances);
                    if (instanceIds.length === 0) {
                        throw new Error('Instance list is empty. Exiting.');
                    }
                    else if (instanceIds.indexOf(this.instanceId) === -1) {
                        throw new Error('Our instance ID is not in instance list. Exiting');
                    }

                    logger.info('Determining master instance id.');
                    masterIid = getMasterInstanceId(this.instances);

                    if (masterIid) {
                        logger.info('Possible master ID:', masterIid);
                        return provider.isValidMaster(masterIid, this.instances);
                    }
                    else {
                        logger.info('No master ID found.');
                    }
                }.bind(this))
                .then(function(response) {

                    if (response) {
                        // true response means we have a valid masterIid, just pass it on
                        logger.info('Valid master ID:', masterIid);
                        return masterIid;
                    }
                    else {
                        // false or undefined response means no masterIid or invalid masterIid
                        if (masterIid) {
                            logger.info('Invalid master ID:', masterIid);
                            provider.masterInvalidated(masterIid);
                        }

                        logger.info('Electing master.');
                        return provider.electMaster(this.instances);
                    }
                }.bind(this))
                .then(function(response) {
                    masterIid = response;
                    if (this.instanceId === masterIid) {
                        this.instance.isMaster = true;
                    }
                    logger.info('Using master ID:', masterIid);
                    logger.info('This instance', (this.instance.isMaster ? 'is' : 'is not'), 'master');
                    return provider.masterElected(masterIid);
                }.bind(this))
                .then(function() {
                    switch(options.clusterAction) {
                        case 'join':
                            return handleJoin.call(this, provider, bigIp, masterIid, options);
                        case 'update':
                            return handleUpdate.call(this, provider, bigIp, options);
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

    var handleJoin = function(provider, bigIp, masterIid, options) {
        var hasUcs = false;

        const MASTER_FILE_PATH = "/config/cloud/master";

        logger.info('Cluster action JOIN');

        // Store our info
        return provider.putInstance(this.instance)
            .then(function() {
                if (this.instance.isMaster) {
                    return provider.getStoredUcs();
                }
            }.bind(this))
            .then(function(response) {
                if (this.instance.isMaster && response) {
                    hasUcs = true;
                    return loadUcs(bigIp, response, options.cloud);
                }
            }.bind(this))
            .then(function() {
                var deferred = q.defer();
                var masterInfo = {
                    ucsLoaded: hasUcs
                };

                if (this.instance.isMaster) {
                    // Mark ourself as master on disk so other scripts have access to this info
                    fs.writeFile(MASTER_FILE_PATH, JSON.stringify(masterInfo), function(err) {
                        if (err) {
                            logger.warn('Error saving master file', err);
                            deferred.reject(err);
                            return;
                        }

                        deferred.resolve();
                    });
                }
                else {
                    // Make sure the master file is not on our disk
                    if (fs.existsSync(MASTER_FILE_PATH)) {
                        fs.unlinkSync(MASTER_FILE_PATH);
                    }
                    deferred.resolve();
                }

                return deferred.promise;
            }.bind(this))
            .then(function() {
                if (this.instance.isMaster && !provider.features[AutoscaleProvider.FEATURE_MESSAGING]) {
                    logger.info('Storing master credentials.');
                    return provider.putMasterCredentials();
                }
            }.bind(this))
            .then(function(response) {
                logger.debug(response);

                // Configure cm configsync-ip on this BIG-IP node
                if (!this.instance.isMaster || !options.blockSync) {
                    logger.info("Setting config sync IP.");
                    return bigIp.cluster.configSyncIp(this.instance.privateIp);
                }
                else {
                    logger.info("Not seting config sync IP because we're master and block-sync is specified.");
                }
            }.bind(this))
            .then(function() {
                var masterInstance;

                // If we're the master, create the device group
                if (this.instance.isMaster) {
                    logger.info('Creating device group.');

                    return bigIp.cluster.createDeviceGroup(
                        options.deviceGroup,
                        'sync-failover',
                        [this.instance.hostname],
                        {autoSync: true}
                    );
                }

                // If we're not the master, join the cluster
                else {
                    logger.info('Joining cluster.');
                    masterInstance = this.instances[masterIid];
                    if (provider.features[AutoscaleProvider.FEATURE_MESSAGING]) {
                        return bigIp.deviceInfo()
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
                        logger.debug('Sending request to join cluster.');
                        return provider.getMasterCredentials(masterInstance.mgmtIp, options.port)
                            .then(function(credentials) {
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
                }
            }.bind(this))
            .catch(function(err) {
                // rethrow here, otherwise error is hidden
                throw(err);
            });
    };

    var handleUpdate = function(provider, bigIp, options) {

        logger.info('Cluster action UPDATE');

        if (this.instance.isMaster) {
            return checkForDisconnectedDevices.call(this, bigIp);
        }
        else {
            return checkForDisconnectedMaster.call(this, provider, bigIp, options);
        }
    };

    var handleMessages = function(provider, bigIp, options) {
        var deferred = q.defer();
        var instanceIdsBeingAdded = [];
        var actions = [];

        if (this.instance.isMaster && !options.blockSync) {
            actions.push(AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER);
        }

        if (!this.instance.isMaster) {
            actions.push(AutoscaleProvider.MESSAGE_SYNC_COMPLETE);
        }

        provider.getMessages(actions)
            .then(function(messages) {
                var promises = [];
                var message;
                var i;

                for (i = 0; i < messages.length; ++i) {
                    message = messages[i];
                    switch (message.action) {
                        // Add an instance to our cluster
                        case AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER:
                            // Make sure the message is for this instance not an old master
                            if (message.data.masterIid !== this.instanceId) {
                                logger.debug('Received message for a different master, discarding');
                                continue;
                            }

                            logger.silly('message join cluster', message.data.host);

                            if (instanceIdsBeingAdded.indexOf(message.data.instanceId) !== -1) {
                                logger.silly('Already adding', message.data.instanceId, '. Ignoring.');
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
                                        remoteHostname: message.data.hostname,
                                        noWait: true
                                    }
                                )
                            );

                            break;

                        // Add ourselves to another instance's cluster
                        case AutoscaleProvider.MESSAGE_JOIN_CLUSTER:

                            instanceIdsBeingAdded.push({
                                toInstanceId: this.instanceId,
                                fromUser: message.data.username,
                                fromPassword: message.data.password
                            });

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
                            logger.debug('Got sync complete message');
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

                        return provider.sendMessage(
                            AutoscaleProvider.MESSAGE_SYNC_COMPLETE,
                            {
                                toInstanceId: instanceIdsBeingAdded[i].toInstanceId,
                                fromUser: instanceIdsBeingAdded[i].fromUser,
                                fromPassword: instanceIdsBeingAdded[i].fromPassword
                            }
                        );
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

    var checkForDisconnectedMaster = function(provider, bigIp, options) {
        return provider.getMasterStatus()
            .then(function(masterStatus) {
                var timeInState;
                const MAX_BAD_MS = 10 * 60000; // 10 minutes

                masterStatus = masterStatus || {};

                if (masterStatus.status === AutoscaleProvider.DISCONNECTED || masterStatus.status === AutoscaleProvider.NOT_IN_GROUP) {
                    timeInState = new Date() - masterStatus.lastStatusChange;
                    if (timeInState > MAX_BAD_MS) {
                        provider.sendMessage(
                            AutoscaleProvider.MESSAGE_JOIN_CLUSTER,
                            {
                                masterIid: masterStatus.instanceId,
                                instanceId: this.instanceId,
                                host: this.instance.mgmtIp,
                                port: bigIp.port,
                                username: bigIp.user,
                                password: bigIp.password,
                                hostname: this.instance.hostname,
                                deviceGroup: options.deviceGroup
                            }
                        );
                    }
                }
            }.bind(this));
    };

    /**
     * Gets the instance ID of the master
     *
     * @param {Object} instances - Instances map
     *
     * @returns {String} instanceId of master if one is found.
     */
    var getMasterInstanceId = function(instances) {
        var instanceIds = Object.keys(instances);
        var instanceId;

        if (instanceIds.length === 1) {
            return instanceIds[0];
        }

        for (instanceId in instances) {
            if (instances[instanceId].isMaster) {
                return instanceId;
            }
        }
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

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
