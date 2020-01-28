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
const CloudProvider = require('../lib/cloudProvider');
const util = require('../lib/util');
const cryptoUtil = require('../lib/cryptoUtil');
const childProcess = require('child_process');

const BigIp = require('../lib/bigIp');
const AutoscaleInstance = require('../lib/autoscaleInstance');
const Logger = require('../lib/logger');
const cloudProviderFactory = require('../lib/cloudProviderFactory');
const dnsProviderFactory = require('../lib/dnsProviderFactory');
const ipc = require('../lib/ipc');
const commonOptions = require('./commonOptions');
const BACKUP = require('../lib/sharedConstants').BACKUP;

(function run() {
    const MAX_DISCONNECTED_MS = 3 * 60000; // 3 minute
    const MIN_MS_BETWEEN_JOIN_REQUESTS = 5 * 60000; // 5 minutes
    const MASTER_FILE_PATH = '/config/cloud/master';

    const PASSPHRASE_LENGTH = 18;

    const AUTOSCALE_PRIVATE_KEY = 'cloudLibsAutoscalePrivate.key';
    const AUTOSCALE_PRIVATE_KEY_FOLDER = 'CloudLibsAutoscale';

    const UCS_BACKUP_PREFIX = 'ucsAutosave_';
    const UCS_BACKUP_DEFAULT_MAX_FILES = 7;
    const UCS_BACKUP_DIRECTORY = '/var/local/ucs';
    const DEFAULT_AUTOSCALE_TIMEOUT_IN_MINUTES = 10;

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
            const KEYS_TO_MASK = ['-p', '--password', '--big-iq-password'];

            const OPTIONS_TO_UNDEFINE = [
                'bigIqPasswordUri',
                'bigIqPassword',
                'password',
                'passwordUrl'
            ];

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
            let cloudProvider;
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
                        'join (join a cluster) | update (update cluster to match existing instances | unblock-sync (allow other devices to sync to us) | backup-ucs (save a ucs to cloud storage)'
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
                        '    Enable ASM sync. Default sets ASM sync if ASM is provisioned.'
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
                        '    --big-iq-password [password]',
                        '    BIG-IQ admin user password.'
                    )
                    .option(
                        '    --big-iq-password-uri [password_uri]',
                        '    URI (file, http(s), arn) to location that contains BIG-IQ admin user password. Use this or --big-iq-password.'
                    )
                    .option(
                        '    --big-iq-password-encrypted',
                        '    Indicates that the BIG-IQ password is encrypted.'
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
                        '    --no-unreachable',
                        '    Do not use the unreachable API even if it is supported by BIG-IQ.'
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
                    .option(
                        '--max-ucs-files <max_ucs_files_to_save>',
                        'When running cluster action backup-ucs, maximum number of backup files to keep.',
                        UCS_BACKUP_DEFAULT_MAX_FILES
                    )
                    .option(
                        '--autoscale-timeout <autoscale_timeout>',
                        'Number of minutes after which autoscale process should be killed',
                        DEFAULT_AUTOSCALE_TIMEOUT_IN_MINUTES
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

                // Remove specific options with no provided value
                OPTIONS_TO_UNDEFINE.forEach((opt) => {
                    if (typeof options[opt] === 'boolean') {
                        logger.debug(`No value set for option ${opt}. Removing option.`);
                        options[opt] = undefined;
                    }
                });

                // Expose options for test code
                this.options = options;

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
                cloudProvider = optionsForTest.cloudProvider;
                if (!cloudProvider) {
                    cloudProvider = cloudProviderFactory.getCloudProvider(
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
                        if (options.clusterAction === 'join' || options.clusterAction === 'update') {
                            return getAutoscaleProcessInfo();
                        }
                        return q();
                    })
                    .then((results) => {
                        // Stop processing if there is an other running Autoscale process
                        // with cluster action of join or update
                        if (results && results.processCount && results.processCount > 1) {
                            if (results.executionTime
                                && parseInt(results.executionTime, 10) < options.autoscaleTimeout) {
                                util.logAndExit('Another autoscale process already running. ' +
                                    'Exiting.', 'warn', 1);
                            } else {
                                logger.info('Terminating the autoscale script execution.');
                                util.terminateProcessById(results.pid);
                                util.logAndExit(`Autoscale process took longer than
                                configured timeout value (${options.autoscaleTimeout})
                                Autoscale (pid:${results.pid}) was killed`, 'error', 1);
                            }
                        }
                        return q();
                    })
                    .then(() => {
                        logger.info('Initializing autoscale provider');
                        return cloudProvider.init(providerOptions, { autoscale: true });
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
                        return cloudProvider.getInstanceId();
                    })
                    .then((response) => {
                        logger.debug('This instance ID:', response);
                        this.instanceId = response;

                        logger.info('Getting info on all instances.');
                        if (Object.keys(externalTag).length === 0) {
                            externalTag = undefined;
                        }
                        return cloudProvider.getInstances({ externalTag });
                    })
                    .then((response) => {
                        this.instances = response || {};
                        logger.debug('instances:', this.instances);

                        if (Object.keys(this.instances).length === 0) {
                            util.logAndExit('Instance list is empty. Exiting.', 'error', 1);
                            return q();
                        }

                        this.instance = this.instances[this.instanceId];
                        if (!this.instance) {
                            util.logAndExit('Our instance ID is not in instance list. Exiting', 'error', 1);
                            return q();
                        }

                        this.instance.status = this.instance.status || AutoscaleInstance.INSTANCE_STATUS_OK;
                        logger.silly('Instance status:', this.instance.status);

                        if (this.instance.status === AutoscaleInstance.INSTANCE_STATUS_BECOMING_MASTER
                            && !isMasterExpired(this.instance)) {
                            util.logAndExit('Currently becoming master. Exiting.', 'info');
                        }

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
                        return bigIp.list('/tm/sys/global-settings');
                    })
                    .then((globalSettings) => {
                        this.instance.hostname = globalSettings.hostname;
                        return cloudProvider.putInstance(this.instanceId, this.instance);
                    })
                    .then(() => {
                        return cloudProvider.bigIpReady();
                    })
                    .then(() => {
                        return bigIp.deviceInfo();
                    })
                    .then((response) => {
                        this.instance.machineId = response.machineId; // we need this for revoke on BIG-IQ 5.3
                        this.instance.macAddress = response.hostMac; // we need this for revoke on BIG-IQ 5.4
                        this.instance.version = response.version;
                        markVersions(this.instances);
                        return cloudProvider.putInstance(this.instanceId, this.instance);
                    })
                    .then(() => {
                        let status = CloudProvider.STATUS_UNKNOWN;

                        logger.info('Determining master instance id.');
                        masterInstance = getMasterInstance(this.instances);

                        if (masterInstance) {
                            if (!masterInstance.instance.versionOk) {
                                masterBadReason = 'version not most recent in group';
                                logger.silly(masterBadReason);
                                status = CloudProvider.STATUS_VERSION_NOT_UP_TO_DATE;
                                masterBad = true;
                            } else if (!isMasterExternalValueOk(masterInstance.id, this.instances)) {
                                // if there are external instances in the mix, make sure the master
                                // is one of them
                                masterBadReason = 'master is not external, but there are external instances';
                                logger.silly(masterBadReason);
                                status = CloudProvider.STATUS_NOT_EXTERNAL;
                                masterBad = true;
                            } else if (!masterInstance.instance.providerVisible) {
                                // The cloud provider does not currently see this instance
                                status = CloudProvider.STATUS_NOT_IN_CLOUD_LIST;
                            } else {
                                masterIid = masterInstance.id;

                                if (this.instanceId === masterIid) {
                                    this.instance.isMaster = true;
                                }

                                status = CloudProvider.STATUS_OK;
                            }
                        }

                        return updateMasterStatus.call(this, cloudProvider, status);
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
                            return cloudProvider.isValidMaster(masterIid, this.instances);
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
                            cloudProvider.masterInvalidated(masterIid);
                        }

                        // if no master, master is visible or expired, elect, otherwise, wait
                        if (!masterInstance ||
                            masterInstance.instance.providerVisible ||
                            masterBad) {
                            logger.info('Electing master.');
                            return cloudProvider.electMaster(this.instances);
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
                                    status: CloudProvider.STATUS_OK,
                                    lastUpdate: now,
                                    lastStatusChange: now
                                };

                                return cloudProvider.putInstance(this.instanceId, this.instance);
                            }
                        }
                        return q();
                    })
                    .then(() => {
                        if (this.instance.isMaster && newMaster) {
                            this.instance.status = AutoscaleInstance.INSTANCE_STATUS_BECOMING_MASTER;
                            return cloudProvider.putInstance(this.instanceId, this.instance);
                        }
                        return q();
                    })
                    .then(() => {
                        if (this.instance.isMaster && newMaster) {
                            return becomeMaster.call(this, cloudProvider, bigIp, options);
                        }
                        return q();
                    })
                    .then((response) => {
                        if (
                            this.instance.status === AutoscaleInstance.INSTANCE_STATUS_BECOMING_MASTER &&
                            response === true
                        ) {
                            this.instance.status = AutoscaleInstance.INSTANCE_STATUS_OK;
                            logger.silly('Became master');
                            return cloudProvider.putInstance(this.instanceId, this.instance);
                        } else if (response === false) {
                            logger.warn('Error writing master file');
                        }
                        return q();
                    })
                    .then(() => {
                        if (masterIid && this.instance.status === AutoscaleInstance.INSTANCE_STATUS_OK) {
                            return cloudProvider.masterElected(masterIid);
                        }
                        return q();
                    })
                    .then(() => {
                        if (masterIid && this.instance.status === AutoscaleInstance.INSTANCE_STATUS_OK) {
                            return cloudProvider.tagMasterInstance(masterIid, this.instances);
                        }
                        return q();
                    })
                    .then(() => {
                        let message;
                        if (this.instance.status === AutoscaleInstance.INSTANCE_STATUS_OK) {
                            switch (options.clusterAction) {
                            case 'join':
                                logger.info('Cluster action join');
                                return handleJoin.call(
                                    this,
                                    cloudProvider,
                                    bigIp,
                                    masterIid,
                                    options
                                );
                            case 'update':
                                logger.info('Cluster action update');
                                return bigIp.deviceState(this.instance.hostname)
                                    .then((response) => {
                                        if (response && response.configsyncIp !== this.instance.privateIp) {
                                            return bigIp.cluster.configSyncIp(this.instance.privateIp);
                                        }
                                        return q();
                                    })
                                    .then(() => {
                                        return handleUpdate.call(
                                            this,
                                            cloudProvider,
                                            bigIp,
                                            masterIid,
                                            masterBad || newMaster,
                                            options
                                        );
                                    });
                            case 'unblock-sync':
                                logger.info('Cluster action unblock-sync');
                                return bigIp.cluster.configSyncIp(this.instance.privateIp);
                            case 'backup-ucs':
                                logger.info('Cluster action backup-ucs');
                                return handleBackupUcs.call(this, cloudProvider, bigIp, options);
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
                        if (this.instance.status === AutoscaleInstance.INSTANCE_STATUS_OK) {
                            if (cloudProvider.hasFeature(CloudProvider.FEATURE_MESSAGING)
                                && (options.clusterAction === 'join' || options.clusterAction === 'update')) {
                                logger.info('Checking for messages');
                                return handleMessages.call(this, cloudProvider, bigIp, options);
                            }
                        } else {
                            logger.debug('Instance status not OK. Waiting.', this.instance.status);
                        }
                        return q();
                    })
                    .then(() => {
                        if (options.dns
                            && (options.clusterAction === 'join' || options.clusterAction === 'update')) {
                            logger.info('Updating DNS');

                            const instancesForDns = [];

                            Object.keys(this.instances).forEach((instanceId) => {
                                const instance = this.instances[instanceId];
                                const ip =
                                    (options.dnsIpType === 'public' ? instance.publicIp : instance.privateIp);

                                if (instance.hostname) {
                                    instancesForDns.push(
                                        {
                                            ip,
                                            name: instance.hostname,
                                            port: options.dnsAppPort
                                        }
                                    );
                                }
                            });
                            return dnsProvider.update(instancesForDns);
                        }
                        return q();
                    })
                    .catch((err) => {
                        if (err && err.code && err.message) {
                            logger.error('autoscaling error code:', err.code, 'message:', err.message);
                        } else {
                            logger.error('autoscaling error:', err && err.message ? err.message : err);
                        }
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
    function handleJoin(provider, bigIp, masterIid, options) {
        const deferred = q.defer();

        logger.info('Cluster action JOIN');

        logger.info('Initializing encryption');
        initEncryption.call(this, provider, bigIp)
            .then(() => {
                let promise;

                // If we are master and are replacing an expired master, other instances
                // will join to us. Just set our config sync ip.
                if (this.instance.isMaster) {
                    if (!provider.hasFeature(CloudProvider.FEATURE_MESSAGING)) {
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
    function handleUpdate(provider, bigIp, masterIid, masterBadOrNew, options) {
        logger.info('Cluster action UPDATE');

        if (this.instance.isMaster && !masterBadOrNew) {
            return checkForDisconnectedDevices.call(this, bigIp);
        } else if (!this.instance.isMaster) {
            // We're not the master, make sure the master file is not on our disk
            if (fs.existsSync(MASTER_FILE_PATH)) {
                fs.unlinkSync(MASTER_FILE_PATH);
            }

            // If there is a new master, join the cluster
            if (masterBadOrNew && masterIid) {
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
            actions.push(CloudProvider.MESSAGE_ADD_TO_CLUSTER);
        }

        if (!this.instance.isMaster) {
            actions.push(CloudProvider.MESSAGE_SYNC_COMPLETE);
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
                        case CloudProvider.MESSAGE_ADD_TO_CLUSTER:
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
                        case CloudProvider.MESSAGE_SYNC_COMPLETE:
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
                                    action: CloudProvider.MESSAGE_SYNC_COMPLETE,
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
                            CloudProvider.MESSAGE_SYNC_COMPLETE,
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

    function validateUploadedUcs(provider, ucsFileName) {
        const ucsFilePath = `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/${ucsFileName}`;
        return provider.getStoredUcs()
            .then((ucsData) => {
                logger.silly(`ucsFilePath: ${ucsFilePath}`);
                return util.writeUcsFile(ucsFilePath, ucsData);
            })
            .then(() => {
                return util.runShellCommand(`gzip -t -v ${ucsFilePath}`);
            })
            .then((response) => {
                if (response.indexOf('NOT OK') !== -1) {
                    return q.resolve({
                        status: 'CORRUPTED',
                        filePath: ucsFilePath
                    });
                }
                logger.silly('Validated integrity of recenetly generated UCS file.');
                return q.resolve({
                    status: 'OK',
                    filePath: ucsFilePath
                });
            })
            .catch((err) => {
                logger.warn('Error while validating ucs', err);
                return q.reject(err);
            });
    }

    function handleBackupUcs(provider, bigIp, options) {
        if (!this.instance.isMaster
            || this.instance.status !== AutoscaleInstance.INSTANCE_STATUS_OK) {
            logger.debug('not master or not ready, skipping ucs backup');
            return q();
        }

        const now = new Date().getTime();
        const ucsName = `${UCS_BACKUP_PREFIX}${now}`;

        logger.info('Backing up UCS');
        // ajv, which is installed as a dependency of the Azure node SDK has a couple files that start
        // with '$'. prior to 13.1, Meanwhile, mcpd has a bug which fails to save a ucs if it runs
        // into a file that starts with a '$'. So, let's just move the file. It's a bit ugly, but
        // there's not really a better place to do this since it's a one-off bug. All of
        // f5-cloud-libs is removed before ucs is loaded, so we don't need to do anything on that end.

        this.instance.lastBackup = now;
        let isUcsFileValid = false;
        return cleanupAjv(bigIp)
            .then(() => {
                return bigIp.saveUcs(ucsName);
            })
            .then(() => {
                return provider.storeUcs(
                    `${UCS_BACKUP_DIRECTORY}/${ucsName}.ucs`,
                    options.maxUcsFiles,
                    UCS_BACKUP_PREFIX
                );
            })
            .then(() => {
                logger.silly(`lastest ucs file: ${ucsName}.ucs`);
                return removeOldUcsFiles(`${ucsName}.ucs`);
            })
            .then(() => {
                return validateUploadedUcs(provider, `${ucsName}.ucs`);
            })
            .then((results) => {
                fs.unlinkSync(results.filePath);
                logger.silly('Removed local UCS file used in validation.');
                if (results.status !== 'OK') {
                    provider.deleteStoredUcs(`${ucsName}.ucs`);
                    return q.resolve();
                }
                isUcsFileValid = true;
                return q.resolve();
            })
            .then(() => {
                if (!isUcsFileValid) {
                    return q.reject(new Error('Validation of ' +
                        'generated UCS file failed; ' +
                        'recently generated UCS file appears to be corrupted.'));
                }
                return q.resolve();
            })
            .catch((err) => {
                logger.info('Error backing up ucs', err);
                if (fs.existsSync(`${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/${ucsName}.ucs`)) {
                    fs.unlinkSync(`${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/${ucsName}.ucs`);
                }
                provider.deleteStoredUcs(`${ucsName}.ucs`);
                return q.reject(err);
            });
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
                return bigIp.list('/tm/sys/global-settings');
            })
            .then((globalSettings) => {
                const hostname = globalSettings ? globalSettings.hostname : undefined;

                if (hostname) {
                    this.instance.hostname = hostname;
                } else {
                    logger.debug('hostname not found in this.instance or globalSettings');
                }

                return bigIp.list('/tm/sys/provision');
            })
            .then((response) => {
                const modulesProvisioned = {};

                if (response && response.length > 0) {
                    response.forEach((module) => {
                        modulesProvisioned[module.name] = !(module.level === 'none');
                    });
                }

                // Make sure device group exists
                logger.info('Creating device group.');

                const deviceGroupOptions = {
                    autoSync: options.autoSync,
                    saveOnAutoSync: options.saveOnAutoSync,
                    fullLoadOnSync: options.fullLoadOnSync,
                    asmSync: modulesProvisioned.asm || options.asmSync,
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

        if (provider.hasFeature(CloudProvider.FEATURE_MESSAGING)) {
            this.instance.lastJoinRequest = now;
            return provider.putInstance(this.instanceId, this.instance)
                .then((response) => {
                    logger.debug(response);
                    logger.debug('Resetting current device trust');
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
                            CloudProvider.MESSAGE_ADD_TO_CLUSTER,
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

        // not using messaging, just send the request via iControl REST
        const masterInstance = this.instances[masterIid];

        this.instance.lastJoinRequest = now;
        return provider.putInstance(this.instanceId, this.instance)
            .then((response) => {
                logger.debug(response);
                logger.debug('Resetting current device trust');
                return bigIp.cluster.resetTrust();
            })
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
     * Get the count of running Autoscale process,
     * its pid and current execution time with actions of join or update.
     */
    function getAutoscaleProcessInfo() {
        const actions = 'cluster-action update|-c update|cluster-action join|-c join';
        const grepCommand = `grep autoscale.js | grep -E '${actions}' | grep -v 'grep autoscale.js'`;
        const results = {};


        return util.getProcessCount(grepCommand)
            .then((response) => {
                if (response) {
                    results.processCount = response;
                }
                return util.getProcessExecutionTimeWithPid(grepCommand);
            })
            .then((response) => {
                if (response) {
                    results.pid = response.split('-')[0];
                    results.executionTime = response.split('-')[1].split(':')[0];
                }
                return q(results);
            })
            .catch((err) => {
                logger.error('Could not determine if another autoscale script is running');
                return q.reject(err);
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
                        if (this.instances[instanceId].hostname) {
                            hostnames.push(this.instances[instanceId].hostname);
                        }
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

        if (provider.hasFeature(CloudProvider.FEATURE_ENCRYPTION)) {
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
                })
                .catch((err) => {
                    logger.info('initEncryption error', err && err.message ? err.message : err);
                    return q.reject(err);
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

        if (masterStatus.status !== CloudProvider.STATUS_OK) {
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
        const originalPath = `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsOriginal_${timeStamp}.ucs`;
        const updatedPath = `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsUpdated_${timeStamp}.ucs`;
        const updateScript = `${__dirname}/updateAutoScaleUcs`;

        const deferred = q.defer();

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
                cloudProvider,
                '--extract-directory',
                `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsRestore`
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
                        if (!provider.hasFeature(CloudProvider.FEATURE_SHARED_PASSWORD)) {
                            loadUcsOptions.restoreUser = true;
                        }

                        bigIp.loadUcs(
                            updatedPath,
                            { 'no-license': true, 'reset-trust': true, 'no-platform-check': true },
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
                                    logger.info(`Ignoring errors: deleting originalPath: ${originalPath}
                                    deleting updatePath: ${updatedPath}`);
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

        util.writeUcsFile(originalPath, ucsData)
            .then(() => {
                doLoad();
            })
            .catch((err) => {
                logger.warn('Error reading ucs data', err);
                deferred.reject(err);
            });
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
        if (!provider.hasFeature(CloudProvider.FEATURE_ENCRYPTION)) {
            return q(messageData);
        }
        return util.tryUntil(provider, util.MEDIUM_RETRY, provider.getPublicKey, [instanceId])
            .then((publicKey) => {
                return cryptoUtil.encrypt(publicKey, messageData);
            });
    }

    function readMessageData(provider, bigIp, messageData) {
        let filePromise;

        if (!provider.hasFeature(CloudProvider.FEATURE_ENCRYPTION)) {
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

    function cleanupAjv(bigIp) {
        return bigIp.deviceInfo()
            .then((deviceInfo) => {
                if (util.versionCompare(deviceInfo.version, '13.1.0') < 0) {
                    const filesToRemove = [
                        `${__dirname}/../node_modules/ajv/lib/$data.js`,
                        `${__dirname}/../node_modules/ajv/lib/refs/$data.json`
                    ];

                    const deferred = q.defer();
                    let filesHandled = 0;

                    filesToRemove.forEach((fileToRemove) => {
                        fs.stat(fileToRemove, (statError) => {
                            if (statError) {
                                filesHandled += 1;
                                if (filesHandled === filesToRemove.length) {
                                    deferred.resolve();
                                }
                            } else {
                                fs.rename(fileToRemove, fileToRemove.replace('$', 'dollar_'), (renameErr) => {
                                    if (renameErr) {
                                        logger.info('cleanupAjv unable to remove', fileToRemove);
                                    }

                                    filesHandled += 1;
                                    if (filesHandled === filesToRemove.length) {
                                        deferred.resolve();
                                    }
                                });
                            }
                        });
                    });

                    return deferred.promise;
                }
                return q();
            })
            .catch((err) => {
                logger.info('Unable to cleanup AJV', err);
                return q.reject(err);
            });
    }

    function removeOldUcsFiles(latestFile) {
        const deferred = q.defer();

        logger.silly('removing old ucs files');
        fs.readdir(UCS_BACKUP_DIRECTORY, (err, files) => {
            if (err) {
                logger.info(`Error reading ${UCS_BACKUP_DIRECTORY}`, err);
                deferred.reject(err);
            } else {
                files.forEach((file) => {
                    if (file.startsWith(UCS_BACKUP_PREFIX) && file !== latestFile) {
                        fs.unlinkSync(`${UCS_BACKUP_DIRECTORY}/${file}`);
                    }
                });
                deferred.resolve();
            }
        });

        return deferred.promise;
    }

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
