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

    const MAX_DISCONNECTED_MS = 3 * 60000; // 3 minutes
    const MIN_MS_BETWEEN_JOIN_REQUESTS = 5 * 60000; // 5 minutes
    const MASTER_FILE_PATH = "/config/cloud/master";

    const INSTANCE_STATUS_BECOMING_MASTER = 'BECOMING_MASTER';
    const INSTANCE_STATUS_OK = 'OK';

    const PASSPHRASE_LENGTH = 18;

    const AUTOSCALE_PRIVATE_KEY = 'cloudLibsAutoscalePrivate';
    const AUTOSCALE_PRIVATE_KEY_FOLDER = 'CloudLibsAutoscale';

    var fs = require('fs');
    var q = require('q');
    var AutoscaleProvider = require('../lib/autoscaleProvider');
    var util = require('../lib/util');
    var cryptoUtil = require('../lib/cryptoUtil');
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

            options.autoSync = true;
            options.saveOnAutoSync = true;

            options = options.getCommonOptions(DEFAULT_LOG_FILE)
                .option('--cloud <provider>', 'Cloud provider (aws | azure | etc.)')
                .option('--provider-options <cloud_options>', 'Any options that are required for the specific cloud provider. Ex: param1:value1,param2:value2', util.mapArray, providerOptions)
                .option('-c, --cluster-action <type>', 'join (join a cluster) | update (update cluster to match existing instances | unblock-sync (allow other devices to sync to us)')
                .option('--device-group <device_group>', 'Device group name.')
                .option('    --full-load-on-sync', '    Enable full load on sync. Default false.')
                .option('    --asm-sync', '    Enable ASM sync. Default false. Default false.')
                .option('    --network-failover', '    Enable network failover. Default false.')
                .option('    --no-auto-sync', '    Enable auto sync. Default false (auto sync).')
                .option('    --no-save-on-auto-sync', '    Enable save on sync if auto sync is enabled. Default false (save on auto sync).')
                .option('--block-sync', 'If this device is master, do not allow other devices to sync to us. This prevents other devices from syncing to it until we are called again with --cluster-action unblock-sync.')
                .option('--license-pool', 'BIG-IP was licensed from a BIG-IQ license pool. This is so licenses can be revoked when BIG-IPs are scaled in. Supply the following:')
                .option('    --big-iq-host <ip_address or FQDN>', '    IP address or FQDN of BIG-IQ')
                .option('    --big-iq-user <user>', '    BIG-IQ admin user name')
                .option('    --big-iq-password <password>', '    BIG-IQ admin user password.')
                .option('    --big-iq-password-uri <password_uri>', '    URI (file, http(s), arn) to location that contains BIG-IQ admin user password. Use this or --big-iq-password.')
                .option('    --license-pool-name <pool_name>', '    Name of BIG-IQ license pool.')
                .option('    --big-ip-mgmt-address <big_ip_address>', '    IP address or FQDN of BIG-IP management port. Use this if BIG-IP reports an address not reachable from BIG-IQ.')
                .option('    --big-ip-mgmt-port <big_ip_port>', '    Port for the management address. Use this if the BIG-IP is not reachable from BIG-IQ via the port used in --port')
                .parse(argv);

            loggerOptions.console = options.console;
            loggerOptions.logLevel = options.logLevel;
            loggerOptions.module = module;

            if (options.output) {
                loggerOptions.fileName = options.output;
            }

            logger = Logger.getLogger(loggerOptions);
            util.setLoggerOptions(loggerOptions);
            cryptoUtil.setLoggerOptions(loggerOptions);

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
                    logger.debug('instances:', this.instances);

                    if (Object.keys(this.instances).length === 0) {
                        throw new Error('Instance list is empty. Exiting.');
                    }

                    this.instance = this.instances[this.instanceId];
                    if (!this.instance) {
                        throw new Error('Our instance ID is not in instance list. Exiting');
                    }

                    this.instance.status = this.instance.status || INSTANCE_STATUS_OK;
                    logger.silly('Instance status:', this.instance.status);

                    if (this.instance.status === INSTANCE_STATUS_BECOMING_MASTER) {
                        throw new Error('Currently becoming master. Exiting.');
                    }

                    return provider.putInstance(this.instanceId, this.instance);
                }.bind(this))
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
                                passwordIsUrl: typeof options.passwordUrl !== 'undefined',
                                passwordEncrypted: options.passwordEncrypted
                            }
                        );
                    }
                }.bind(this))
                .then(function () {
                    return provider.bigIpReady();
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

                    logger.silly('validMaster:', validMaster, ', masterInstance: ', masterInstance, ', masterExpired:', masterExpired);

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
                        this.instance.status = INSTANCE_STATUS_BECOMING_MASTER;
                        return provider.putInstance(this.instanceId, this.instance)
                            .then(function() {
                                return becomeMaster.call(this, provider, bigIp, options);
                            }.bind(this));
                    }
                }.bind(this))
                .then(function(response) {
                    if (this.instance.status === INSTANCE_STATUS_BECOMING_MASTER && response === true) {
                        this.instance.status = INSTANCE_STATUS_OK;
                        logger.silly('Became master');
                        return provider.putInstance(this.instanceId, this.instance);
                    }
                    else if (response === false) {
                        logger.warn('Error writing master file');
                    }
                }.bind(this))
                .then(function() {
                    if (masterIid && this.instance.status === INSTANCE_STATUS_OK) {
                        return provider.masterElected(masterIid);
                    }
                }.bind(this))
                .then(function() {
                    if (this.instance.status === INSTANCE_STATUS_OK) {
                        switch(options.clusterAction) {
                            case 'join':
                                return handleJoin.call(this, provider, bigIp, masterIid, masterExpired, options);
                            case 'update':
                                return handleUpdate.call(this, provider, bigIp, masterIid, masterExpired, options);
                            case 'unblock-sync':
                                logger.info("Cluster action UNBLOCK-SYNC");
                                return bigIp.cluster.configSyncIp(this.instance.privateIp);
                        }
                    }
                    else {
                        logger.debug('Instance status not OK. Waiting.', this.instance.status);
                    }
                }.bind(this))
                .then(function() {
                    if (this.instance.status === INSTANCE_STATUS_OK) {
                        if (provider.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
                            logger.info('Checking for messages');
                            return handleMessages.call(this, provider, bigIp, options);
                        }
                    }
                    else {
                        logger.debug('Instance status not OK. Waiting.', this.instance.status);
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

        logger.info('Cluster action JOIN');

        logger.info('Initializing encryption');
        initEncryption.call(this, provider, bigIp)
            .then(function() {
                var promise;

                // If we are master and are replacing an expired master, other instances
                // will join to us. Just set our config sync ip.
                if (this.instance.isMaster) {

                    if (!provider.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
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
                            // If there is a master, join it. Otherwise wait for an update event
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
            }.bind(this));

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
                // Double check that we are clustered
                return bigIp.list('/tm/cm/trust-domain/Root')
                    .then(function(response) {
                        if (!response || response.status === 'standalone') {
                            logger.info("This instance is not in cluster. Requesting join.");
                            return joinCluster.call(this, provider, bigIp, masterIid, options);
                        }
                    }.bind(this))
                    .catch(function(err) {
                        throw(err);
                    });
            }
        }
        else {
            return q();
        }
    };

    /**
     * Called with this bound to the caller
     */
    var handleMessages = function(provider, bigIp, options) {
        var deferred = q.defer();
        var instanceIdsBeingAdded = [];
        var actions = [];
        var actionPromises = [];
        var messageMetadata = [];

        if (this.instance.isMaster && !options.blockSync) {
            actions.push(AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER);
        }

        if (!this.instance.isMaster) {
            actions.push(AutoscaleProvider.MESSAGE_SYNC_COMPLETE);
        }

        provider.getMessages(actions, {toInstanceId: this.instanceId})
            .then(function(messages) {
                var readPromises = [];

                messages = messages || [];

                logger.debug('Handling', messages.length, 'message(s)');

                messages.forEach(function(message) {
                    messageMetadata.push(
                        {
                            action: message.action,
                            toInstanceId: message.toInstanceId,
                            fromInstanceId: message.fromInstanceId
                        }
                    );
                    readPromises.push(readMessageData.call(this, provider, bigIp, message.data));
                }.bind(this));

                logger.silly('number of messages to read:', readPromises.length);

                return q.all(readPromises);
            }.bind(this))
            .then(function(readMessages) {
                var metadata;
                var messageData;
                var i;

                var alreadyAdding = function(instanceId) {
                    return instanceIdsBeingAdded.find(function(element) {
                        return instanceId === element.toInstanceId;
                    });
                };

                readMessages = readMessages || [];

                logger.silly('number of read messages:', readMessages.length);

                for (i = 0; i < readMessages.length; ++i) {
                    metadata = messageMetadata[i];
                    logger.silly('metadata:', metadata);

                    try {
                        messageData = JSON.parse(readMessages[i]);
                    }
                    catch (err) {
                        logger.warn('JSON.parse error:', err);
                        deferred.reject(new Error('Unable to JSON parse message'));
                        continue;
                    }

                    switch (metadata.action) {
                        // Add an instance to our cluster
                        case AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER:
                            logger.silly('message MESSAGE_ADD_TO_CLUSTER');

                            if (alreadyAdding(metadata.fromInstanceId)) {
                                logger.debug('Already adding', metadata.fromInstanceId, ', discarding');
                                continue;
                            }

                            instanceIdsBeingAdded.push({
                                toInstanceId: metadata.fromInstanceId,
                                fromUser: bigIp.user,
                                fromPassword: bigIp.password
                            });

                            actionPromises.push(
                                bigIp.cluster.joinCluster(
                                    messageData.deviceGroup,
                                    messageData.host,
                                    messageData.username,
                                    messageData.password,
                                    true,
                                    {
                                        remotePort: messageData.port,
                                        remoteHostname: messageData.hostname,
                                        passwordEncrypted: false
                                    }
                                )
                            );

                            break;

                        // sync is complete
                        case AutoscaleProvider.MESSAGE_SYNC_COMPLETE:
                            logger.silly('message MESSAGE_SYNC_COMPLETE');
                            actionPromises.push(provider.syncComplete(messageData.fromUser, messageData.fromPassword));

                            break;
                    }
                }

                return q.all(actionPromises);
            }.bind(this))
            .then(function(responses) {
                var messagePromises = [];
                var messageData;
                var i;

                responses = responses || [];

                if (instanceIdsBeingAdded.length > 0) {
                    messageMetadata = [];

                    logger.silly('responses from join cluster', responses);
                    for (i = 0; i < responses.length; ++i) {
                        // responses[i] === true iff that instance was successfully synced
                        if (responses[i] === true) {
                            logger.silly('sync is complete for instance', instanceIdsBeingAdded[i].toInstanceId);

                            messageMetadata.push(
                                {
                                    action: AutoscaleProvider.MESSAGE_SYNC_COMPLETE,
                                    toInstanceId: instanceIdsBeingAdded[i].toInstanceId,
                                    fromInstanceId: this.instanceId
                                }
                            );
                            messageData = {
                                fromUser: instanceIdsBeingAdded[i].fromUser,
                                fromPassword: instanceIdsBeingAdded[i].fromPassword
                            };

                            messagePromises.push(
                                prepareMessageData.call(
                                    this,
                                    provider,
                                    instanceIdsBeingAdded[i].toInstanceId,
                                    JSON.stringify(messageData)
                                )
                            );
                        }
                    }
                }

                return q.all(messagePromises);
            }.bind(this))
            .then(function(preppedMessageData) {
                var syncCompletePromises = [];
                var metadata;
                var messageData;
                var i;

                for (i = 0; i < preppedMessageData.length; ++i) {
                    metadata = messageMetadata[i];
                    messageData = preppedMessageData[i];

                    syncCompletePromises.push(
                        provider.sendMessage(
                            AutoscaleProvider.MESSAGE_SYNC_COMPLETE,
                            {
                                toInstanceId: metadata.toInstanceId,
                                fromInstanceId: metadata.fromInstanceId,
                                data: messageData
                            }
                        )
                    );
                }

                return q.all(syncCompletePromises);
            }.bind(this))
            .then(function() {
                deferred.resolve();
            })
            .catch(function(err) {
                logger.warn('Error handling messages', err);
                deferred.reject(err);
            });

        return deferred.promise;
    };

    /**
     * Handles becoming master.
     *
     * @returns {Promise} promise which is resolved tieh true if successful
     */
    var becomeMaster = function(provider, bigIp, options) {
        var hasUcs = false;
        logger.info("Becoming master.");
        logger.info("Checking for backup UCS.");
        return provider.getStoredUcs()
            .then(function(response) {
                if (response) {
                    hasUcs = true;
                    return loadUcs(provider, bigIp, response, options.cloud);
                }
            })
            .then(function() {
                // If we loaded UCS, re-initialize encryption so our keys
                // match each other
                if (hasUcs) {
                    return initEncryption.call(this, provider, bigIp);
                }
            }.bind(this))
            .then(function() {
                // Make sure device group exists
                logger.info('Creating device group.');

                var deviceGroupOptions = {
                    autoSync: options.autoSync,
                    saveOnAutoSync: options.saveOnAutoSync,
                    fullLoadOnSync: options.fullLoadOnSync,
                    asmSync: options.asmSync,
                    networkFailover: options.networkFailover
                };

                return bigIp.cluster.createDeviceGroup(
                    options.deviceGroup,
                    'sync-failover',
                    [this.instance.hostname],
                    deviceGroupOptions
                );

            }.bind(this))
            .then(function() {
                logger.info("Writing master file.");
                return writeMasterFile(hasUcs);
            });
    };

    /**
     * Called with this bound to the caller
     */
    var joinCluster = function(provider, bigIp, masterIid, options) {
        const TEMP_USER_NAME_LENGHTH = 10;    // these are hex bytes - user name will be 20 chars
        const TEMP_USER_PASSWORD_LENGTH = 24; // use a multiple of 6 to prevent '=' at the end

        var now = new Date();
        var masterInstance;
        var elapsedMsFromLastJoin;
        var managementIp;
        var tempPassword;
        var tempUser;

        if (!masterIid) {
            return q.reject(new Error('Must have a master ID to join'));
        }

        // don't send request too often - master might be in process of syncing
        this.instance.lastJoinRequest = this.instance.lastJoinRequest || new Date(1970, 0);
        elapsedMsFromLastJoin = now - new Date(this.instance.lastJoinRequest);
        if (elapsedMsFromLastJoin < MIN_MS_BETWEEN_JOIN_REQUESTS) {
            logger.silly('Join request is too soon after last join request.', elapsedMsFromLastJoin, 'ms');
            return q();
        }

        logger.info('Joining cluster.');

        if (provider.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
                logger.debug('Resetting current device trust');
                this.instance.lastJoinRequest = now;
                return provider.putInstance(this.instanceId, this.instance)
                    .then(function(response) {
                        logger.debug(response);
                        return bigIp.cluster.resetTrust();
                    })
                    .then(function(response) {
                        logger.debug(response);
                        return bigIp.deviceInfo();
                    })
                    .then(function(response) {
                        managementIp = response.managementAddress;

                        // Get a random user name to use
                        return cryptoUtil.generateRandomBytes(TEMP_USER_NAME_LENGHTH, 'hex');
                    })
                    .then(function(respomse) {
                        tempUser = respomse;

                        // Get a random password for the user
                        return cryptoUtil.generateRandomBytes(TEMP_USER_PASSWORD_LENGTH, 'base64');
                    })
                    .then(function(response) {
                        tempPassword = response;

                        // Create the temp user account
                        return bigIp.onboard.updateUser(tempUser, tempPassword, 'admin');
                    })
                    .then(function() {
                        var messageData;

                        logger.debug('Sending message to join cluster.');

                        messageData =  {
                            host: managementIp,
                            port: bigIp.port,
                            username: tempUser,
                            password: tempPassword,
                            hostname: this.instance.hostname,
                            deviceGroup: options.deviceGroup
                        };

                        return prepareMessageData.call(this, provider, masterIid, JSON.stringify(messageData));
                    }.bind(this))
                    .then(function(preppedData) {
                        if (preppedData) {
                            return provider.sendMessage(
                                AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER,
                                {
                                    toInstanceId: masterIid,
                                    fromInstanceId: this.instanceId,
                                    data: preppedData
                                }
                            );
                        }
                        else {
                            logger.debug('No encrypted data received');
                        }
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
                        {
                            remotePort: options.port
                        }
                    );
                }.bind(this));
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
     * If the provider supports encryption, initializes and stores keys.
     *
     * Called with this bound to the caller.
     */
    var initEncryption = function(provider, bigIp) {
        const PRIVATE_KEY_OUT_FILE = '/tmp/tempPrivateKey.pem';

        var passphrase;

        if (provider.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
            logger.debug("Generating public/private keys for autoscaling.");
            return cryptoUtil.generateRandomBytes(PASSPHRASE_LENGTH, 'base64')
                .then(function(response) {
                    passphrase = response;
                    return cryptoUtil.generateKeyPair(PRIVATE_KEY_OUT_FILE, {passphrase: passphrase, keyLength: '3072'});
                })
                .then(function(publicKey) {
                    return provider.putPublicKey(this.instanceId, publicKey);
                }.bind(this))
                .then(function() {
                    return bigIp.installPrivateKey(PRIVATE_KEY_OUT_FILE, AUTOSCALE_PRIVATE_KEY_FOLDER, AUTOSCALE_PRIVATE_KEY, {passphrase: passphrase});
                })
                .then(function() {
                    return bigIp.save();
                });
        }
        else {
            return q();
        }
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
     * @param {Object}        bigIp - bigIp instances
     * @param {Buffer|Stream} ucsData - Either a Buffer or a ReadableStream containing UCS data
     * @param {String}        cloudProvider - Cloud provider (aws, azure, etc)
     *
     * @returns {Promise} Promise that will be resolved when the UCS is loaded or rejected
     *                    if an error occurs.
     */
    var loadUcs = function(provider, bigIp, ucsData, cloudProvider) {
        const timeStamp = Date.now();
        const originalPath = '/config/ucsOriginal_' + timeStamp + '.ucs';
        const updatedPath = '/config/ucsUpdated_' + timeStamp + '.ucs';
        const updateScript = '/config/cloud/' + cloudProvider + '/node_modules/f5-cloud-libs/scripts/updateAutoScaleUcs';

        var deferred = q.defer();
        var originalFile;

        var doLoad = function() {
            var childProcess = require('child_process');
            var args = ['--original-ucs', originalPath, '--updated-ucs', updatedPath, '--cloud-provider', cloudProvider];
            var loadUcsOptions = {
                initLocalKeys: true
            };
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

                // If we're not sharing the password, put our current user back after
                // load
                if (!provider.hasFeature(AutoscaleProvider.FEATURE_SHARED_PASSWORD)) {
                    loadUcsOptions.restoreUser = true;
                }

                bigIp.loadUcs(updatedPath, {"no-license": true, "reset-trust": true}, loadUcsOptions)
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
                        logger.info('error loading ucs', err);
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

    var prepareMessageData = function(provider, instanceId, messageData) {
        if (!provider.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
            return q(messageData);
        }
        return util.tryUntil(provider, util.SHORT_RETRY, provider.getPublicKey, [instanceId])
            .then(function(publicKey) {
                return cryptoUtil.encrypt(publicKey, messageData);
            }.bind(this));
    };

    var readMessageData = function(provider, bigIp, messageData) {
        var filePromise;

        if (!provider.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
            return q(messageData);
        }

        if (!this.cloudPrivateKeyPath) {
            logger.silly('getting private key path');
            filePromise = bigIp.getPrivateKeyFilePath(AUTOSCALE_PRIVATE_KEY_FOLDER, AUTOSCALE_PRIVATE_KEY);
        }
        else {
            logger.silly('using cached key');
            filePromise = q(this.cloudPrivateKeyPath);
        }

        return filePromise
            .then(function(cloudPrivateKeyPath) {
                this.cloudPrivateKeyPath = cloudPrivateKeyPath;
                return bigIp.getPrivateKeyMetadata(AUTOSCALE_PRIVATE_KEY_FOLDER, AUTOSCALE_PRIVATE_KEY);
            }.bind(this))
            .then(function(privateKeyData) {
                return cryptoUtil.decrypt(
                    this.cloudPrivateKeyPath,
                    messageData,
                    {
                        passphrase: privateKeyData.passphrase,
                        passphraseEncrypted: true
                    }
                );
            }.bind(this));
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
