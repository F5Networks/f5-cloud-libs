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

    var options = require('commander');
    var runner;

    module.exports = runner = {

        /**
         * Runs an arbitrary script
         *
         * @param {String[]} argv - The process arguments
         * @param {Object}   testOpts - Options used during testing
         * @param {Object}   testOpts.bigIp - BigIp object to use for testing
         * @param {Function} cb - Optional cb to call when done
         */
        run: function(argv, testOpts, cb) {
            var fs = require('fs');
            var q = require('q');
            var child_process = require('child_process');
            var Logger = require('../lib/logger');
            var ipc = require('../lib/ipc');
            var signals = require('../lib/signals');
            var util = require('../lib/util');
            var loggerOptions = {};
            var loggableArgs;
            var logger;
            var logFileName;
            var clArgIndex;
            var i;

            var DEFAULT_LOG_FILE = '/tmp/runScript.log';
            var ARGS_FILE_ID = 'runScript_' + Date.now();
            var KEYS_TO_MASK = ['--cl-args'];

            testOpts = testOpts || {};

            try {
                options
                    .version('3.5.0')
                    .option('--background', 'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.')
                    .option('-f, --file <script>', 'File name of script to run.')
                    .option('-u, --url <url>', 'URL from which to download script to run. This will override --file.')
                    .option('--cl-args <command_line_args>', 'String of arguments to send to the script as command line arguments.')
                    .option('--signal <signal>', 'Signal to send when done. Default SCRIPT_DONE.')
                    .option('--wait-for <signal>', 'Wait for the named signal before running.')
                    .option('--cwd <directory>', 'Current working directory for the script to run in.')
                    .option('--log-level <level>', 'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info')
                    .option('-o, --output <file>', 'Log to file as well as console. This is the default if background process is spawned. Default is ' + DEFAULT_LOG_FILE)
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

                // When running in cloud init, we need to exit so that cloud init can complete and
                // allow the BIG-IP services to start
                if (options.background) {
                    logFileName = options.output || DEFAULT_LOG_FILE;
                    logger.info("Spawning child process to do the work. Output will be in", logFileName);
                    util.runInBackgroundAndExit(process, logFileName);
                }

                // Log the input, but don't cl-args since it could contain a password
                loggableArgs = argv.slice();
                for (i = 0; i < loggableArgs.length; ++i) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = "*******";
                    }
                }
                logger.info(loggableArgs[1] + " called with", loggableArgs.join(' '));

                // With cl-args, we need to restore the single quotes around the args - shells remove them
                if (options.clArgs) {
                    logger.debug("Found clArgs - checking for single quotes");
                    clArgIndex = argv.indexOf('--cl-args') + 1;
                    logger.debug("clArgIndex:", clArgIndex);
                    if (argv[clArgIndex][0] !== "'") {
                        logger.debug("Wrapping clArgs in single quotes");
                        argv[clArgIndex] = "'" + argv[clArgIndex] + "'";
                    }
                }

                // Save args in restart script in case we need to reboot to recover from an error
                logger.debug("Saving args for", options.file || options.url);
                util.saveArgs(argv, ARGS_FILE_ID)
                    .then(function() {
                        logger.debug("Args saved for", options.file || options.url);
                        if (options.waitFor) {
                            logger.info("Waiting for", options.waitFor);
                            return ipc.once(options.waitFor);
                        }
                    })
                    .then(function() {
                        // Whatever we're waiting for is done, so don't wait for
                        // that again in case of a reboot
                        if (options.waitFor) {
                            logger.debug("Signal received.");
                            return util.saveArgs(argv, ARGS_FILE_ID, ['--wait-for']);
                        }
                    })
                    .then(function() {
                        var deferred = q.defer();

                        if (options.url) {
                            logger.debug("Downloading", options.url);
                            util.download(options.url)
                                .then(function(fileName) {
                                    options.file = fileName;
                                    fs.chmod(fileName, parseInt('0755',8), function() {
                                        deferred.resolve();
                                    });
                                })
                                .catch(function(err) {
                                    deferred.reject(err);
                                })
                                .done();
                        }
                        else {
                            deferred.resolve();
                        }

                        return deferred.promise;
                    })
                    .then(function() {
                        var deferred = q.defer();
                        var args = [];
                        var cp_options = {};
                        var cp;

                        logger.info(options.file, "starting.");
                        if (options.file) {
                            ipc.send(signals.SCRIPT_RUNNING);

                            if (options.clArgs) {
                                args = options.clArgs.split(/\s+/);
                            }

                            if (options.cwd) {
                                cp_options.cwd = options.cwd;
                            }

                            cp = child_process.spawn(options.file, args, cp_options);

                            cp.stdout.on('data', function(data) {
                                logger.info(data.toString().trim());
                            });

                            cp.stderr.on('data', function(data) {
                                logger.error(data.toString().trim());
                            });

                            cp.on('exit', function(code) {
                                logger.info(options.file, 'exited with code', code.toString());
                                deferred.resolve();
                            });

                            cp.on('error', function(err) {
                                logger.error(options.file, 'error', err);
                            });
                        }
                        else {
                            deferred.resolve();
                        }

                        return deferred.promise;
                    })
                    .catch(function(err) {
                        logger.error("Running custom script failed", err);
                    })
                    .done(function(response) {
                        logger.debug(response);

                        util.deleteArgs(ARGS_FILE_ID);
                        ipc.send(options.signal || signals.SCRIPT_DONE);

                        if (cb) {
                            cb();
                        }

                        util.logAndExit("Custom script finished.");
                    });
                }
                catch (err) {
                    if (logger) {
                        logger.error("Custom script error:", err);
                    }
                    else {
                        console.log("Custom script error:", err);
                    }
                }

            // If we reboot, exit - otherwise cloud providers won't know we're done
            ipc.once('REBOOT')
                .then(function() {
                    util.logAndExit("REBOOT signaled. Exiting.");
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
