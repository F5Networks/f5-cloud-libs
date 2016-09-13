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
(function() {

    var DEFAULT_LOG_FILE = '/tmp/cluster.log';

    var options = require('commander');
    var globalSettings = {
        guiSetup: 'disabled'
    };
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

            var fs = require('fs');
            var q = require('q');
            var BigIp = require('../lib/bigIp');
            var util = require('../lib/util');
            var logFile;
            var logFileName;
            var bigIp;
            var remoteBigIp;
            var hostname;
            var version;
            var i;

            var KEYS_TO_MASK = ['-p', '--password', '--remote-password'];

            testOpts = testOpts || {};

            var writeOutput = function(message) {
                if (options.verbose || !options.silent) {
                    message += '\n';
                    if (logFile) {
                        logFile.write(message);
                    }
                    else {
                        process.stdout.write(message);
                    }
                }
            };

            var writeResponse = function(response) {
                if (response && options.verbose) {
                    writeOutput((typeof response === 'object' ? JSON.stringify(response, null, 4) : "  " + response));
                }
            };

            options
                .option('--host <ip_address>', 'Current BIG-IP management IP.')
                .option('-u, --user <user>', 'Current BIG-IP admin user.')
                .option('-p, --password <password>', 'Current BIG-IP admin user password.')
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
                .option('    --remote-password <remote_password>', '    Remote BIG-IP admin user password')
                .option('    --device-group <remote_device_group_name>', '    Name of existing device group on remote BIG-IP to join')
                .option('    --sync', '    Tell the remote to sync to us after joining the group.')
                .option('--background', 'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.')
                .option('--signal <pid>', 'Process ID to send USR1 to when clustering is complete.')
                .option('-o, --output <file>', 'Full path for log file if background process is spawned. Default is ' + DEFAULT_LOG_FILE)
                .option('--silent', 'Turn off all output.')
                .option('--verbose', 'Turn on verbose output (overrides --silent).')
                .parse(argv);

            logFileName = options.output || DEFAULT_LOG_FILE;

            // When running in cloud init, we need to exit so that cloud init can complete and
            // allow the BIG-IP services to start
            if (options.background) {
                writeOutput("Spawning child process to do the work. Output will be in " + logFileName);
                util.runInBackgroundAndExit(process, logFileName);
            }

            if (options.output) {
                logFile = fs.createWriteStream(logFileName);
            }

            // Log the input, but don't log passwords
            if (options.password) {
                for (i = 0; i < process.argv.length; ++i) {
                    if (KEYS_TO_MASK.indexOf(process.argv[i]) !== -1) {
                        process.argv[i + 1] = "*******";
                    }
                }
            }
            writeOutput(process.argv[1] + " called with " + process.argv.slice().join(" "));

            // Create the bigIp client object
            bigIp = testOpts.bigIp || new BigIp(options.host, options.user, options.password);

            // Start processing...
            writeOutput("Cluster starting at: " + new Date().toUTCString());
            writeOutput("Waiting for BIG-IP to be ready.");
            bigIp.ready()
                .then(function() {
                    writeOutput("BIG-IP is ready.");

                    if (options.configSyncIp) {
                        writeOutput("Setting config sync ip.");
                        return bigIp.cluster.configSyncIp(options.configSyncIp);
                    }
                })
                .then(function() {
                    var deviceGroupOptions = {};

                    if (options.createGroup) {
                        if (!options.deviceGroup || !options.syncType) {
                            throw new Error('When creating a device group, both device-group and sync-type are required.');
                        }

                        writeOutput("Creating group " + options.deviceGroup + ".");
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
                    writeResponse(response);

                    if (options.joinGroup) {
                        if (!options.deviceGroup || !options.remoteHost || !options.remoteUser || !options.remotePassword) {
                            throw new Error('When joinging a device group, device-group, remote-host, remote-user, and remote-password are required.');
                        }

                        writeOutput("Checking device group on remote host.");

                        remoteBigIp = testOpts.bigIp || new BigIp(options.remoteHost, options.remoteUser, options.remotePassword);

                        return remoteBigIp.list('/tm/cm/device-group/' + options.deviceGroup, undefined, {maxRetries: 120, retryIntervalMs: 10000});
                    }
                })
                .then(function(response) {
                    writeResponse(response);

                    if (options.joinGroup) {
                        writeOutput("Getting local hostname for trust.");
                        return bigIp.deviceInfo();
                    }
                })
                .then(function(response) {
                    writeResponse(response);

                    if (options.joinGroup) {
                        writeOutput("Adding to remote trust.");
                        hostname = response.hostname;
                        version = response.version; // we need this later when we sync the datasync-global-dg group
                        return remoteBigIp.cluster.addToTrust(hostname, options.host, options.user, options.password);
                    }
                })
                .then(function(response) {
                    writeResponse(response);

                    if (options.joinGroup) {
                        writeOutput("Adding to remote device group.");
                        return remoteBigIp.cluster.addToDeviceGroup(hostname, options.deviceGroup);
                    }
                })
                .then(function(response) {
                    writeResponse(response);

                    // If the group datasync-global-dg is present (which it likely is if ASM is provisioned)
                    // we need to force a sync of it as well. Otherwise we will not be able to determine
                    // the overall sync status because there is no way to get the sync status
                    // of a single device group
                    if (options.joinGroup && options.sync) {
                        writeOutput("Checking for datasync-global-dg.");
                        return bigIp.list('/tm/cm/device-group');
                    }
                })
                .then(function(response) {

                    // Sometimes sync just fails silently, so we retry all of the sync commands until both
                    // local and remote devices report that they are in sync
                    var syncAndCheck = function(datasyncGlobalDgResponse) {
                        var deferred = q.defer();
                        var remoteSyncPromise = q.defer();

                        var SYNC_COMPLETE_RETRY = {
                            maxRetries: 3,
                            retryIntervalMs: 10000
                        };

                        writeOutput("Telling remote to sync.");
                        remoteBigIp.cluster.sync('to-group', options.deviceGroup, false, util.NO_RETRY)
                            .then(function() {
                                setTimeout(function() {
                                    remoteSyncPromise.resolve();
                                }, 30000);
                            })
                            .done();

                        remoteSyncPromise.promise
                            .then(function() {
                                var i;
                                for (i = 0; i < datasyncGlobalDgResponse.length; ++i) {
                                    if (datasyncGlobalDgResponse[i].name === 'datasync-global-dg') {
                                        // Prior to 12.1, set the sync leader
                                        if (util.versionCompare(version, '12.1.0') < 0) {
                                            writeOutput("Setting sync leader.");
                                            return bigIp.modify(
                                                '/tm/cm/device-group/datasync-global-dg/devices/' + hostname,
                                                {
                                                    "set-sync-leader": true
                                                },
                                                undefined,
                                                util.NO_RETRY
                                            );
                                        }

                                        // On 12.1 and later, do a full sync
                                        else {
                                            writeOutput("Telling remote to sync datasync-global-dg request.");
                                            return remoteBigIp.cluster.sync('to-group', 'datasync-global-dg', true, util.NO_RETRY);
                                        }
                                    }
                                }
                            })
                            .then(function() {
                                var syncCompleteChecks = [];
                                writeOutput("Waiting for sync to complete.");
                                syncCompleteChecks.push(bigIp.cluster.syncComplete(SYNC_COMPLETE_RETRY), remoteBigIp.cluster.syncComplete(SYNC_COMPLETE_RETRY));
                                return q.all(syncCompleteChecks);
                            })
                            .then(function() {
                                writeOutput("Sync complete.");
                                deferred.resolve();
                            })
                            .catch(function() {
                                writeOutput("Sync not yet complete.");
                                deferred.reject();
                            })
                            .done();

                        return deferred.promise;
                    };

                    writeResponse(response);

                    if (options.joinGroup && options.sync) {
                        return util.tryUntil(this, {maxRetries: 10, retryIntervalMs: 30000}, syncAndCheck, [response]);
                    }
                })
                .catch(function(err) {
                    writeOutput("BIG-IP cluster failed: " + (typeof err === 'object' ? options.verbose ? err.stack : err.message : err));
                })
                .done(function(response) {
                    writeResponse(response);
                    writeOutput("Cluster finished at: " + new Date().toUTCString());

                    if (options.signal) {
                        writeOutput("Signalling " + options.signal);
                        try {
                            process.kill(options.signal, 'SIGUSR1');
                        }
                        catch (err) {
                            writeOutput("Signal failed: " + err.message);
                        }
                    }

                    if (logFile) {
                        logFile.end();
                    }

                    if (cb) {
                        cb();
                    }
                });
        },

        getGlobalSettings: function() {
            return globalSettings;
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
