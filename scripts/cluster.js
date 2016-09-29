/**
 * Copyright 2016 F5 Networks, Inc.
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
'use-strict';

(function() {

    var DEFAULT_LOG_FILE = '/tmp/cluster.log';

    var options = require('commander');
    var runner;

    module.exports = runner = {

        /**
         * Runs the clustering script
         *
         * @param {String[]} argv - The process arguments
         * @param {Object}   testOpts - Options used during testing
         * @param {Object}   testOpts.bigIp - BigIp object to use for testing
         * @param {Function} cb - Optional cb to call when done
         */
        run: function(argv, testOpts, cb) {
            var q = require('q');
            var BigIp = require('../lib/bigIp');
            var Logger = require('../lib/logger');
            var ipc = require('../lib/ipc');
            var signals = require('../lib/signals');
            var util = require('../lib/util');
            var loggerOptions = {};
            var logger;
            var logFileName;
            var bigIp;
            var i;

            var KEYS_TO_MASK = ['-p', '--password', '--remote-password'];
            var REQUIRED_OPTIONS = ['host', 'user', 'password'];

            testOpts = testOpts || {};

            options
                .option('--host <ip_address>', 'BIG-IP management IP to which to send commands.')
                .option('-u, --user <user>', 'BIG-IP admin user name.')
                .option('-p, --password <password>', 'BIG-IP admin user password.')
                .option('--port <port>', 'BIG-IP management SSL port to connect to. Default 443.', parseInt)
                .option('--config-sync-ip <config_sync_ip>', 'IP address for config sync.')
                .option('--create-group', 'Create a device group with the options:')
                .option('    --device-group <device_group>', '    Name of the device group.')
                .option('    --sync-type <sync_type>', '    Type of sync this cluster is for ("sync-only" | "sync-failover").')
                .option('    --device <device_name>', '    A device name to add to the group. For multiple devices, use multiple --device entries.', util.collect, [])
                .option('    --auto-sync', '    Enable auto sync.')
                .option('    --save-on-auto-sync', '    Enable save on sync if auto sync is enabled.')
                .option('    --full-load-on-sync', '    Enable full load on sync.')
                .option('    --asm-sync', '    Enable ASM sync.')
                .option('    --network-failover', '    Enable network failover.')
                .option('--join-group', 'Join a remote device group with the options:')
                .option('    --remote-host <remote_ip_address>', '    Managemnt IP for the BIG-IP on which the group exists.')
                .option('    --remote-user <remote_user', '    Remote BIG-IP admin user name.')
                .option('    --remote-password <remote_password>', '    Remote BIG-IP admin user password.')
                .option('    --remote-port <remote_port>', '    Remote BIG-IP port to connect to. Default is port of this BIG-IP.', parseInt)
                .option('    --device-group <remote_device_group_name>', '    Name of existing device group on remote BIG-IP to join.')
                .option('    --sync', '    Tell the remote to sync to us after joining the group.')
                .option('--remove-from-cluster', 'Remove a device from the cluster')
                .option('    --device-group <device_group>', '    Name of the device group.')
                .option('    --device <device_name>', '    Device name to remove.')
                .option('--background', 'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.')
                .option('--signal <signal>', 'Signal to send when done. Default CLUSTER_DONE.')
                .option('--wait-for <signal>', 'Wait for the named signal before running.')
                .option('--log-level <level>', 'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info')
                .option('-o, --output <file>', 'Log to file as well as console. This is the default if background process is spawned. Default is ' + DEFAULT_LOG_FILE)
                .parse(argv);

            options.port = options.port || 443;

            loggerOptions.console = true;
            loggerOptions.logLevel = options.logLevel;

            if (options.output) {
                loggerOptions.fileName = options.output;
            }

            logger = Logger.getLogger(loggerOptions);

            for (i = 0; i < REQUIRED_OPTIONS.length; ++i) {
                if (!options[REQUIRED_OPTIONS[i]]) {
                    logger.error(REQUIRED_OPTIONS[i], "is a required command line option.");
                    return;
                }
            }

            // When running in cloud init, we need to exit so that cloud init can complete and
            // allow the BIG-IP services to start
            if (options.background) {
                logFileName = options.output || DEFAULT_LOG_FILE;
                logger.info("Spawning child process to do the work. Output will be in", logFileName);
                util.runInBackgroundAndExit(process, logFileName);
            }

            // Log the input, but don't log passwords
            if (options.password) {
                for (i = 0; i < process.argv.length; ++i) {
                    if (KEYS_TO_MASK.indexOf(process.argv[i]) !== -1) {
                        process.argv[i + 1] = "*******";
                    }
                }
            }
            logger.info(process.argv[1] + " called with", process.argv.slice().join(" "));

            // Create the bigIp client object
            bigIp = testOpts.bigIp || new BigIp(options.host,
                                                options.user,
                                                options.password,
                                                {
                                                    port: options.port,
                                                    logger: logger
                                                });

            // Start processing...
            q()
                .then(function() {
                    if (options.waitFor) {
                        logger.info("Waiting for", options.waitFor);
                        return ipc.once(options.waitFor);
                    }
                })
                .then(function() {
                    logger.info("Cluster starting.");
                    ipc.send(signals.CLUSTER_RUNNING);

                    logger.info("Waiting for BIG-IP to be ready.");
                    return bigIp.ready();
                })
                .then(function() {
                    logger.info("BIG-IP is ready.");

                    if (options.configSyncIp) {
                        logger.info("Setting config sync ip.");
                        return bigIp.cluster.configSyncIp(options.configSyncIp);
                    }
                })
                .then(function() {
                    var deviceGroupOptions = {};

                    if (options.createGroup) {
                        if (!options.deviceGroup || !options.syncType) {
                            throw new Error('When creating a device group, both device-group and sync-type are required.');
                        }

                        logger.info("Creating group", options.deviceGroup + ".");
                        deviceGroupOptions = {
                            autoSync: options.autoSync,
                            saveOnAutoSync: options.saveOnAutoSync,
                            fullLoadOnSync: options.fullLoadOnSync,
                            asmSync: options.asmSync,
                            networkFailover: options.networkFailover
                        };

                        return bigIp.cluster.createDeviceGroup(options.deviceGroup, options.syncType, options.device, deviceGroupOptions);
                    }
                })
                .then(function(response) {
                    logger.debug(response);

                    if (options.joinGroup) {
                        logger.info("Joining group.");
                        return bigIp.cluster.joinCluster(options.deviceGroup,
                                                         options.remoteHost,
                                                         options.remoteUser,
                                                         options.remotePassword,
                                                         {
                                                            remotePort: options.remotePort,
                                                            sync: options.sync
                                                         });
                    }
                })
                .then(function(response) {
                    logger.debug(response);

                    if (options.removeFromCluster) {
                        logger.info("Removing", options.device, "from", options.deviceGroup);
                        return bigIp.cluster.removeFromCluster(options.device,
                                                               options.deviceGroup);
                    }
                })
                .then(function(response) {
                    logger.debug(response);
                    logger.info("Waiting for BIG-IP to be active.");
                    return bigIp.active();
                })
                .catch(function(err) {
                    logger.error("BIG-IP cluster failed", err);
                })
                .done(function(response) {
                    logger.debug(response);
                    logger.info("Cluster finished");

                    ipc.send(options.signal || signals.CLUSTER_DONE);

                    if (cb) {
                        cb();
                    }
                });
        },

        getOptions: function() {
            return options;
        }
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
