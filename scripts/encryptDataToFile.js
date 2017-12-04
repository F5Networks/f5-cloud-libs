/**
 * Copyright 2017 F5 Networks, Inc.
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
    const cryptoUtil = require('../lib/cryptoUtil');

    var runner;

    module.exports = runner = {

        /**
         * Runs the encryptDataToFile script
         *
         * Notes:
         *
         *    + Only runs locally on a BIG-IP. Cannot run on a remote BIG-IP.
         *    + Uses tmsh rather than iControl REST so that we do not need to take in a password
         *
         * @param {String[]} argv - The process arguments
         * @param {Object}   testOpts - Options used during testing
         * @param {Object}   testOpts.bigIp - BigIp object to use for testing
         * @param {Function} cb - Optional cb to call when done
         */
        run: function(argv, testOpts, cb) {
            const assert = require('assert');
            const q = require('q');
            const options = require('commander');
            const Logger = require('../lib/logger');
            const ipc = require('../lib/ipc');
            const signals = require('../lib/signals');
            const util = require('../lib/util');
            const localKeyUtil = require('../lib/localKeyUtil');
            const KEYS = require('../lib/sharedConstants').KEYS;

            var loggerOptions = {};
            var logger;
            var loggableArgs;
            var logFileName;
            var waitPromise;
            var i;

            const DEFAULT_LOG_FILE = '/tmp/encryptDataToFile.log';
            const KEYS_TO_MASK = ['--data'];

            testOpts = testOpts || {};

            try {
                // Can't use getCommonOptions here because we don't take host, user, password options
                options
                    .version('3.5.0')
                    .option('--background', 'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.')
                    .option('--signal <signal>', 'Signal to send when done. Default ENCRYPTION_DONE.')
                    .option('--wait-for <signal>', 'Wait for the named signal before running.')
                    .option('--log-level <level>', 'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info')
                    .option('-o, --output <file>', 'Log to file as well as console. This is the default if background process is spawned. Default is ' + DEFAULT_LOG_FILE)
                    .option('--data <data>', 'Data to encrypt (use this or --data-file)')
                    .option('--data-file <data_file>', 'Full path to file with data (use this or --data)')
                    .option('--out-file <file_name>', 'Full path to file in which to write encrypted data')
                    .parse(argv);

                assert.ok(options.data || options.dataFile, 'One of --data or --data-file must be specified');
                if (options.data && options.dataFile) {
                    assert.fail('Only one of --data or --data-file may be specified.');
                }
                assert.ok(options.outFile, '--out-file parameter is required');

                loggerOptions.console = options.console;
                loggerOptions.logLevel = options.logLevel;
                loggerOptions.module = module;

                if (options.output) {
                    loggerOptions.fileName = options.output;
                }

                logger = Logger.getLogger(loggerOptions);
                ipc.setLoggerOptions(loggerOptions);
                util.setLoggerOptions(loggerOptions);
                localKeyUtil.setLoggerOptions(loggerOptions);

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

                if (options.waitFor) {
                    logger.info("Waiting for", options.waitFor);
                    waitPromise = ipc.once(options.waitFor);
                }
                else {
                    waitPromise = q();
                }

                waitPromise
                    .then(function() {
                        logger.info("Encrypt data to file starting.");
                        ipc.send(signals.ENCRYPTION_RUNNING);
                    })
                    .then(function() {
                        return localKeyUtil.generateAndInstallKeyPair(KEYS.LOCAL_PUBLIC_KEY_DIR, KEYS.LOCAL_PUBLIC_KEY_PATH, KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY);
                    })
                    .then(function() {
                        if (options.data) {
                            return q(options.data);
                        }
                        else {
                            return util.readDataFromFile(options.dataFile);
                        }
                    })
                    .then(function(data) {
                        logger.info("Encrypting data.");
                        return cryptoUtil.encrypt(KEYS.LOCAL_PUBLIC_KEY_PATH, data.toString());
                    })
                    .then(function(encryptedData) {
                        logger.info("Writing encrypted data to", options.outFile);
                        return util.writeDataToFile(encryptedData, options.outFile);
                    })
                    .catch(function(err) {
                        logger.error("Encryption failed:", err.message);
                    })
                    .done(function() {
                        ipc.send(options.signal || signals.ENCRYPTION_DONE);

                        if (cb) {
                            cb();
                        }

                        util.logAndExit("Encryption done.");
                    });

                // If we reboot, exit - otherwise cloud providers won't know we're done.
                // But, if we're the one doing the reboot, we'll exit on our own through
                // the normal path.
                if (!options.forceReboot) {
                    ipc.once('REBOOT')
                        .then(function() {
                            // Make sure the last log message is flushed before exiting.
                            util.logAndExit("REBOOT signaled. Exiting.");
                        });
                }
            }
            catch (err) {
                if (logger) {
                    logger.error("Encryption error:", err);
                    if (cb) {
                        cb(err);
                    }
                }
                else {
                    console.log("Encryption error:", err);
                    if (cb) {
                        cb(err);
                    }
                }
            }
        }
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
