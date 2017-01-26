/**
 * Copyright 2016, 2017 F5 Networks, Inc.
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

    var fs = require('fs');
    var childProcess = require('child_process');
    var waiting = 0;
    var runner;
    var logger;

    var MAX_TRIES = 3;

    var spawnScript = function(module, arrayArgs, stringArgs, tryNum) {
        var args = arrayArgs ? arrayArgs.slice() : [];
        var cp;

        if (typeof tryNum === 'undefined') {
            tryNum = 1;
        }

        if (stringArgs) {
            stringArgs.trim().split(/\s+/).forEach(function(arg) {
                args.push(arg);
            });
        }

        logger.debug("Spawning child process", module, args);
        cp = childProcess.fork(
            module,
            args,
            {
                cwd: '/config/f5-cloud-libs/scripts',
                stdio: 'ignore',
                detached: true
            }
        );

        waiting++;

        cp.on('error', function(error) {
            logger.error(cp.pid, "got error:", error);
        });

        cp.on('exit', function(code, signal) {
            logger.verbose(module, "exitted with code:", code === null ? 'null' : code, "/ signal:", signal === null ? 'null' : signal);

            // Occasionally in Azure, a script just exits early with a bad exit code
            // for no apparent reason
            if (code !== null && code !== 0 && tryNum < MAX_TRIES) {
                logger.info("Bad exit code for", module, "restrying.");
                spawnScript(module, arrayArgs, stringArgs, tryNum + 1);
            }

            waiting--;

            if (!waiting) {
                // Make sure the last log message is flushed before exitting.
                logger.info("All children have exitted. Exitting.", function() {
                    process.exit();
                });
            }
        });
    };

    module.exports = runner = {

        /**
         * Runs an arbitrary script
         *
         * @param {String[]} script - Arguments to pass to runScript
         */
        run: function(argv) {
            try {
                var loggerOptions = {};
                var loggableArgs = [];
                var loggableArgsSplit;
                var ipc;
                var Logger;
                var logLevel;
                var argIndex;
                var args;
                var clArgIndex;
                var clArgStart;
                var clArgEnd;
                var scriptArgs;
                var shellOutput;
                var f5CloudLibsTag;
                var fstats;
                var doInstall;
                var i;
                var j;

                var KEYS_TO_MASK = ['-p', '--password', '--set-password', '--set-root-password'];

                // Log the input, but don't log passwords...
                // ... copy args expanding those with spaces
                for (i = 0; i < argv.length; i++) {
                    if (argv[i].indexOf(' ') === -1) {
                        loggableArgs.push(argv[i]);
                    }
                    else {
                        loggableArgsSplit = argv[i].split(/\s+/);
                        for (j = 0; j < loggableArgsSplit.length; ++j) {
                            loggableArgs.push(loggableArgsSplit[j]);
                        }
                    }
                }

                // ... mask the passwords
                for (i = 0; i < loggableArgs.length; ++i) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = "*******";
                    }
                }
                console.log(loggableArgs[1] + " called with", loggableArgs.join(' '));

                // We're parsing command line options manually because the commander module used
                // in other cloud libs scripts can't grab the cl-args as a single string in the
                // way it is passes from ARM templates

                argIndex = argv.indexOf('--help');
                if (argIndex !== -1) {
                    console.log();
                    console.log("  Usage: runScripts [options]");
                    console.log();
                    console.log("  Options:");
                    console.log();
                    console.log("    --help\t\t\tOutputusage information");
                    console.log("    --onboard <args>\t\tRun the onboard.js script with args.");
                    console.log("    --cluster <args>\t\tRun the cluster.js script with args.");
                    console.log("    --network <args>\t\tRun the network.js script with args.");
                    console.log("    --script <args>\t\tRun the runScript.js script with args. To run multiple scripts, use multiple --script entrires.");
                    process.exit();
                }

                // In Azure, mysql takes extra time to start
                console.log('Resetting mysql start delay');
                shellOutput = childProcess.execSync("sed -i 's/sleep\ 5/sleep\ 10/' /etc/init.d/mysql");
                console.log(shellOutput.toString());

                ipc = require('/config/f5-cloud-libs/lib/ipc');
                Logger = require('/config/f5-cloud-libs/lib/logger');
                loggerOptions.console = true;
                loggerOptions.logLevel = 'info';
                loggerOptions.fileName = '/var/log/runScripts.log';

                argIndex = argv.indexOf('--log-level');
                if (argIndex != -1) {
                    logLevel = argv[argIndex + 1];
                    console.log("Setting log level to", logLevel);
                    loggerOptions.logLevel = logLevel;
                }

                logger = Logger.getLogger(loggerOptions);

                logger.info("Running scripts.");

                argIndex = argv.indexOf('--onboard');
                while (argIndex !== -1) {
                    logger.debug("onboard arg index", argIndex);
                    scriptArgs = argv[argIndex + 1];
                    spawnScript("onboard.js", undefined, scriptArgs);
                    argIndex = argv.indexOf('--onboard', argIndex + 1);
                }

                argIndex = argv.indexOf('--cluster');
                while (argIndex !== -1) {
                    logger.debug("cluster arg index", argIndex);
                    scriptArgs = argv[argIndex + 1];
                    spawnScript("cluster.js", undefined, scriptArgs);
                    argIndex = argv.indexOf('--cluster', argIndex + 1);
                }

                argIndex = argv.indexOf('--network');
                while (argIndex !== -1) {
                    logger.debug("network arg index", argIndex);
                    scriptArgs = argv[argIndex + 1];
                    spawnScript("network.js", undefined, scriptArgs);
                    argIndex = argv.indexOf('--network', argIndex + 1);
                }

                argIndex = argv.indexOf('--script');
                /* jshint loopfunc: true */
                while (argIndex !== -1) {
                    logger.debug("script arg index", argIndex);

                    args = [];
                    scriptArgs = argv[argIndex + 1];
                    clArgIndex = scriptArgs.indexOf('--cl-args');
                    if (clArgIndex !== -1) {
                        args.push('--cl-args');

                        // Push the stuff in single quotes following cl-args as one entry
                        clArgStart = scriptArgs.indexOf("'", clArgIndex);
                        clArgEnd = scriptArgs.indexOf("'", clArgStart + 1);
                        args.push(scriptArgs.substring(clArgStart + 1, clArgEnd));

                        // Grab everything up to --cl-args
                        if (clArgIndex > 0) {
                            scriptArgs.substring(0, clArgIndex).trim().split(/\s+/).forEach(function(arg) {
                                args.push(arg);
                            });
                        }

                        // Grab everything after the --cl-args argument
                        if (clArgEnd < scriptArgs.length - 1) {
                            scriptArgs.substring(clArgEnd + 1).trim().split(/\s+/).forEach(function(arg) {
                                args.push(arg);
                            });
                        }
                    }
                    else {
                        scriptArgs.split(/\s+/).forEach(function(arg) {
                            args.push(arg);
                        });
                    }
                    spawnScript("runScript.js", args);

                    argIndex = argv.indexOf('--script', argIndex + 1);
                }
                /* jshint loopfunc: false */

                // If we reboot, exit - otherwise Azure doesn't know the extensions script is done
                ipc.once('REBOOT')
                    .then(function() {
                        // Make sure the last log message is flushed before exitting.
                        logger.info("REBOOT signalled. Exitting.", function() {
                            process.exit();
                        });
                    });

            }
            catch (err) {
                console.log("Error running scripts: " + err);
            }

            if (logger) {
                logger.debug("Done spawning scripts.");
            }
        }
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
