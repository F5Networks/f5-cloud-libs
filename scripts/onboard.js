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
            var q = require("q");
            var BigIp = require('../lib/bigIp');
            var util = require('../lib/util');
            var dbVars = {};
            var modules = {};
            var passwords = {};
            var rootPasswords = {};
            var logFile;
            var logFileName;
            var bigIp;
            var i;

            var KEYS_TO_MASK = ['-p', '--password', '--set-password', '--set-root-password'];

            testOpts = testOpts || {};

            /**
             * Special case of util.map. Used to parse root password options in the form of
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
                .option('--ntp <ntp-server>', 'Set NTP server. For multiple NTP servers, use multiple --ntp entries.', util.collect, [])
                .option('--tz <timezone>', 'Set timezone for NTP setting.')
                .option('--dns <DNS server>', 'Set DNS server. For multiple DNS severs, use multiple --dns entries.', util.collect, [])
                .option('-l, --license <license_key>', 'License BIG-IP with <license_key>.')
                .option('-a, --add-on <add_on_key>', 'License BIG-IP with <add_on_key>. For multiple keys, use multiple -a entries.', util.collect, [])
                .option('-n, --hostname <hostname>', 'Set BIG-IP hostname.')
                .option('-g, --global-setting <name:value>', 'Set global setting <name> to <value>. For multiple settings, use multiple -g entries.', util.map, globalSettings)
                .option('-d, --db <name:value>', 'Set db variable <name> to <value>. For multiple settings, use multiple -d entries.', util.map, dbVars)
                .option('--set-password <user:new_password>', 'Set <user> password to <new_password>. For multiple users, use multiple --set-password entries.', util.map, passwords)
                .option('--set-root-password <old:old_password,new:new_password>', 'Set the password for the root user from <old_password> to <new_password>.', parseRootPasswords, rootPasswords)
                .option('-m, --module <name:level>', 'Provision module <name> to <level>. For multiple modules, use multiple -m entries.', util.map, modules)
                .option('--no-reboot', 'Skip reboot even if it is recommended.')
                .option('--background', 'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.')
                .option('--signal <pid>', 'Process ID to send USR1 to when onboarding is complete (but before rebooting if we are rebooting).')
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
            if (options.password || Object.keys(passwords).length > 0 || Object.keys(rootPasswords).length > 0) {
                for (i = 0; i < process.argv.length; ++i) {
                    if (KEYS_TO_MASK.indexOf(process.argv[i]) !== -1) {
                        process.argv[i + 1] = "*******";
                    }
                }
            }
            writeOutput(process.argv[1] + " called with " + process.argv.slice().join(" "));

            // Create the bigIp client object
            bigIp = testOpts.bigIp || new BigIp(options.host, options.user, options.password);

            // Use hostname if both hostname and global-settings hostname are set
            if (globalSettings && options.hostname) {
                if (globalSettings.hostname || globalSettings.hostName) {
                    writeOutput("Using host-name option to override global-settings hostname");
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
                })
                .then(function(response) {
                    writeResponse(response);

                    if (options.hostname) {
                        writeOutput("Setting hostname to " + options.hostname);
                        return bigIp.onboard.hostname(options.hostname);
                    }
                })
                .then(function(response) {
                    writeResponse(response);

                    if (globalSettings) {
                        writeOutput("Setting global settings.");
                        return bigIp.onboard.globalSettings(globalSettings);
                    }
                })
                .then(function(response) {
                    writeResponse(response);

                    if (Object.keys(dbVars).length > 0) {
                        writeOutput("Setting DB vars");
                        return bigIp.onboard.setDbVars(dbVars);
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
                })
                .then(function(response) {
                    writeResponse(response);

                    if (Object.keys(modules).length > 0) {
                        writeOutput("Provisioning modules: " + JSON.stringify(modules, null, 4));
                        return bigIp.onboard.provision(modules);
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
