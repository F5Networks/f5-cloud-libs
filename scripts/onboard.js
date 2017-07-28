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

    var globalSettings = {
        guiSetup: 'disabled'
    };
    var options;
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
            var rootPasswords = {};
            var updateUsers = [];
            var loggerOptions = {};
            var loggableArgs;
            var logger;
            var logFileName;
            var bigIp;
            var rebooting;
            var index;
            var i;

            var DEFAULT_LOG_FILE = '/tmp/onboard.log';
            var ARGS_FILE_ID = 'onboard_' + Date.now();

            var KEYS_TO_MASK = ['-p', '--password', '--set-password', '--set-root-password', '--big-iq-password'];
            var REQUIRED_OPTIONS = ['host', 'user'];

            options = require('./commonOptions');
            testOpts = testOpts || {};

            /**
             * Special case of util.pair. Used to parse root password options in the form of
             *     old:oldRootPassword,new:newRootPassword
             * Since passwords can contain any character, a delimiter is difficult to find.
             * Compromise by looking for ',new:' as a delimeter
             */
            var parseRootPasswords = function(passwordsValue) {
                var set = passwordsValue.split(",new:");

                if (set.length == 2) {
                    rootPasswords.old = set[0].split("old:")[1];
                    rootPasswords.new = set[1];
                }
            };

            try {
                options = options.getCommonOptions(DEFAULT_LOG_FILE)
                    .option('--ntp <ntp_server>', 'Set NTP server. For multiple NTP servers, use multiple --ntp entries.', util.collect, [])
                    .option('--tz <timezone>', 'Set timezone for NTP setting.')
                    .option('--dns <DNS server>', 'Set DNS server. For multiple DNS severs, use multiple --dns entries.', util.collect, [])
                    .option('--ssl-port <ssl_port>', 'Set the SSL port for the management IP', parseInt)
                    .option('-l, --license <license_key>', 'License BIG-IP with <license_key>.')
                    .option('-a, --add-on <add_on_key>', 'License BIG-IP with <add_on_key>. For multiple keys, use multiple -a entries.', util.collect, [])
                    .option('--license-pool', 'License BIG-IP from a BIG-IQ license pool. Supply the following:')
                    .option('    --big-iq-host <ip_address or FQDN>', '    IP address or FQDN of BIG-IQ')
                    .option('    --big-iq-user <user>', '    BIG-IQ admin user name')
                    .option('    --big-iq-password <password>', '    BIG-IQ admin user password.')
                    .option('    --big-iq-password-uri <password_uri>', '    URI (file, http(s), arn) to location that contains BIG-IQ admin user password. Use this or --big-iq-password.')
                    .option('    --license-pool-name <pool_name>', '    Name of BIG-IQ license pool.')
                    .option('    --big-ip-mgmt-address <big_ip_address>', '    IP address or FQDN of BIG-IP management port. Use this if BIG-IP reports an address not reachable from BIG-IQ.')
                    .option('    --big-ip-mgmt-port <big_ip_port>', '    Port for the management address. Use this if the BIG-IP is not reachable from BIG-IQ via the port used in --port')
                    .option('-n, --hostname <hostname>', 'Set BIG-IP hostname.')
                    .option('-g, --global-setting <name:value>', 'Set global setting <name> to <value>. For multiple settings, use multiple -g entries.', util.pair, globalSettings)
                    .option('-d, --db <name:value>', 'Set db variable <name> to <value>. For multiple settings, use multiple -d entries.', util.pair, dbVars)
                    .option('--set-root-password <old:old_password,new:new_password>', 'Set the password for the root user from <old_password> to <new_password>.', parseRootPasswords)
                    .option('--update-user <user:user,password:password,passwordUrl:passwordUrl,role:role,shell:shell>', 'Update user password (or password from passwordUrl), or create user with password, role, and shell. Role and shell are only valid on create.', util.map, updateUsers)
                    .option('-m, --module <name:level>', 'Provision module <name> to <level>. For multiple modules, use multiple -m entries.', util.pair, modules)
                    .option('--ping [address]', 'Do a ping at the end of onboarding to verify that the network is up. Default address is f5.com')
                    .option('--update-sigs', 'Update ASM signatures')
                    .parse(argv);

                loggerOptions.console = options.console;
                loggerOptions.logLevel = options.logLevel;
                loggerOptions.module = module;

                if (options.output) {
                    loggerOptions.fileName = options.output;
                }

                logger = Logger.getLogger(loggerOptions);
                ipc.setLoggerOptions(loggerOptions);
                util.setLoggerOptions(loggerOptions);

                // Log the input, but don't log passwords
                loggableArgs = argv.slice();
                for (i = 0; i < loggableArgs.length; ++i) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = "*******";
                    }
                }
                index = loggableArgs.indexOf('--update-user');
                if (index !== -1) {
                    loggableArgs[index + 1] = loggableArgs[index + 1].replace(/password:([^,])+/, '*******');
                }
                logger.info(loggableArgs[1] + " called with", loggableArgs.join(' '));

                for (i = 0; i < REQUIRED_OPTIONS.length; ++i) {
                    if (!options[REQUIRED_OPTIONS[i]]) {
                        logger.error(REQUIRED_OPTIONS[i], "is a required command line option.");
                        return;
                    }
                }

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
                        // Whatever we're waiting for is done, so don't wait for
                        // that again in case of a reboot
                        return util.saveArgs(argv, ARGS_FILE_ID, ['--wait-for']);
                    })
                    .then(function() {
                        logger.info("Onboard starting.");
                        ipc.send(signals.ONBOARD_RUNNING);

                        // Create the bigIp client object
                        bigIp = testOpts.bigIp || new BigIp({loggerOptions: loggerOptions});

                        logger.info("Initializing BIG-IP.");
                        return bigIp.init(
                            options.host,
                            options.user,
                            options.password || options.passwordUrl,
                            {
                                port: options.port,
                                passwordIsUrl: typeof options.passwordUrl !== 'undefined'
                            }
                        );
                    })
                    .then(function() {
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
                        var portIndex;

                        logger.debug(response);

                        // If we just successfully changed the SSL port, save --port
                        // as an argument in case we reboot
                        if (options.sslPort) {

                            // If there is already a port argument, remove it
                            if (options.port) {
                                portIndex = argv.indexOf('--port');
                                if (portIndex !== -1) {
                                    argv.splice(portIndex, 2);
                                }
                            }
                            argv.push('--port', options.sslPort);
                            return util.saveArgs(argv, ARGS_FILE_ID);
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
                        var i;
                        var promises = [];

                        logger.debug(response);

                        if (updateUsers.length > 0) {
                            for (i = 0; i < updateUsers.length; ++i) {
                                logger.info("Updating user", updateUsers[i].user);
                                promises.push(bigIp.onboard.updateUser(updateUsers[i].user,
                                                                       updateUsers[i].password || updateUsers[i].passwordUrl,
                                                                       updateUsers[i].role,
                                                                       updateUsers[i].shell,
                                                                       {
                                                                           passwordIsUrl: typeof updateUsers[i].passwordUrl !== 'undefined'
                                                                       }));
                            }
                            return q.all(promises);
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

                        else {
                            if (options.licensePool) {
                                if (!options.bigIqHost || !options.bigIqUser || !(options.bigIqPassword || options.bigIqPasswordUri) || !options.licensePoolName) {
                                    logger.error('When using a BIG-IQ license pool, all of big-iq-host, big-iq-user, big-iq-password[-url], and license-pool-name are required');
                                    return;
                                }

                                logger.info("Getting license from BIG-IQ license pool.");
                                return bigIp.onboard.licenseViaBigIq(
                                    options.bigIqHost,
                                    options.bigIqUser,
                                    options.bigIqPassword || options.bigIqPasswordUri,
                                    options.licensePoolName,
                                    {
                                        passwordIsUri: typeof options.bigIqPasswordUri !== 'undefined',
                                        bigIpMgmtAddress: options.bigIpMgmtAddress,
                                        bigIpMgmtPort: options.bigIpMgmtPort
                                    });
                            }
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
                        if (response === true) {
                            if (options.reboot) {
                                logger.warn('Reboot required. Rebooting...');
                                rebooting = true;
                                return util.reboot(bigIp);
                            }
                            else {
                                logger.warn('Reboot required. Skipping due to --no-reboot option.');
                            }
                        }
                    })
                    .catch(function(err) {
                        err = err || new Error();
                        logger.error("BIG-IP onboard failed:", err.message);

                        if (err instanceof ActiveError) {
                            logger.warn("BIG-IP active check failed. Rebooting.");
                            rebooting = true;
                            return util.reboot(bigIp);
                        }
                    })
                    .done(function(response) {
                        logger.debug(response);

                        if (!rebooting) {
                            util.deleteArgs(ARGS_FILE_ID);
                            ipc.send(options.signal || signals.ONBOARD_DONE);
                        }

                        if (cb) {
                            cb();
                        }

                        util.logAndExit("Onboard finished.");
                    });

                // If we reboot due to some other script, exit - otherwise cloud providers won't know we're done.
                // If we forced the reboot ourselves, we will exit when that call completes.
                ipc.once('REBOOT')
                    .then(function() {
                        if (!rebooting) {
                            util.logAndExit("REBOOT signaled. Exiting.");
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
