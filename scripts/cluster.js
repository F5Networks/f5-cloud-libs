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

const q = require('q');
const BigIp = require('../lib/bigIp');
const Logger = require('../lib/logger');
const ActiveError = require('../lib/activeError');
const cloudProviderFactory = require('../lib/cloudProviderFactory');
const ipc = require('../lib/ipc');
const signals = require('../lib/signals');
const util = require('../lib/util');
const commonOptions = require('./commonOptions');
const localCryptoUtil = require('../lib/localCryptoUtil');

(function run() {
    const runner = {
        /**
         * Runs the clustering script
         *
         * @param {String[]} argv - The process arguments
         * @param {Object}   testOpts - Options used during testing
         * @param {Object}   testOpts.bigIp - BigIp object to use for testing
         * @param {Function} cb - Optional cb to call when done
         */
        run(argv, testOpts, cb) {
            const DEFAULT_LOG_FILE = '/tmp/cluster.log';
            const ARGS_FILE_ID = `cluster_${Date.now()}`;
            const KEYS_TO_MASK = ['-p', '--password', '--remote-password'];
            const REQUIRED_OPTIONS = ['host', 'user'];
            const PRIMARY_CREDENTIALS_FILE = 'credentials/primary';

            const OPTIONS_TO_UNDEFINE = [
                'remotePassword',
                'remotePasswordUrl',
                'password',
                'passwordUrl'
            ];

            const providerOptions = {};
            const loggerOptions = {};
            const optionsForTest = {};

            let provider;
            let loggableArgs;
            let logger;
            let logFileName;
            let bigIp;
            let rebooting;
            let exiting;

            let bigIqPasswordData = {};

            Object.assign(optionsForTest, testOpts);

            try {
                /* eslint-disable max-len */
                const options = commonOptions.getCommonOptions(DEFAULT_LOG_FILE)
                    .option(
                        '--config-sync-ip <config_sync_ip>',
                        'IP address for config sync.'
                    )
                    .option(
                        '--big-iq-failover-peer-ip <peer_ip>',
                        'If configuring a BIG-IQ failover primary, this is the management IP address for the secondary'
                    )
                    .option(
                        '--cloud <provider>',
                        'Cloud provider (aws | azure | etc.). Optionally use this if passwords are stored in cloud storage. This replaces the need for --remote-user/--remote-password(-url). An implemetation of cloudProvider must exist at the correct location.'
                    )
                    .option(
                        '   --big-iq-password-data-uri <key_uri>',
                        '   URI (arn, url, etc.) to a JSON file containing the BIG-IQ passwords (required keys: admin, root)'
                    )
                    .option(
                        '   --big-iq-password-data-encrypted',
                        '   Indicates that the BIG-IQ password data is encrypted (either with encryptDataToFile or generatePassword)'
                    )
                    .option(
                        '    --primary',
                        'If using a cloud provider, indicates that this is the primary. If running on a BIG-IP credentials should be stored. If running on a BIG-IQ, --create-group and --join-group options are not needed.'
                    )
                    .option(
                        '    --provider-options <cloud_options>',
                        'Any options (JSON stringified) that are required for the specific cloud provider.',
                        util.map,
                        providerOptions
                    )
                    .option(
                        '--create-group',
                        'Create a device group with the options:'
                    )
                    .option(
                        '    --device-group <device_group>',
                        '    Name of the device group.'
                    )
                    .option(
                        '    --sync-type <sync_type>',
                        '    Type of sync this cluster is for ("sync-only" | "sync-failover").'
                    )
                    .option(
                        '    --device <device_name>',
                        '    A device name to add to the group. For multiple devices, use multiple --device entries.',
                        util.collect,
                        []
                    )
                    .option(
                        '    --auto-sync',
                        '    Enable auto sync.'
                    )
                    .option(
                        '    --save-on-auto-sync',
                        '    Enable save on sync if auto sync is enabled.'
                    )
                    .option(
                        '    --full-load-on-sync',
                        '    Enable full load on sync.'
                    )
                    .option(
                        '    --asm-sync',
                        '    Enable ASM sync.'
                    )
                    .option(
                        '    --network-failover',
                        '    Enable network failover.'
                    )
                    .option(
                        '--join-group',
                        'Join a remote device group with the options:'
                    )
                    .option(
                        '    --remote-host <remote_ip_address>',
                        '    Managemnt IP for the BIG-IP on which the group exists.'
                    )
                    .option(
                        '    --remote-user <remote_user>',
                        '    Remote BIG-IP admin user name.'
                    )
                    .option(
                        '    --remote-password [remote_password]',
                        '    Remote BIG-IP admin user password. Use this or --remote-password-url'
                    )
                    .option(
                        '    --remote-password-url [remote_password_url]',
                        '    URL (file, http(s)) that contains. Use this or --remote-password'
                    )
                    .option(
                        '    --remote-port <remote_port>',
                        '    Remote BIG-IP port to connect to. Default is port of this BIG-IP.',
                        parseInt
                    )
                    .option(
                        '    --device-group <remote_device_group_name>',
                        '    Name of existing device group on remote BIG-IP to join.'
                    )
                    .option(
                        '    --sync',
                        '    Tell the remote to sync to us after joining the group.'
                    )
                    .option(
                        '--remove-from-cluster',
                        'Remove a device from the cluster'
                    )
                    .option(
                        '--delete-remote-primary-creds',
                        'Delete primary credentials stored in cloud storage'
                    )
                    .option(
                        '--delete-local-creds',
                        'Delete primary credentials stored locally'
                    )
                    .option(
                        '    --device-group <device_group>',
                        '    Name of the device group.'
                    )
                    .option(
                        '    --device <device_name>',
                        '    Device name to remove.'
                    )
                    .parse(argv);
                /* eslint-enable max-len */

                options.port = options.port || 443;

                loggerOptions.console = options.console;
                loggerOptions.logLevel = options.logLevel;
                loggerOptions.module = module;

                if (options.output) {
                    loggerOptions.fileName = options.output;
                }

                if (options.errorFile) {
                    loggerOptions.errorFile = options.errorFile;
                }

                logger = Logger.getLogger(loggerOptions);
                ipc.setLoggerOptions(loggerOptions);
                util.setLoggerOptions(loggerOptions);

                // Remove specific options with no provided value
                OPTIONS_TO_UNDEFINE.forEach((opt) => {
                    if (typeof options[opt] === 'boolean') {
                        logger.debug(`No value set for option ${opt}. Removing option.`);
                        options[opt] = undefined;
                    }
                });

                // Expose options for test code
                this.options = options;

                // Log the input, but don't log passwords
                loggableArgs = argv.slice();
                for (let i = 0; i < loggableArgs.length; i++) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = '*******';
                    }
                }
                logger.info(`${loggableArgs[1]} called with`, loggableArgs.join(' '));


                for (let i = 0; i < REQUIRED_OPTIONS.length; i++) {
                    if (!options[REQUIRED_OPTIONS[i]]) {
                        const error = `${REQUIRED_OPTIONS[i]} is a required command line option.`;

                        ipc.send(signals.CLOUD_LIBS_ERROR);

                        util.logError(error, loggerOptions);
                        util.logAndExit(error, 'error', 1);
                    }
                }

                if (!options.password && !options.passwordUrl && !options.bigIqPasswordDataUri) {
                    const error =
                        'One of --password, --password-url or --big-iq-password-data-uri is required.';

                    ipc.send(signals.CLOUD_LIBS_ERROR);

                    util.logError(error, loggerOptions);
                    util.logAndExit(error, 'error', 1);
                }

                if (options.bigIqFailoverPeerIp && !options.bigIqPasswordDataUri) {
                    const error = '--big-iq-password-data-uri is required for BIG-IQ failover';

                    ipc.send(signals.CLOUD_LIBS_ERROR);

                    util.logError(error, loggerOptions);
                    util.logAndExit(error, 'error', 1);
                }

                // When running in cloud init, we need to exit so that cloud init can complete and
                // allow the BIG-IP services to start
                if (options.background) {
                    logFileName = options.output || DEFAULT_LOG_FILE;
                    logger.info('Spawning child process to do the work. Output will be in', logFileName);
                    util.runInBackgroundAndExit(process, logFileName);
                }

                if (options.cloud) {
                    // Create provider client, allowing provider to be overwritten in test code
                    provider = optionsForTest.cloudProvider;
                    if (!provider) {
                        provider = cloudProviderFactory.getCloudProvider(
                            options.cloud,
                            {
                                loggerOptions,
                                clOptions: options
                            }
                        );
                    }
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
                        logger.info('Cluster starting.');
                        ipc.send(signals.CLUSTER_RUNNING);

                        // Retrieve, and save, stored password data
                        if (options.bigIqPasswordDataUri) {
                            return util.readData(options.bigIqPasswordDataUri,
                                true,
                                {
                                    clOptions: providerOptions,
                                    logger,
                                    loggerOptions
                                })
                                .then((uriData) => {
                                    if (options.bigIqPasswordDataEncrypted) {
                                        return localCryptoUtil.decryptPassword(uriData);
                                    }
                                    return q(uriData);
                                })
                                .then((uriData) => {
                                    bigIqPasswordData = util.lowerCaseKeys(
                                        JSON.parse(uriData.trim())
                                    );
                                })
                                .then(() => {
                                    if (!bigIqPasswordData.admin || !bigIqPasswordData.root) {
                                        const msg =
                                            'Required passwords missing from --biq-iq-password-data-uri';
                                        logger.info(msg);
                                        return q.reject(msg);
                                    }
                                    return q();
                                })
                                .catch((err) => {
                                    logger.info('Unable to retrieve JSON from --big-iq-password-data-uri');
                                    return q.reject(err);
                                });
                        }
                        return q();
                    })
                    .then(() => {
                        // Create the bigIp client object
                        bigIp = optionsForTest.bigIp || new BigIp({ loggerOptions });

                        logger.info('Initializing BIG-IP.');
                        return bigIp.init(
                            options.host,
                            options.user || 'admin',
                            options.password || options.passwordUrl || bigIqPasswordData.admin,
                            {
                                port: options.port,
                                passwordIsUrl: typeof options.passwordUrl !== 'undefined',
                                passwordEncrypted: options.passwordEncrypted,
                                clOptions: providerOptions
                            }
                        );
                    })
                    .then(() => {
                        logger.info('Waiting for BIG-IP to be ready.');
                        return bigIp.ready();
                    })
                    .then(() => {
                        logger.info('BIG-IP is ready.');

                        if (options.cloud) {
                            logger.info('Initializing cloud provider.');
                            return provider.init(providerOptions);
                        }
                        return q();
                    })
                    .then(() => {
                        if (options.cloud) {
                            return provider.bigIpReady();
                        }
                        return q();
                    })
                    .then(() => {
                        // Primary BIG-IQ initiates peering with secondary BIG-IQ
                        if (options.primary
                            && options.bigIqFailoverPeerIp
                            && bigIp.isBigIq()
                        ) {
                            logger.info(`Adding ${options.bigIqFailoverPeerIp} as high availability peer.`);
                            return bigIp.cluster.addSecondary(
                                options.bigIqFailoverPeerIp,
                                options.user || 'admin',
                                bigIp.password,
                                bigIqPasswordData.root
                            );
                        }
                        return q();
                    })
                    .then(() => {
                        if (options.configSyncIp) {
                            logger.info('Setting config sync ip.');
                            return bigIp.cluster.configSyncIp(options.configSyncIp);
                        }
                        return q();
                    })
                    .then(() => {
                        if (options.createGroup && bigIp.isBigIp()) {
                            if (!options.deviceGroup || !options.syncType) {
                                throw new Error('Create device group: device-group and sync-type required.');
                            }

                            logger.info('Creating group', options.deviceGroup);
                            const deviceGroupOptions = {
                                autoSync: options.autoSync,
                                saveOnAutoSync: options.saveOnAutoSync,
                                fullLoadOnSync: options.fullLoadOnSync,
                                asmSync: options.asmSync,
                                networkFailover: options.networkFailover
                            };

                            return bigIp.cluster.createDeviceGroup(
                                options.deviceGroup,
                                options.syncType,
                                options.device,
                                deviceGroupOptions
                            );
                        }
                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        // If we are using cloud storage and are the primary, store our credentials
                        if (options.cloud && options.primary && bigIp.isBigIp()) {
                            logger.info('Storing credentials.');
                            return util.tryUntil(
                                provider,
                                util.DEFAULT_RETRY,
                                provider.putPrimaryCredentials
                            );
                        }
                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        // options.cloud set indicates that the provider must use some storage
                        // for its primary credentials
                        if (options.cloud && options.joinGroup && bigIp.isBigIp()) {
                            logger.info('Getting primary credentials.');
                            return util.tryUntil(
                                provider,
                                util.DEFAULT_RETRY,
                                provider.getPrimaryCredentials,
                                [options.remoteHost, options.remotePort]
                            );
                        }
                        return q();
                    })
                    .then((response) => {
                        // Don't log the response here - it has the credentials in it
                        if (options.cloud && options.joinGroup && bigIp.isBigIp()) {
                            logger.info('Got primary credentials.');

                            options.remoteUser = response.username;
                            options.remotePassword = response.password;
                            options.passwordEncrypted = false;
                        }

                        if (options.joinGroup && bigIp.isBigIp()) {
                            logger.info('Joining group.');

                            return bigIp.cluster.joinCluster(
                                options.deviceGroup,
                                options.remoteHost,
                                options.remoteUser,
                                options.remotePassword || options.remotePasswordUrl,
                                false,
                                {
                                    remotePort: options.remotePort,
                                    sync: options.sync,
                                    passwordIsUrl: typeof options.remotePasswordUrl !== 'undefined',
                                    passwordEncrypted: options.passwordEncrypted
                                }
                            );
                        }
                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        if (options.removeFromCluster) {
                            logger.info('Removing', options.device, 'from', options.deviceGroup);
                            return bigIp.cluster.removeFromCluster(options.device);
                        }
                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);
                        logger.info('Waiting for BIG-IP to be active.');
                        return bigIp.active();
                    })
                    .then(() => {
                        if (options.deleteRemotePrimaryCreds && !options.primary) {
                            return provider.deleteStoredObject(PRIMARY_CREDENTIALS_FILE);
                        }
                        return q();
                    })
                    .then(() => {
                        if (options.deleteLocalCreds && options.passwordUrl) {
                            return util.runShellCommand(`rm ${options.passwordUrl.replace('file:/', '')}`);
                        }
                        return q();
                    })
                    .catch((err) => {
                        let message;
                        const promises = [];
                        if (options.deleteRemotePrimaryCreds && !options.primary) {
                            promises.push(provider.deleteStoredObject(PRIMARY_CREDENTIALS_FILE));
                        }
                        if (options.deleteLocalCreds && options.passwordUrl) {
                            promises.push(util.runShellCommand(
                                `rm ${options.passwordUrl.replace('file:/', '')}`
                            ));
                        }
                        return Promise.all(promises)
                            .then(() => {
                                if (!err) {
                                    message = 'unknown reason';
                                } else {
                                    message = err.message;
                                }
                                if (err) {
                                    if (err instanceof ActiveError || err.name === 'ActiveError') {
                                        logger.warn('BIG-IP active check failed.');
                                        rebooting = true;
                                        return util.reboot(bigIp, { signalOnly: !(options.reboot) });
                                    }
                                }

                                ipc.send(signals.CLOUD_LIBS_ERROR);

                                const error = `Cluster failed: ${message}`;
                                util.logError(error, loggerOptions);
                                util.logAndExit(error, 'error', 1);

                                exiting = true;
                                return q();
                            });
                    })
                    .done((response) => {
                        logger.debug(response);
                        if ((!rebooting || !options.reboot) && !exiting) {
                            ipc.send(options.signal || signals.CLUSTER_DONE);
                        }

                        // Perform callback before final logAndExit
                        if (cb) {
                            cb();
                        }

                        if (!rebooting) {
                            util.deleteArgs(ARGS_FILE_ID);

                            if (!exiting) {
                                util.logAndExit('Cluster finished.');
                            }
                        } else if (!options.reboot) {
                            // If we are rebooting, but we were called with --no-reboot, send signal
                            if (!exiting) {
                                util.logAndExit('Cluster finished. Reboot required but not rebooting.');
                            }
                        } else {
                            util.logAndExit('Cluster finished. Reboot required.');
                        }
                    });

                // If another script has signaled an error, exit, marking ourselves as DONE
                ipc.once(signals.CLOUD_LIBS_ERROR)
                    .then(() => {
                        ipc.send(options.signal || signals.CLUSTER_DONE);
                        util.logAndExit('ERROR signaled from other script. Exiting');
                    });

                // If we reboot due to some other script, exit - otherwise cloud providers
                // won't know we're done. If we forced the reboot ourselves, we will exit
                // when that call completes.
                ipc.once('REBOOT')
                    .then(() => {
                        if (!rebooting) {
                            util.logAndExit('REBOOT signaled. Exiting.');
                        }
                    });
            } catch (err) {
                if (logger) {
                    logger.error('Clustering error:', err);
                }
            }
        }
    };

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
