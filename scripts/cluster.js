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

            options.reboot = true;
            options
                .option('--host <ip_address>', 'Current BIG-IP management IP.')
                .option('-u, --user <user>', 'Current BIG-IP admin user.')
                .option('-p, --password <password>', 'Current BIG-IP admin user password.')
                .option('--device-group <device_group_name>', 'Name of the device group to use for sync.')
                .option('--sync-type <sync_type>', 'Type of sync this cluster is for ("sync-only" | "sync-failover").')
                .option('--device <device_name>', 'A device name to add to the group. For devices, use multiple --device entries.', util.collect, [])
                .option('--autoSync', 'Turn on auto sync.')
                .option('--saveOnAutoSync', 'Save on sync if auto sync is enabled.')
                .option('--fullLoadOnSync', 'Turn on full load on sync.')
                .option('--asmSync', 'Turn on ASM sync.')
                .option('--networkFailover', 'Turn on network failover.')
                .option('--no-reboot', 'Skip reboot even if it is recommended.')
                .option('-f, --foreground', 'Do the work in the foreground - otherwise spawn a background process to do the work. If you are running in cloud init, you probably do not want this option.')
                .option('--signal <pid>', 'Process ID to send USR1 to when clustering is complete (but before rebooting if we are rebooting).')
                .option('-o, --output <file>', 'Full path for log file if background process is spawned. Default is ' + DEFAULT_LOG_FILE)
                .option('--silent', 'Turn off all output.')
                .option('--verbose', 'Turn on verbose output (overrides --silent).')
                .parse(argv);

            logFileName = options.output || DEFAULT_LOG_FILE;

            // When running in cloud init, we need to exit so that cloud init can complete and
            // allow the BIG-IP services to start
            if (!options.foreground) {
                writeOutput("Spawning child process to do the work. Output will be in " + logFileName);
                util.runInBackgroundAndExit(process, logFileName);
            }

            if (options.output) {
                logFile = fs.createWriteStream(logFileName);
            }

            writeOutput(process.argv[1] + " called with " + process.argv.slice().join(" "));

            if (!options.deviceGroup || !options.syncType) {
                throw new Error("deviceGroup and syncType are both required");
            }

            // Create the bigIp client object
            bigIp = testOpts.bigIp || new BigIp(options.host, options.user, options.password);

            // Start processing...
            writeOutput("Cluster starting at: " + new Date().toUTCString());
            writeOutput("Waiting for BIG-IP to be ready.");
            bigIp.ready()
                .then(function() {
                    var deviceGroupOptions = {
                        autoSync: options.autoSync,
                        saveOnAutoSync: options.saveOnAutoSync,
                        fullLoadOnSync: options.fullLoadOnSync,
                        asmSync: options.asmSync,
                        networkFailover: options.networkFailover
                    };

                    writeOutput("BIG-IP is ready.");

                    if (options.deviceGroup && options.syncType) {
                        return bigIp.cluster.createDeviceGroup(options.deviceGroup, options.syncType, options.device, deviceGroupOptions);
                    }
                    else {
                        return q();
                    }
                })
                .then(function(response) {
                    writeResponse(response);
                })
                .catch(function(err) {
                    writeOutput("BIG-IP cluster failed: " + (typeof err === 'object' ? err.message : err));
                })
                .done(function() {
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
