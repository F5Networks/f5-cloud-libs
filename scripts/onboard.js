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

    var DEFAULT_LOG_FILE = '/tmp/onboard.log';

    var options = require('commander');
    var globalSettings = {
        guiSetup: 'disabled'
    };
    var runner;

    module.exports = runner = {

        /**
         * Runs the onboarding script
         *
         * @param {String[]} argv - The process arguments
         * @param {Object}   testOpts - Options used during testing
         * @param {Object}   testOpts.bigIp - BigIp object to use for testing
         * @param {Function} cb - Optional cb to call when done
         */
        run: function(argv, testOpts, cb) {

            var fs = require('fs');
            var childProcess = require("child_process");
            var q = require("q");
            var BigIp = require('../lib/bigIp');
            var dbVars = {};
            var modules = {};
            var passwords = {};
            var rootPasswords = {};

            var logFile;
            var logFileName;

            var args;
            var myChild;

            var bigIp;

            var i;

            var KEYS_TO_MASK = ['-p', '--password', '--set-password', '--set-root-password'];

            testOpts = testOpts || {};

            /**
             * Adds value to an array
             *
             * Typically used by the option parser for collecting
             * multiple values for a command line option
             */
            var collect = function(val, collection) {
                collection.push(val);
                return collection;
            };

            /**
             * Parses a ':' deliminated key-value pair and stores them
             * in a container.
             *   - Key is the part before the first ':',
             *   - Value is everything after.
             *   - Leading and trailing spaces are removed from keys and values
             *
             * Typically used by the option parser for collecting
             * multiple key-value pairs for a command line option
             */
            var map = function(pair, container) {
                var nameVal = pair.split(/:(.+)/);
                container[nameVal[0].trim()] = nameVal[1].trim();
            };

            /**
             * Special case of map. Used to parse root password options in the form of
             *     old:oldRootPassword,new:newRootPassword
             * Since passwords can contain any character, a delimiter is difficult to find.
             * Compromise by looking for ',new:' as a delimeter
             */
            var parseRootPasswords = function(passwordsValue, container) {
                var set = passwordsValue.split(",new:");

                if (set.length == 2) {
                    container.old = set[0].split("old:")[1];
                    container.new = set[1];
                }
            };

            var writeOutput = function(message) {
                if (options.verbose || !options.silent) {
                    console.log(message);
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
                .option('--ntp <ntp-server>', 'Set NTP server. For multiple NTP servers, use multiple --ntp entries.', collect, [])
                .option('--tz <timezone>', 'Set timezone for NTP setting.')
                .option('--dns <DNS server>', 'Set DNS server. For multiple DNS severs, use multiple --dns entries.', collect, [])
                .option('-l, --license <license_key>', 'License BIG-IP with <license_key>.')
                .option('-a, --add-on <add_on_key>', 'License BIG-IP with <add_on_key>. For multiple keys, use multiple -a entries.', collect, [])
                .option('-n, --host-name <hostname>', 'Set BIG-IP hostname.')
                .option('-g, --global-setting <name:value>', 'Set global setting <name> to <value>. For multiple settings, use multiple -g entries.', map, globalSettings)
                .option('-d, --db <name:value>', 'Set db variable <name> to <value>. For multiple settings, use multiple -d entries.', map, dbVars)
                .option('--set-password <user:new_password>', 'Set <user> password to <new_password>. For multiple users, use multiple --set-password entries.', map, passwords)
                .option('--set-root-password <old:old_password,new:new_password>', 'Set the password for the root user from <old_password> to <new_password>.', parseRootPasswords, rootPasswords)
                .option('-m, --module <name:level>', 'Provision module <name> to <level>. For multiple modules, use multiple -m entries.', map, modules)
                .option('--no-reboot', 'Skip reboot even if it is recommended.')
                .option('-f, --foreground', 'Do the work in the foreground - otherwise spawn a background process to do the work. If you are running in cloud init, you probably do not want this option.')
                .option('--signal <pid>', 'Process ID to send USR1 to when onboarding is complete (but before rebooting if we are rebooting).')
                .option('-o, --output <file>', 'Full path for log file if background process is spawned. Default is ' + DEFAULT_LOG_FILE)
                .option('--silent', 'Turn off all output.')
                .option('--verbose', 'Turn on verbose output (overrides --silent).')
                .parse(argv);

            logFileName = options.output || DEFAULT_LOG_FILE;

            try {
                logFile = fs.openSync(logFileName, 'a');

                // When running in cloud init, we need to exit so that cloud init can complete and
                // allow the BIG-IP services to start
                if (!options.foreground) {

                    if (process.argv.length > 100) {
                        writeOutput("Too many arguments - maybe we're stuck in a restart loop?");
                    }
                    else {
                        writeOutput("Spawning child process to do the work. Output will be in " + logFileName);
                        args = process.argv.slice(1);
                        args.push('--foreground');
                        myChild = childProcess.spawn(
                            process.argv[0],
                            args,
                            {
                                detached: true,
                                stdio: ['ignore', logFile, logFile]
                            }
                        );
                        myChild.unref();
                    }

                    process.exit();
                }

                // Log the input, but don't log passwords
                if (options.password || Object.keys(passwords).lentgh > 0 || Object.keys(rootPasswords).length > 0) {
                    for (i = 0; i < process.argv.length; ++i) {
                        if (KEYS_TO_MASK.indexOf(process.argv[i]) !== -1) {
                            process.argv[i + 1] = "*******";
                        }
                    }
                }
                writeOutput(process.argv[1] + " called with " + process.argv.slice().join(" "));

                // Create the bigIp client object
                bigIp = testOpts.bigIp || new BigIp(options.host, options.user, options.password);

                // Use hostName if both hostName and global-settings hostName are set
                if (globalSettings && options.hostName) {
                    if (globalSettings.hostname || globalSettings.hostName) {
                        writeOutput("Using host-name option to override global-settings host name");
                        delete globalSettings.hostName;
                        delete globalSettings.hostname;
                    }
                }

                // Start processing...
                writeOutput("Onboard starting at: " + new Date().toUTCString());
                writeOutput("Waiting for BIG-IP to be ready.");
                bigIp.ready()
                    .then(function() {
                        var promises = [];
                        var user;

                        writeOutput("BIG-IP is ready.");

                        if (Object.keys(passwords).length > 0) {
                            writeOutput("Setting password(s).");
                            for (user in passwords) {
                                promises.push(bigIp.onboard.password(user, passwords[user]));
                            }

                            return q.all(promises);
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);

                        if (Object.keys(rootPasswords).length > 0) {
                            if (!rootPasswords.old || !rootPasswords.new) {
                                return q.reject("Old or new password missing for root user. Specify with --set-root-password old:old_root_password,new:new_root_password");
                            }

                            writeOutput("Setting rootPassword.");
                            return bigIp.onboard.password('root', rootPasswords.new, rootPasswords.old);
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        var ntpBody;

                        writeResponse(response);

                        if (options.ntp.length > 0 || options.tz) {
                            writeOutput("Setting up NTP.");

                            ntpBody = {};

                            if (options.ntp) {
                                ntpBody.servers = options.ntp;
                            }

                            if (options.tz) {
                                ntpBody.timezone = options.tz;
                            }

                            return bigIp.modify(
                                '/tm/sys/ntp',
                                ntpBody
                            );
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);

                        if (options.dns.length > 0) {
                            writeOutput("Setting up DNS.");

                            return bigIp.modify(
                                '/tm/sys/dns',
                                {
                                    'name-servers': options.dns
                                }
                            );
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);

                        if (options.hostName) {
                            writeOutput("Setting host name.");
                            return bigIp.onboard.hostName(options.hostName);
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);

                        if (globalSettings) {
                            writeOutput("Setting global settings.");
                            return bigIp.onboard.globalSettings(globalSettings);
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);

                        if (Object.keys(dbVars).length > 0) {
                            writeOutput("Setting DB vars");
                            return bigIp.onboard.setDbVars(dbVars);
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);

                        var registrationKey = options.license;
                        var addOnKeys = options.addOn;

                        if (registrationKey || addOnKeys.length > 0) {
                            writeOutput("Licensing.");

                            return bigIp.onboard.license(
                                {
                                    registrationKey: registrationKey,
                                    addOnKeys: addOnKeys,
                                    overwrite: true
                                }
                            );
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);

                        if (Object.keys(modules).length > 0) {
                            writeOutput("Provisioning modules: " + JSON.stringify(modules, null, 4));
                            return bigIp.onboard.provision(modules);
                        }
                        else {
                            return q();
                        }
                    })
                    .then(function(response) {
                        writeResponse(response);
                        writeOutput("Saving config.");
                        return bigIp.save();
                    })
                    .then(function(response) {
                        writeResponse(response);
                        writeOutput("BIG-IP onboard complete.");
                        return bigIp.rebootRequired();
                    })
                    .then(function(response) {
                        if (response) {
                            if (options.reboot) {
                                writeOutput('Reboot required. Rebooting...');
                                return bigIp.reboot();
                            }
                            else {
                                writeOutput('Reboot required. Skipping due to --no-reboot option.');
                            }
                        }
                    })
                    .catch(function(err) {
                        writeOutput("BIG-IP onboard failed: " + (typeof err === 'object' ? err.message : err));
                    })
                    .done(function() {
                        writeOutput("Onboard finished at: " + new Date().toUTCString());

                        if (options.signal) {
                            writeOutput("Signalling " + options.signal);
                            try {
                                process.kill(options.signal, 'SIGUSR1');
                            }
                            catch (err) {
                                writeOutput("Signal failed: " + err.message);
                            }
                        }

                        if (cb) {
                            cb();
                        }
                    });
            }
            finally {
                fs.closeSync(logFile);
            }
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
