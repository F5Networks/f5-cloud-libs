/**
 * Copyright 2016-2018 F5 Networks, Inc.
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

const fs = require('fs');
const q = require('q');
const AutoscaleProvider = require('../lib/autoscaleProvider');
const util = require('../lib/util');
const cryptoUtil = require('../lib/cryptoUtil');
const childProcess = require('child_process');

const BigIp = require('../lib/bigIp');
const Logger = require('../lib/logger');
const cloudProviderFactory = require('../lib/cloudProviderFactory');
const dnsProviderFactory = require('../lib/dnsProviderFactory');
const ipc = require('../lib/ipc');
const commonOptions = require('./commonOptions');

(function run() {
    const MAX_DISCONNECTED_MS = 3 * 60000; // 3 minutes
    const MIN_MS_BETWEEN_JOIN_REQUESTS = 5 * 60000; // 5 minutes
    const MASTER_FILE_PATH = '/config/cloud/master';

    const INSTANCE_STATUS_BECOMING_MASTER = 'BECOMING_MASTER';
    const INSTANCE_STATUS_OK = 'OK';

    const PASSPHRASE_LENGTH = 18;

    const AUTOSCALE_PRIVATE_KEY = 'cloudLibsAutoscalePrivate';
    const AUTOSCALE_PRIVATE_KEY_FOLDER = 'CloudLibsAutoscale';

    let logger;

    const runner = {

        /**
         * Runs the autoscale script
         *
         * Provider is passed in only for testing. In production, provider will be instantiated
         * based on the --cloud option
         *
         * @param {String[]} argv                        - The process arguments.
         * @param {Ojbect}   [testOpts]                  - Options used during testing
         * @param {Object}   [testOpts.autoscleProvider] - Mock for provider.
         * @param {Object}   [testOpts.bigIp]            - Mock for BigIp.
         * @param {Function} [cb]                        - Optional cb to call when done
         */
        run(argv, testOpts, cb) {
            const DEFAULT_LOG_FILE = '/tmp/autoscale.log';
            const ARGS_FILE_ID = `autoscale_${Date.now()}`;
            const KEYS_TO_MASK = ['-p', '--password'];

            const loggerOptions = {};
            const providerOptions = {};
            const dnsProviderOptions = {};
            const optionsForTest = {};

            let externalTag = {};
            let bigIp;
            let loggableArgs;
            let logFileName;
            let masterInstance;
            let masterIid;
            let masterBad;
            let masterBadReason;
            let newMaster;
            let asProvider;
            let dnsProvider;

            Object.assign(optionsForTest, testOpts);

            try {
                /* eslint-disable max-len */
                const options = commonOptions.getCommonOptions(DEFAULT_LOG_FILE)
                    .option(
                        '--cloud <cloud_provider>',
                        'Cloud provider (aws | azure | etc.)'
                    )
                    .option(
                        '--provider-options <cloud_options>',
                        'Options specific to cloud_provider. Ex: param1:value1,param2:value2',
                        util.map,
                        providerOptions
                    )
                    .option(
                        '-c, --cluster-action <type>',
                        'join (join a cluster) | update (update cluster to match existing instances | unblock-sync (allow other devices to sync to us)'
                    )
                    .option(
                        '--device-group <device_group>',
                        'Device group name.'
                    )
                    .option(
                        '    --full-load-on-sync',
                        '    Enable full load on sync. Default false.'
                    )
                    .option(
                        '    --asm-sync',
                        '    Enable ASM sync. Default false. Default false.'
                    )
                    .option(
                        '    --network-failover',
                        '    Enable network failover. Default false.'
                    )
                    .option(
                        '    --no-auto-sync',
                        '    Enable auto sync. Default false (auto sync).'
                    )
                    .option(
                        '    --no-save-on-auto-sync',
                        '    Enable save on sync if auto sync is enabled. Default false (save on auto sync).'
                    )
                    .option(
                        '--block-sync',
                        'If this device is master, do not allow other devices to sync to us. This prevents other devices from syncing to it until we are called again with --cluster-action unblock-sync.'
                    )
                    .option(
                        '--static',
                        'Indicates that this instance is not autoscaled. Default false (instance is autoscaled)'
                    )
                    .option(
                        '--external-tag <tag>',
                        'If there are instances in the autoscale cluster that are not autoscaled, the cloud tag applied to those instances. Format \'key:<tag_key>,value:<tag_value>\'', util.map, externalTag
                    )
                    .option(
                        '--license-pool',
                        'BIG-IP was licensed from a BIG-IQ license pool. This is so licenses can be revoked when BIG-IPs are scaled in. Supply the following:'
                    )
                    .option(
                        '    --big-iq-host <ip_address or FQDN>',
                        '    IP address or FQDN of BIG-IQ'
                    )
                    .option(
                        '    --big-iq-user <user>',
                        '    BIG-IQ admin user name'
                    )
                    .option(
                        '    --big-iq-password <password>',
                        '    BIG-IQ admin user password.'
                    )
                    .option(
                        '    --big-iq-password-uri <password_uri>',
                        '    URI (file, http(s), arn) to location that contains BIG-IQ admin user password. Use this or --big-iq-password.'
                    )
                    .option(
                        '    --license-pool-name <pool_name>',
                        '    Name of BIG-IQ license pool.'
                    )
                    .option(
                        '    --big-ip-mgmt-address <big_ip_address>',
                        '    IP address or FQDN of BIG-IP management port. Use this if BIG-IP reports an address not reachable from BIG-IQ.'
                    )
                    .option(
                        '    --big-ip-mgmt-port <big_ip_port>',
                        '    Port for the management address. Use this if the BIG-IP is not reachable from BIG-IQ via the port used in --port'
                    )
                    .option(
                        '--dns <dns_provider>',
                        '    Update the specified DNS provider when autoscaling occurs (gtm is the only current provider)'
                    )
                    .option(
                        '    --dns-ip-type <address_type>',
                        '    Type of ip address to use (public | private).'
                    )
                    .option(
                        '    --dns-app-port <port>',
                        '    Port on which application is listening on for health check'
                    )
                    .option(
                        '    --dns-provider-options <dns_provider_options>',
                        '    Options specific to dns_provider. Ex: param1:value1,param2:value2',
                        util.map,
                        dnsProviderOptions
                    )
                    .parse(argv);
                /* eslint-enable max-len */

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
                    util.logAndExit('One of --password or --password-url is required.', 'error', 1);
                }

                // When running in cloud init, we need to exit so that cloud init can complete and
                // allow the BIG-IP services to start
                if (options.background) {
                    logFileName = options.output || DEFAULT_LOG_FILE;
                    logger.info('Spawning child process to do the work. Output will be in', logFileName);
                    util.runInBackgroundAndExit(process, logFileName);
                }

                // Log the input, but don't log passwords
                loggableArgs = argv.slice();
                for (let i = 0; i < loggableArgs.length; i++) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = '*******';
                    }
                }
                logger.info(`${loggableArgs[1]} called with`, loggableArgs.join(' '));

                // Get the concrete autoscale provider instance
                asProvider = optionsForTest.autoscaleProvider;
                if (!asProvider) {
                    asProvider = cloudProviderFactory.getCloudProvider(
                        options.cloud,
                        {
                            loggerOptions,
                            clOptions: options
                        }
                    );
                }

                // If updating DNS, get the concrete DNS provider instance
                if (options.dns) {
                    dnsProvider = dnsProviderFactory.getDnsProvider(
                        options.dns,
                        {
                            loggerOptions,
                            clOptions: options
                        }
                    );
                }

                // Save args in restart script in case we need to reboot to recover from an error
                util.saveArgs(argv, ARGS_FILE_ID)
                    .then(() => {
                        if (options.waitFor) {
                            logger.info('Waiting for', options.waitFor);
                            return ipc.once(options.waitFor);
                        }
                        return q();
                    })
                    .then(() => {
                        // Whatever we're waiting for is done, so don't wait for
                        // that again in case of a reboot
                        return util.saveArgs(argv, ARGS_FILE_ID, ['--wait-for']);
                    })
                    .then(() => {
                        logger.info('Initializing autoscale provider');
                        return asProvider.init(providerOptions, { autoscale: true });
                    })
                    .then(() => {
                        if (options.dns) {
                            logger.info('Initializing DNS provider');
                            return dnsProvider.init(dnsProviderOptions);
                        }
                        return q();
                    })
                    .then(() => {
                        logger.info('Getting this instance ID.');
                        return asProvider.getInstanceId();
                    })
                    .then((response) => {
                        logger.debug('This instance ID:', response);
                        this.instanceId = response;

                        logger.info('Getting info on all instances.');
                        if (Object.keys(externalTag).length === 0) {
                            externalTag = undefined;
                        }
                        return asProvider.getInstances({ externalTag });
                    })
                    .then((response) => {
                        this.instances = response || {};
                        logger.debug('instances:', this.instances);

                        if (Object.keys(this.instances).length === 0) {
                            util.logAndExit('Instance list is empty. Exiting.', 'error', 1);
                        }

                        this.instance = this.instances[this.instanceId];
                        if (!this.instance) {
                            util.logAndExit('Our instance ID is not in instance list. Exiting', 'error', 1);
                        }

                        this.instance.status = this.instance.status || INSTANCE_STATUS_OK;
                        logger.silly('Instance status:', this.instance.status);

                        if (this.instance.status === INSTANCE_STATUS_BECOMING_MASTER) {
                            util.logAndExit('Currently becoming master. Exiting.', 'info');
                        }

                        return asProvider.putInstance(this.instanceId, this.instance);
                    })
                    .then(() => {
                        if (optionsForTest.bigIp) {
                            bigIp = optionsForTest.bigIp;
                            return q();
                        }
                        bigIp = new BigIp({ loggerOptions });

                        logger.info('Initializing BIG-IP.');
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
                    })
                    .then(() => {
                        return asProvider.bigIpReady();
                    })
                    .then(() => {
                        return bigIp.deviceInfo();
                    })
                    .then((response) => {
                        this.instance.version = response.version;
                        markVersions(this.instances);
                        return asProvider.putInstance(this.instanceId, this.instance);
                    })
                    .then(() => {
                        let status = AutoscaleProvider.STATUS_UNKNOWN;

                        logger.info('Determining master instance id.');
                        masterInstance = getMasterInstance(this.instances);

                        if (masterInstance) {
                            if (!masterInstance.instance.versionOk) {
                                masterBadReason = 'version not most recent in group';
                                logger.silly(masterBadReason);
                                status = AutoscaleProvider.STATUS_VERSION_NOT_UP_TO_DATE;
                                masterBad = true;
                            } else if (!isMasterExternalValueOk(masterInstance.id, this.instances)) {
                                // if there are external instances in the mix, make sure the master
                                // is one of them
                                masterBadReason = 'master is not external, but there are external instances';
                                logger.silly(masterBadReason);
                                status = AutoscaleProvider.STATUS_NOT_EXTERNAL;
                                masterBad = true;
                            } else if (!masterInstance.instance.providerVisible) {
                                // The cloud provider does not currently see this instance
                                status = AutoscaleProvider.STATUS_NOT_IN_CLOUD_LIST;
                            } else {
                                masterIid = masterInstance.id;

                                if (this.instanceId === masterIid) {
                                    this.instance.isMaster = true;
                                }

                                status = AutoscaleProvider.STATUS_OK;
                            }
                        }

                        return updateMasterStatus.call(this, asProvider, status);
                    })
                    .then(() => {
                        // If the master is not visible, check to see if it's been gone
                        // for a while or if this is a random error
                        if (masterInstance && !masterBad && isMasterExpired(this.instance)) {
                            masterBad = true;
                            masterBadReason = 'master is expired';
                        }

                        if (masterIid) {
                            logger.info('Possible master ID:', masterIid);
                            return asProvider.isValidMaster(masterIid, this.instances);
                        } else if (masterBad) {
                            logger.info('Old master no longer valid:', masterBadReason);
                            return q();
                        }

                        logger.info('No master ID found.');
                        return q();
                    })
                    .then((validMaster) => {
                        logger.silly(
                            'validMaster:',
                            validMaster,
                            ', masterInstance: ',
                            masterInstance,
                            ', masterBad:',
                            masterBad
                        );

                        if (validMaster) {
                            // true validMaster means we have a valid masterIid, just pass it on
                            logger.info('Valid master ID:', masterIid);
                            return masterIid;
                        }

                        // false or undefined validMaster means no masterIid or invalid masterIid
                        if (validMaster === false) {
                            logger.info('Invalid master ID:', masterIid);
                            asProvider.masterInvalidated(masterIid);
                        }

                        // if no master, master is visible or expired, elect, otherwise, wait
                        if (!masterInstance ||
                            masterInstance.instance.providerVisible ||
                            masterBad) {
                            logger.info('Electing master.');
                            return asProvider.electMaster(this.instances);
                        }
                        return q();
                    })
                    .then((response) => {
                        const now = new Date();

                        if (response) {
                            // we just elected a master
                            masterIid = response;
                            this.instance.isMaster = (this.instanceId === masterIid);
                            logger.info('Using master ID:', masterIid);
                            logger.info(
                                'This instance',
                                (this.instance.isMaster ? 'is' : 'is not'),
                                'master'
                            );

                            if (this.instance.masterStatus.instanceId !== masterIid) {
                                logger.info('New master elected');
                                newMaster = true;

                                this.instance.masterStatus = {
                                    instanceId: masterIid,
                                    status: AutoscaleProvider.STATUS_OK,
                                    lastUpdate: now,
                                    lastStatusChange: now
                                };

                                return asProvider.putInstance(this.instanceId, this.instance);
                            }
                        }
                        return q();
                    })
                    .then(() => {
                        if (this.instance.isMaster && newMaster) {
                            this.instance.status = INSTANCE_STATUS_BECOMING_MASTER;
                            return asProvider.putInstance(this.instanceId, this.instance);
                        }
                        return q();
                    })
                    .then(() => {
                        if (this.instance.isMaster && newMaster) {
                            return becomeMaster.call(this, asProvider, bigIp, options);
                        }
                        return q();
                    })
                    .then((response) => {
                        if (this.instance.status === INSTANCE_STATUS_BECOMING_MASTER && response === true) {
                            this.instance.status = INSTANCE_STATUS_OK;
                            logger.silly('Became master');
                            return asProvider.putInstance(this.instanceId, this.instance);
                        } else if (response === false) {
                            logger.warn('Error writing master file');
                        }
                        return q();
                    })
                    .then(() => {
                        if (masterIid && this.instance.status === INSTANCE_STATUS_OK) {
                            return asProvider.masterElected(masterIid);
                        }
                        return q();
                    })
                    .then(() => {
                        let message;
                        if (this.instance.status === INSTANCE_STATUS_OK) {
                            switch (options.clusterAction) {
                            case 'join':
                                return handleJoin.call(
                                    this,
                                    asProvider,
                                    bigIp,
                                    masterIid,
                                    masterBad,
                                    options
                                );
                            case 'update':
                                return handleUpdate.call(
                                    this,
                                    asProvider,
                                    bigIp,
                                    masterIid,
                                    masterBad,
                                    options
                                );
                            case 'unblock-sync':
                                logger.info('Cluster action UNBLOCK-SYNC');
                                return bigIp.cluster.configSyncIp(this.instance.privateIp);
                            default:
                                message = `Unknown cluster action ${options.clusterAction}`;
                                logger.warn(message);
                                return q.reject(message);
                            }
                        } else {
                            logger.debug('Instance status not OK. Waiting.', this.instance.status);
                            return q();
                        }
                    })
                    .then(() => {
                        if (this.instance.status === INSTANCE_STATUS_OK) {
                            if (asProvider.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
                                logger.info('Checking for messages');
                                return handleMessages.call(this, asProvider, bigIp, options);
                            }
                        } else {
                            logger.debug('Instance status not OK. Waiting.', this.instance.status);
                        }
                        return q();
                    })
                    .then(() => {
                        if (options.dns) {
                            logger.info('Updating DNS');

                            const instancesForDns = [];

                            Object.keys(this.instances).forEach((instanceId) => {
                                const instance = this.instances[instanceId];
                                const ip =
                                    (options.dnsIpType === 'public' ? instance.publicIp : instance.privateIp);

                                instancesForDns.push(
                                    {
                                        ip,
                                        name: instance.hostname,
                                        port: options.dnsAppPort
                                    }
                                );
                            });
                            return dnsProvider.update(instancesForDns);
                        }
                        return q();
                    })
                    .catch((err) => {
                        logger.error(err);
                        return err;
                    })
                    .done((err) => {
                        util.deleteArgs(ARGS_FILE_ID);

                        if (cb) {
                            cb(err);
                        }

                        // Exit so that any listeners don't keep us alive
                        util.logAndExit('Autoscale finished.');
                    });

                // If we reboot, exit - otherwise cloud providers won't know we're done
                ipc.once('REBOOT')
                    .then(() => {
                        util.logAndExit('REBOOT signaled. Exiting.');
                    });
            } catch (err) {
                if (logger) {
                    logger.error('autoscale error:', err);
                }

                if (cb) {
                    cb();
                }
            }
        }
    };

    /**
     * Handles --cluster-action join
     *
     * Called with this bound to the caller
     */
    function handleJoin(provider, bigIp, masterIid, masterBad, options) {
        const deferred = q.defer();

        logger.info('Cluster action JOIN');

        logger.info('Initializing encryption');
        initEncryption.call(this, provider, bigIp)
            .then(() => {
                let promise;

                // If we are master and are replacing an expired master, other instances
                // will join to us. Just set our config sync ip.
                if (this.instance.isMaster) {
                    if (!provider.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
                        logger.info('Storing master credentials.');
                        promise = provider.putMasterCredentials();
                    } else {
                        promise = q();
                    }

                    promise
                        .then((response) => {
                            logger.debug(response);

                            // Configure cm configsync-ip on this BIG-IP node
                            if (!options.blockSync) {
                                logger.info('Setting config sync IP.');
                                return bigIp.cluster.configSyncIp(this.instance.privateIp);
                            }
                            logger.info('Not seting config sync IP because block-sync is specified.');
                            return q();
                        })
                        .then(() => {
                            deferred.resolve();
                        })
                        .catch((err) => {
                            // rethrow here, otherwise error is hidden
                            throw err;
                        });
                } else {
                    // We're not the master

                    // Make sure the master file is not on our disk
                    if (fs.existsSync(MASTER_FILE_PATH)) {
                        fs.unlinkSync(MASTER_FILE_PATH);
                    }

                    // Configure cm configsync-ip on this BIG-IP node and join the cluster
                    logger.info('Setting config sync IP.');
                    bigIp.cluster.configSyncIp(this.instance.privateIp)
                        .then(() => {
                            // If there is a master, join it. Otherwise wait for an update event
                            // when we have a master.
                            if (masterIid) {
                                return joinCluster.call(this, provider, bigIp, masterIid, options);
                            }
                            return q();
                        })
                        .then(() => {
                            deferred.resolve();
                        })
                        .catch((err) => {
                            // rethrow here, otherwise error is hidden
                            throw err;
                        });
                }
            });

        return deferred.promise;
    }

    /**
     * Handles --cluster-action update
     *
     * Called with this bound to the caller
     */
    function handleUpdate(provider, bigIp, masterIid, masterBad, options) {
        logger.info('Cluster action UPDATE');

        if (this.instance.isMaster && !masterBad) {
            return checkForDisconnectedDevices.call(this, bigIp);
        } else if (!this.instance.isMaster) {
            // We're not the master, make sure the master file is not on our disk
            if (fs.existsSync(MASTER_FILE_PATH)) {
                fs.unlinkSync(MASTER_FILE_PATH);
            }

            // If there is a new master, join the cluster
            if (masterBad && masterIid) {
                return joinCluster.call(this, provider, bigIp, masterIid, options);
            } else if (masterIid) {
                // Double check that we are clustered
                return bigIp.list('/tm/cm/trust-domain/Root')
                    .then((response) => {
                        if (!response || response.status === 'standalone') {
                            logger.info('This instance is not in cluster. Requesting join.');
                            return joinCluster.call(this, provider, bigIp, masterIid, options);
                        }
                        return q();
                    })
                    .catch((err) => {
                        throw err;
                    });
            }
        }
        return q();
    }

    /**
     * Called with this bound to the caller
     */
    function handleMessages(provider, bigIp, options) {
        const deferred = q.defer();
        const instanceIdsBeingAdded = [];
        const actions = [];
        const actionPromises = [];

        let messageMetadata = [];

        if (this.instance.isMaster && !options.blockSync) {
            actions.push(AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER);
        }

        if (!this.instance.isMaster) {
            actions.push(AutoscaleProvider.MESSAGE_SYNC_COMPLETE);
        }

        provider.getMessages(actions, { toInstanceId: this.instanceId })
            .then((messages) => {
                const readPromises = [];
                const messagesArray = messages ? messages.slice() : [];

                logger.debug('Handling', messages.length, 'message(s)');

                messagesArray.forEach((message) => {
                    messageMetadata.push(
                        {
                            action: message.action,
                            toInstanceId: message.toInstanceId,
                            fromInstanceId: message.fromInstanceId
                        }
                    );
                    readPromises.push(readMessageData.call(this, provider, bigIp, message.data));
                });

                logger.silly('number of messages to read:', readPromises.length);

                return q.all(readPromises);
            })
            .then((readMessages) => {
                let metadata;
                let messageData;

                const alreadyAdding = function (instanceId) {
                    return instanceIdsBeingAdded.find((element) => {
                        return instanceId === element.toInstanceId;
                    });
                };

                const readMessagesArray = readMessages ? readMessages.slice() : [];

                logger.silly('number of read messages:', readMessagesArray.length);

                for (let i = 0; i < readMessagesArray.length; ++i) {
                    metadata = messageMetadata[i];
                    logger.silly('metadata:', metadata);

                    try {
                        messageData = JSON.parse(readMessagesArray[i]);
                    } catch (err) {
                        logger.warn('JSON.parse error:', err);
                        messageData = undefined;
                        deferred.reject(new Error('Unable to JSON parse message'));
                    }

                    if (messageData) {
                        let discard = false;
                        switch (metadata.action) {
                        // Add an instance to our cluster
                        case AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER:
                            logger.silly('message MESSAGE_ADD_TO_CLUSTER');

                            if (alreadyAdding(metadata.fromInstanceId)) {
                                logger.debug('Already adding', metadata.fromInstanceId, ', discarding');
                                discard = true;
                            }

                            if (!discard) {
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
                            }

                            break;

                        // sync is complete
                        case AutoscaleProvider.MESSAGE_SYNC_COMPLETE:
                            logger.silly('message MESSAGE_SYNC_COMPLETE');
                            actionPromises.push(
                                provider.syncComplete(messageData.fromUser, messageData.fromPassword)
                            );

                            break;
                        default:
                            logger.warn('Unknown message action', metadata.action);
                        }
                    }
                }

                return q.all(actionPromises);
            })
            .then((responses) => {
                const messagePromises = [];
                let messageData;

                const responsesArray = responses ? responses.slice() : [];

                if (instanceIdsBeingAdded.length > 0) {
                    messageMetadata = [];

                    logger.silly('responses from join cluster', responsesArray);
                    for (let i = 0; i < responsesArray.length; i++) {
                        // responsesArray[i] === true iff that instance was successfully synced
                        if (responsesArray[i] === true) {
                            logger.silly(
                                'sync is complete for instance',
                                instanceIdsBeingAdded[i].toInstanceId
                            );

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
            })
            .then((preppedMessageData) => {
                const syncCompletePromises = [];
                let metadata;
                let messageData;

                for (let i = 0; i < preppedMessageData.length; i++) {
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
            })
            .then(() => {
                deferred.resolve();
            })
            .catch((err) => {
                logger.warn('Error handling messages', err);
                deferred.reject(err);
            });

        return deferred.promise;
    }

    /**
     * Handles becoming master.
     *
     * @returns {Promise} promise which is resolved tieh true if successful
     */
    function becomeMaster(provider, bigIp, options) {
        let hasUcs = false;

        logger.info('Becoming master.');
        logger.info('Checking for backup UCS.');

        return provider.getStoredUcs()
            .then((response) => {
                if (response) {
                    hasUcs = true;
                    return loadUcs(provider, bigIp, response, options.cloud);
                }
                return q();
            })
            .then(() => {
                // If we loaded UCS, re-initialize encryption so our keys
                // match each other
                if (hasUcs) {
                    return initEncryption.call(this, provider, bigIp);
                }
                return q();
            })
            .then(() => {
                // Make sure we have our own hostname
                if (!this.instance.hostname) {
                    return bigIp.list('/tm/sys/global-settings');
                }
                return q();
            })
            .then((globalSettings) => {
                const hostname = globalSettings ? globalSettings.hostname : undefined;

                if (!this.instance.hostname && hostname) {
                    this.instance.hostname = hostname;
                } else {
                    logger.debug('hostname not found in this.instance or globalSettings');
                }

                // Make sure device group exists
                logger.info('Creating device group.');

                const deviceGroupOptions = {
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
            })
            .then(() => {
                logger.info('Writing master file.');
                return writeMasterFile(hasUcs);
            });
    }

    /**
     * Called with this bound to the caller
     */
    function joinCluster(provider, bigIp, masterIid, options) {
        const TEMP_USER_NAME_LENGHTH = 10; // these are hex bytes - user name will be 20 chars
        const TEMP_USER_PASSWORD_LENGTH = 24; // use a multiple of 6 to prevent '=' at the end

        const now = new Date();

        let managementIp;
        let tempPassword;
        let tempUser;

        if (!masterIid) {
            return q.reject(new Error('Must have a master ID to join'));
        }

        // don't send request too often - master might be in process of syncing
        this.instance.lastJoinRequest = this.instance.lastJoinRequest || new Date(1970, 0);
        const elapsedMsFromLastJoin = now - new Date(this.instance.lastJoinRequest);
        if (elapsedMsFromLastJoin < MIN_MS_BETWEEN_JOIN_REQUESTS) {
            logger.silly('Join request is too soon after last join request.', elapsedMsFromLastJoin, 'ms');
            return q();
        }

        logger.info('Joining cluster.');

        if (provider.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
            logger.debug('Resetting current device trust');
            this.instance.lastJoinRequest = now;
            return provider.putInstance(this.instanceId, this.instance)
                .then((response) => {
                    logger.debug(response);
                    return bigIp.cluster.resetTrust();
                })
                .then((response) => {
                    logger.debug(response);

                    // Make sure we don't have a current copy of the device group
                    return bigIp.cluster.deleteDeviceGroup(options.deviceGroup);
                })
                .then((response) => {
                    logger.debug(response);
                    return bigIp.deviceInfo();
                })
                .then((response) => {
                    managementIp = response.managementAddress;

                    // Get a random user name to use
                    return cryptoUtil.generateRandomBytes(TEMP_USER_NAME_LENGHTH, 'hex');
                })
                .then((respomse) => {
                    tempUser = respomse;

                    // Get a random password for the user
                    return cryptoUtil.generateRandomBytes(TEMP_USER_PASSWORD_LENGTH, 'base64');
                })
                .then((response) => {
                    tempPassword = response;

                    // Create the temp user account
                    return bigIp.onboard.updateUser(tempUser, tempPassword, 'admin');
                })
                .then(() => {
                    logger.debug('Sending message to join cluster.');

                    const messageData = {
                        host: managementIp,
                        port: bigIp.port,
                        username: tempUser,
                        password: tempPassword,
                        hostname: this.instance.hostname,
                        deviceGroup: options.deviceGroup
                    };

                    return prepareMessageData.call(this, provider, masterIid, JSON.stringify(messageData));
                })
                .then((preppedData) => {
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
                    logger.debug('No encrypted data received');
                    return q();
                })
                .catch((err) => {
                    // need to bubble up nested errors
                    return q.reject(err);
                });
        }

        const masterInstance = this.instances[masterIid];

        logger.debug('Resetting current device trust');
        return bigIp.cluster.resetTrust()
            .then((response) => {
                logger.debug(response);

                // Make sure we don't have a current copy of the device group
                return bigIp.cluster.deleteDeviceGroup(options.deviceGroup);
            })
            .then((response) => {
                logger.debug(response);
                return provider.getMasterCredentials(masterInstance.mgmtIp, options.port);
            })
            .then((credentials) => {
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
            });
    }

    /**
     * Called with this bound to the caller
     */
    function checkForDisconnectedDevices(bigIp) {
        return bigIp.cluster.getCmSyncStatus()
            .then((response) => {
                logger.silly('cmSyncStatus:', response);

                const disconnected = response ? response.disconnected : [];
                const hostnames = [];
                const hostnamesToRemove = [];

                // response is an object of two lists (connected/disconnected) from getCmSyncStatus()
                if (disconnected.length > 0) {
                    logger.info('Possibly disconnected devices:', disconnected);

                    // get a list of hostnames still in the instances list
                    Object.keys(this.instances).forEach((instanceId) => {
                        hostnames.push(this.instances[instanceId].hostname);
                    });

                    // make sure this is not still in the instances list
                    disconnected.forEach((hostname) => {
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
                return q();
            })
            .catch((err) => {
                logger.warn('Could not get sync status');
                return q.reject(err);
            });
    }

    /**
     * If the provider supports encryption, initializes and stores keys.
     *
     * Called with this bound to the caller.
     */
    function initEncryption(provider, bigIp) {
        const PRIVATE_KEY_OUT_FILE = '/tmp/tempPrivateKey.pem';

        let passphrase;

        if (provider.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
            logger.debug('Generating public/private keys for autoscaling.');
            return cryptoUtil.generateRandomBytes(PASSPHRASE_LENGTH, 'base64')
                .then((response) => {
                    passphrase = response;
                    return cryptoUtil.generateKeyPair(
                        PRIVATE_KEY_OUT_FILE,
                        { passphrase, keyLength: '3072' }
                    );
                })
                .then((publicKey) => {
                    return provider.putPublicKey(this.instanceId, publicKey);
                })
                .then(() => {
                    return bigIp.installPrivateKey(
                        PRIVATE_KEY_OUT_FILE,
                        AUTOSCALE_PRIVATE_KEY_FOLDER,
                        AUTOSCALE_PRIVATE_KEY,
                        { passphrase }
                    );
                })
                .then(() => {
                    return bigIp.save();
                });
        }
        return q();
    }

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
    function getMasterInstance(instances) {
        let instanceId;

        const instanceIds = Object.keys(instances);
        for (let i = 0; i < instanceIds.length; i++) {
            instanceId = instanceIds[i];
            if (instances[instanceId].isMaster) {
                return {
                    id: instanceId,
                    instance: instances[instanceId]
                };
            }
        }
        return null;
    }

    /**
     * Checks that master instance has the most recent
     * version of all the BIG-IP instances
     *
     * @param {Object} instances - Instances map
     */
    function markVersions(instances) {
        let highestVersion = '0.0.0';
        let instance;

        Object.keys(instances).forEach((instanceId) => {
            instance = instances[instanceId];
            if (instance.version && util.versionCompare(instance.version, highestVersion) > 0) {
                highestVersion = instance.version;
            }
        });

        Object.keys(instances).forEach((instanceId) => {
            instance = instances[instanceId];
            if (!instance.version || util.versionCompare(instance.version, highestVersion) === 0) {
                instance.versionOk = true;
            } else {
                instance.versionOk = false;
            }
        });
    }

    /**
     * Checks that if there are external instances, the master is
     * one of them
     *
     * @param {String} masterId  - Instance ID of master
     * @param {Object} instances - Instances map
     *
     * @returns {Boolean} True if there are no external instances or
     *                    if there are external instances and the master is
     *                    one of them
     */
    function isMasterExternalValueOk(masterId, instances) {
        const instanceIds = Object.keys(instances);
        let instance;
        let hasExternal;

        for (let i = 0; i < instanceIds.length; i++) {
            instance = instances[instanceIds[i]];
            if (instance.external) {
                hasExternal = true;
                break;
            }
        }

        if (hasExternal) {
            return !!instances[masterId].external;
        }

        return true;
    }

    /*
     * Determines if the master status has been bad for more than a certain
     * amount of time.
     *
     * @param {Object} instance - instance as returned by getInstances
     *
     * @returns {Boolean} Whether or not the master status has been bad for too long
     */
    function isMasterExpired(instance) {
        const masterStatus = instance.masterStatus || {};
        let isExpired = false;
        let disconnectedMs;

        if (masterStatus.status !== AutoscaleProvider.STATUS_OK) {
            disconnectedMs = new Date() - new Date(masterStatus.lastStatusChange);
            logger.silly('master has been disconnected for', disconnectedMs.toString(), 'ms');
            if (disconnectedMs > MAX_DISCONNECTED_MS) {
                logger.info('master has been disconnected for too long (', disconnectedMs.toString(), 'ms )');
                isExpired = true;
            }
        }
        return isExpired;
    }

    function updateMasterStatus(provider, status) {
        const now = new Date();
        this.instance.masterStatus = this.instance.masterStatus || {};
        this.instance.masterStatus.lastUpdate = now;
        if (this.instance.masterStatus.status !== status) {
            this.instance.masterStatus.status = status;
            this.instance.masterStatus.lastStatusChange = now;
        }
        return provider.putInstance(this.instanceId, this.instance);
    }

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
    function loadUcs(provider, bigIp, ucsData, cloudProvider) {
        const timeStamp = Date.now();
        const originalPath = `/config/ucsOriginal_${timeStamp}.ucs`;
        const updatedPath = `/config/ucsUpdated_${timeStamp}.ucs`;
        const updateScript =
            `/config/cloud/${cloudProvider}/node_modules/f5-cloud-libs/scripts/updateAutoScaleUcs`;

        const deferred = q.defer();
        let originalFile;

        const preLoad = function () {
            // eslint-disable-next-line max-len
            const sedCommand = "sed -i '/sys dynad key {/ { N ; /\\n[[:space:]]\\+key[[:space:]]*\\$M\\$[^\\n]*/ { N;   /\\n[[:space:]]*}/ { d } } }' /config/bigip_base.conf";
            const loadSysConfigCommand = 'load /sys config';

            logger.silly('removing dynad key from base config');
            return util.runShellCommand(sedCommand)
                .then(() => {
                    logger.silly('loading sys config');
                    return util.runTmshCommand(loadSysConfigCommand);
                })
                .then(() => {
                    logger.silly('waiting for BIG-IP to be ready');
                    return bigIp.ready();
                })
                .catch((err) => {
                    logger.warn('preload of ucs failed:', err);
                    throw err;
                });
        };

        const doLoad = function () {
            const args = [
                '--original-ucs',
                originalPath,
                '--updated-ucs',
                updatedPath,
                '--cloud-provider',
                cloudProvider
            ];
            const loadUcsOptions = {
                initLocalKeys: true
            };

            preLoad()
                .then(() => {
                    childProcess.execFile(updateScript, args, (childProcessErr) => {
                        if (childProcessErr) {
                            const message = `${updateScript} failed: ${childProcessErr}`;
                            logger.warn(message);
                            deferred.reject(new Error(message));
                            return;
                        }

                        if (!fs.existsSync(updatedPath)) {
                            logger.warn(`${updatedPath} does not exist after running ${updateScript}`);
                            deferred.reject(new Error('updated ucs not found'));
                            return;
                        }

                        // If we're not sharing the password, put our current user back after
                        // load
                        if (!provider.hasFeature(AutoscaleProvider.FEATURE_SHARED_PASSWORD)) {
                            loadUcsOptions.restoreUser = true;
                        }

                        bigIp.loadUcs(
                            updatedPath,
                            { 'no-license': true, 'reset-trust': true },
                            loadUcsOptions
                        )
                            .then(() => {
                                // reset-trust on load does not always seem to work
                                // use a belt-and-suspenders approach and reset now as well
                                return bigIp.cluster.resetTrust();
                            })
                            .then(() => {
                                // Attempt to delete the file, but ignore errors
                                try {
                                    fs.unlinkSync(originalPath);
                                    fs.unlinkSync(updatedPath);
                                } finally {
                                    deferred.resolve();
                                }
                            })
                            .catch((err) => {
                                logger.info('error loading ucs', err);
                                deferred.reject(err);
                            });
                    });
                })
                .catch((err) => {
                    throw err;
                });
        };

        // If ucsData has a pipe method (is a stream), use it
        if (ucsData.pipe) {
            logger.silly('ucsData is a Stream');
            originalFile = fs.createWriteStream(originalPath);

            ucsData.pipe(originalFile);

            originalFile.on('finish', () => {
                logger.silly('finished piping ucsData');
                originalFile.close(() => {
                    doLoad();
                });
            });

            originalFile.on('error', (err) => {
                logger.warn('Error piping ucsData', err);
                deferred.reject(err);
            });

            ucsData.on('error', (err) => {
                logger.warn('Error reading ucs data', err);
                deferred.reject(err);
            });
        } else {
            // Otherwise, assume it's a Buffer
            logger.silly('ucsData is a Buffer');
            fs.writeFile(originalPath, ucsData, (err) => {
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
    }

    function writeMasterFile(ucsLoaded) {
        const deferred = q.defer();
        const masterInfo = { ucsLoaded };

        // Mark ourself as master on disk so other scripts have access to this info
        fs.writeFile(MASTER_FILE_PATH, JSON.stringify(masterInfo), (err) => {
            if (err) {
                logger.warn('Error saving master file', err);
                deferred.reject(err);
                return;
            }

            logger.silly('Wrote master file', MASTER_FILE_PATH, masterInfo);
            deferred.resolve(true);
        });

        return deferred.promise;
    }

    function prepareMessageData(provider, instanceId, messageData) {
        if (!provider.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
            return q(messageData);
        }
        return util.tryUntil(provider, util.SHORT_RETRY, provider.getPublicKey, [instanceId])
            .then((publicKey) => {
                return cryptoUtil.encrypt(publicKey, messageData);
            });
    }

    function readMessageData(provider, bigIp, messageData) {
        let filePromise;

        if (!provider.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
            return q(messageData);
        }

        if (!this.cloudPrivateKeyPath) {
            logger.silly('getting private key path');
            filePromise = bigIp.getPrivateKeyFilePath(AUTOSCALE_PRIVATE_KEY_FOLDER, AUTOSCALE_PRIVATE_KEY);
        } else {
            logger.silly('using cached key');
            filePromise = q(this.cloudPrivateKeyPath);
        }

        return filePromise
            .then((cloudPrivateKeyPath) => {
                this.cloudPrivateKeyPath = cloudPrivateKeyPath;
                return bigIp.getPrivateKeyMetadata(AUTOSCALE_PRIVATE_KEY_FOLDER, AUTOSCALE_PRIVATE_KEY);
            })
            .then((privateKeyData) => {
                return cryptoUtil.decrypt(
                    this.cloudPrivateKeyPath,
                    messageData,
                    {
                        passphrase: privateKeyData.passphrase,
                        passphraseEncrypted: true
                    }
                );
            });
    }

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
