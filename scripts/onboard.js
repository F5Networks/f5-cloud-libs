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
 'use strict';

(function() {

    var DEFAULT_LOG_FILE = '/tmp/onboard.log';
    var ARGS_FILE_ID = 'onboard';

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
            var q = require("q");
            var BigIp = require('../lib/bigIp');
            var Logger = require('../lib/logger');
            var ActiveError = require('../lib/activeError');
            var ipc = require('../lib/ipc');
            var signals = require('../lib/signals');
            var util = require('../lib/util');
            var dbVars = {};
            var modules = {};
            var passwords = {};
            var rootPasswords = {};
            var loggerOptions = {};
            var loggableArgs;
            var logger;
            var logFileName;
            var bigIp;
            var forceReboot;
            var i;

            var KEYS_TO_MASK = ['-p', '--password', '--set-password', '--set-root-password'];
            var REQUIRED_OPTIONS = ['host', 'user', 'password'];

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

            try {
                options.reboot = true;
                options
                    .option('--host <ip_address>', 'BIG-IP management IP to which to send commands.')
                    .option('-u, --user <user>', 'BIG-IP admin user name.')
                    .option('-p, --password <password>', 'BIG-IP admin user password.')
                    .option('--port <port>', 'BIG-IP management SSL port to connect to. Default 443.', parseInt)
                    .option('--ntp <ntp-server>', 'Set NTP server. For multiple NTP servers, use multiple --ntp entries.', util.collect, [])
                    .option('--tz <timezone>', 'Set timezone for NTP setting.')
                    .option('--dns <DNS server>', 'Set DNS server. For multiple DNS severs, use multiple --dns entries.', util.collect, [])
                    .option('--ssl-port <ssl_port>', 'Set the SSL port for the management IP', parseInt)
                    .option('-l, --license <license_key>', 'License BIG-IP with <license_key>.')
                    .option('-a, --add-on <add_on_key>', 'License BIG-IP with <add_on_key>. For multiple keys, use multiple -a entries.', util.collect, [])
                    .option('-n, --hostname <hostname>', 'Set BIG-IP hostname.')
                    .option('-g, --global-setting <name:value>', 'Set global setting <name> to <value>. For multiple settings, use multiple -g entries.', util.map, globalSettings)
                    .option('-d, --db <name:value>', 'Set db variable <name> to <value>. For multiple settings, use multiple -d entries.', util.map, dbVars)
                    .option('--set-password <user:new_password>', 'Set <user> password to <new_password>. For multiple users, use multiple --set-password entries.', util.map, passwords)
                    .option('--set-root-password <old:old_password,new:new_password>', 'Set the password for the root user from <old_password> to <new_password>.', parseRootPasswords, rootPasswords)
                    .option('-m, --module <name:level>', 'Provision module <name> to <level>. For multiple modules, use multiple -m entries.', util.map, modules)
                    .option('--ping [address]', 'Do a ping at the end of onboarding to verify that the network is up. Default address is f5.com')
                    .option('--update-sigs', 'Update ASM signatures')
                    .option('--no-reboot', 'Skip reboot even if it is recommended.')
                    .option('--background', 'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.')
                    .option('--signal <signal>', 'Signal to send when done. Default ONBOARD_DONE.')
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
                util.logger = logger;

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
                loggableArgs = argv.slice();
                for (i = 0; i < loggableArgs.length; ++i) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = "*******";
                    }
                }
                logger.info(loggableArgs[1] + " called with", loggableArgs.join(' '));

                // Create the bigIp client object
                bigIp = testOpts.bigIp || new BigIp(options.host,
                                                    options.user,
                                                    options.password,
                                                    {
                                                        port: options.port,
                                                        logger: logger
                                                    });

                // Use hostname if both hostname and global-settings hostname are set
                if (globalSettings && options.hostname) {
                    if (globalSettings.hostname || globalSettings.hostName) {
                        logger.info("Using host-name option to override global-settings hostname");
                        delete globalSettings.hostName;
                        delete globalSettings.hostname;
                    }
                }

                // Start processing...

                // Save args in restart script in case we need to reboot to recover from an error
                util.saveArgs(argv, ARGS_FILE_ID)
                    .then(function() {
                        if (options.waitFor) {
                            logger.info("Waiting for", options.waitFor);
                            return ipc.once(options.waitFor);
                        }
                    })
                    .then(function() {
                        logger.info("Onboard starting.");
                        ipc.send(signals.ONBOARD_RUNNING);

                        logger.info("Waiting for BIG-IP to be ready.");
                        return bigIp.ready();
                    })
                    .then(function() {
                        logger.info("BIG-IP is ready.");

                        if (options.sslPort) {
                            logger.info("Setting SSL port.");
                            return bigIp.onboard.sslPort(options.sslPort);
                        }
                    })
                    .then(function(response) {
                        var promises = [];
                        var user;

                        logger.debug(response);

                        if (Object.keys(passwords).length > 0) {
                            logger.info("Setting password(s).");
                            for (user in passwords) {
                                promises.push(bigIp.onboard.password(user, passwords[user]));
                            }

                            return q.all(promises);
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);

                        if (Object.keys(rootPasswords).length > 0) {
                            if (!rootPasswords.old || !rootPasswords.new) {
                                return q.reject("Old or new password missing for root user. Specify with --set-root-password old:old_root_password,new:new_root_password");
                            }

                            logger.info("Setting rootPassword.");
                            return bigIp.onboard.password('root', rootPasswords.new, rootPasswords.old);
                        }
                    })
                    .then(function(response) {
                        var ntpBody;

                        logger.debug(response);

                        if (options.ntp.length > 0 || options.tz) {
                            logger.info("Setting up NTP.");

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
                        logger.debug(response);

                        if (options.dns.length > 0) {
                            logger.info("Setting up DNS.");

                            return bigIp.modify(
                                '/tm/sys/dns',
                                {
                                    'name-servers': options.dns
                                }
                            );
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);

                        if (options.hostname) {
                            logger.info("Setting hostname to", options.hostname);
                            return bigIp.onboard.hostname(options.hostname);
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);

                        if (globalSettings) {
                            logger.info("Setting global settings.");
                            return bigIp.onboard.globalSettings(globalSettings);
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);

                        if (Object.keys(dbVars).length > 0) {
                            logger.info("Setting DB vars.");
                            return bigIp.onboard.setDbVars(dbVars);
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);

                        var registrationKey = options.license;
                        var addOnKeys = options.addOn;

                        if (registrationKey || addOnKeys.length > 0) {
                            logger.info("Licensing.");

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
                        logger.debug(response);

                        if (Object.keys(modules).length > 0) {
                            logger.info("Provisioning modules", modules);
                            return bigIp.onboard.provision(modules);
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);

                        if (options.updateSigs) {
                            logger.info("Updating ASM signatures");
                            return bigIp.create(
                                '/tm/asm/tasks/update-signatures',
                                {}
                            );
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);
                        logger.info("Saving config.");
                        return bigIp.save();
                    })
                    .then(function(response) {
                        logger.debug(response);
                        logger.info("Waiting for BIG-IP to be active.");
                        return bigIp.active();
                    })
                    .then(function(response) {
                        logger.debug(response);
                        var address;
                        if (options.ping) {
                            address = options.ping === true ? 'f5.com' : options.ping;
                            logger.info("Pinging", address);
                            return bigIp.ping(address);
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);
                        logger.info("BIG-IP onboard complete.");
                        return bigIp.rebootRequired();
                    })
                    .then(function(response) {
                        if (response) {
                            if (options.reboot) {
                                logger.warn('Reboot required. Rebooting...');
                                return bigIp.reboot();
                            }
                            else {
                                logger.warn('Reboot required. Skipping due to --no-reboot option.');
                            }
                        }
                    })
                    .then(function(response) {
                        logger.debug(response);
                        ipc.send(options.signal || signals.ONBOARD_DONE);
                    })
                    .catch(function(err) {
                        logger.error("BIG-IP onboard failed", err.message);

                        if (err instanceof ActiveError) {
                            logger.warn("BIG-IP active check failed. Preparing for reboot.");
                            forceReboot = util.prepareArgsForReboot();
                        }
                    })
                    .done(function(response) {
                        logger.debug(response);
                        logger.info("Onboard finished.");

                        if (forceReboot) {
                            logger.warn("Rebooting.");
                            bigIp.reboot();
                        }
                        else {
                            util.deleteArgs(ARGS_FILE_ID);
                        }

                        if (cb) {
                            cb();
                        }
                    });
            }
            catch (err) {
                if (logger) {
                    logger.error("Onbarding error:", err);
                }
                else {
                    console.log("Onbarding error:", err);
                }
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
