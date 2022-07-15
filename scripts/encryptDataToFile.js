/**
 * Copyright 2017-2018 F5 Networks, Inc.
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

const cryptoUtil = require('../lib/cryptoUtil');
const assert = require('assert');
const q = require('q');
const options = require('commander');
const Logger = require('../lib/logger');
const ipc = require('../lib/ipc');
const signals = require('../lib/signals');
const util = require('../lib/util');
const localKeyUtil = require('../lib/localKeyUtil');
const KEYS = require('../lib/sharedConstants').KEYS;
const REG_EXPS = require('../lib/sharedConstants').REG_EXPS;

(function run() {
    const runner = {
        /**
         * Runs the encryptDataToFile script
         *
         * Notes:
         *
         *    + Only runs locally on a BIG-IP. Cannot run on a remote BIG-IP.
         *    + Uses tmsh rather than iControl REST so that we do not need to take in a password
         *
         * @param {String[]} argv - The process arguments
         * @param {Function} cb - Optional cb to call when done
         */
        run(argv, cb) {
            const loggerOptions = {};
            let logger;
            let loggableArgs;
            let logFileName;
            let waitPromise;

            let exiting;

            const DEFAULT_LOG_FILE = '/tmp/encryptDataToFile.log';
            const KEYS_TO_MASK = ['--data'];

            try {
                /* eslint-disable max-len */

                // Can't use getCommonOptions here because we don't take host, user, password options
                options
                    .version('4.28.0')
                    .option(
                        '--background',
                        'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.'
                    )
                    .option(
                        '--signal <signal>',
                        'Signal to send when done. Default ENCRYPTION_DONE.'
                    )
                    .option(
                        '--wait-for <signal>',
                        'Wait for the named signal before running.'
                    )
                    .option(
                        '--log-level <level>',
                        'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info'
                    )
                    .option(
                        '-o, --output <file>',
                        `Log to file as well as console. This is the default if background process is spawned. Default is ${DEFAULT_LOG_FILE}`
                    )
                    .option(
                        '-e, --error-file <file>',
                        'Log exceptions to a specific file. Default is /tmp/cloudLibsError.log, or cloudLibsError.log in --output file directory'
                    )
                    .option(
                        '--data <data>',
                        'Data to encrypt (use this or --data-file)'
                    )
                    .option(
                        '--data-file <data_file>',
                        'Full path to file with data (use this or --data)'
                    )
                    .option(
                        '--out-file <file_name>',
                        `Full path to file in which to write encrypted data. If symmetric option is used, file format will be:
                                                    {
                                                        encryptedKey: <encryptedKey>,
                                                        iv: <initializationVector>,
                                                        privateKey: {
                                                            name: <private_key_name>,
                                                            folder: <private_key_folder>
                                                        },
                                                        encryptedData: <base64_encoded_encryptedData>
                                                    }`
                    )
                    .option(
                        '--private-key-name <name_for_private_key>',
                        'Name of the private key. Will be created if missing. Default is sharedConstants.KEYS.LOCAL_PRIVATE_KEY. Matching public key is written to sharedConstants.KEYS.LOCAL_PUBLIC_KEY_DIR. If this option is specified, public key is also installed as an ifile.'
                    )
                    .option(
                        '--private-key-folder <name_for_private_key_folder>',
                        'Name of the BIG-IP folder in which to find/create the private key. If private-key-name is specified, default is Common. Otherwise, this is ignored.'
                    )
                    .option(
                        '--symmetric',
                        'Use symmetric encryption and place the encrypted symmetric key in <out-file>'
                    )
                    .option(
                        '--no-console',
                        'Do not log to console. Default false (log to console).'
                    )
                    .parse(argv);
                /* eslint-enable max-len */

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

                if (options.errorFile) {
                    loggerOptions.errorFile = options.errorFile;
                }

                logger = Logger.getLogger(loggerOptions);
                ipc.setLoggerOptions(loggerOptions);
                util.setLoggerOptions(loggerOptions);
                localKeyUtil.setLoggerOptions(loggerOptions);

                // When running in cloud init, we need to exit so that cloud init can complete and
                // allow the BIG-IP services to start
                if (options.background) {
                    logFileName = options.output || DEFAULT_LOG_FILE;
                    logger.info('Spawning child process to do the work. Output will be in', logFileName);
                    util.runInBackgroundAndExit(process, logFileName);
                }

                // Log the input, but don't log passwords
                loggableArgs = argv.slice();
                for (let i = 0; i < loggableArgs.length; i++) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = '*******';
                    }
                }
                logger.info(`${loggableArgs[1]} called with`, loggableArgs.join(' '));

                if (options.waitFor) {
                    logger.info('Waiting for', options.waitFor);
                    waitPromise = ipc.once(options.waitFor);
                } else {
                    waitPromise = q();
                }

                const generateOptions = {};
                let publicKeyPath;
                let privateKeyFolder;
                let privateKeyName;

                if (options.privateKeyName) {
                    // Force Private Key Name to use .key suffix
                    privateKeyName = (options.privateKeyName.match(REG_EXPS.KEY_SUFFIX))
                        ? options.privateKeyName
                        : `${options.privateKeyName}.key`;
                    privateKeyFolder = options.privateKeyFolder || 'Common';
                    // If a Private Key is specified with .key suffix, replace it with '.pub'.
                    const publicKeyName = `${privateKeyName.replace(REG_EXPS.KEY_SUFFIX, '')}`;
                    publicKeyPath = `${KEYS.LOCAL_PUBLIC_KEY_DIR}${publicKeyName}.pub`;
                    generateOptions.installPublic = true;
                } else {
                    privateKeyName = KEYS.LOCAL_PRIVATE_KEY;
                    privateKeyFolder = KEYS.LOCAL_PRIVATE_KEY_FOLDER;
                    publicKeyPath = KEYS.LOCAL_PUBLIC_KEY_PATH;
                }

                waitPromise
                    .then(() => {
                        logger.info('Encrypt data to file starting.');
                        ipc.send(signals.ENCRYPTION_RUNNING);
                    })
                    .then(() => {
                        return localKeyUtil.generateAndInstallKeyPair(
                            KEYS.LOCAL_PUBLIC_KEY_DIR,
                            publicKeyPath,
                            privateKeyFolder,
                            privateKeyName,
                            generateOptions
                        );
                    })
                    .then((updatedPublicKeyPath) => {
                        // If we installed our own public key (ie, we're not using the default
                        // locations, update our public key path)
                        if (updatedPublicKeyPath) {
                            publicKeyPath = updatedPublicKeyPath;
                        }

                        if (options.data) {
                            return q(options.data);
                        }
                        return util.readDataFromFile(options.dataFile);
                    })
                    .then((data) => {
                        logger.info('Encrypting data.');
                        if (options.symmetric) {
                            logger.info('Symmetric encryption');
                            return cryptoUtil.symmetricEncrypt(publicKeyPath, data.toString());
                        }
                        return cryptoUtil.encrypt(publicKeyPath, data.toString());
                    })
                    .then((encryptedData) => {
                        logger.info('Writing encrypted data to', options.outFile);
                        const updatedData = encryptedData;
                        let dataToWrite;
                        if (options.symmetric) {
                            updatedData.privateKey = {
                                name: privateKeyName,
                                folder: privateKeyFolder
                            };
                            dataToWrite = JSON.stringify(updatedData);
                        } else {
                            dataToWrite = updatedData;
                        }

                        return util.writeDataToFile(dataToWrite, options.outFile);
                    })
                    .catch((err) => {
                        ipc.send(signals.CLOUD_LIBS_ERROR);

                        const error = `Encryption failed: ${err.message}`;
                        util.logError(error, loggerOptions);
                        util.logAndExit(error, 'error', 1);

                        exiting = true;
                    })
                    .done(() => {
                        if (!exiting) {
                            ipc.send(options.signal || signals.ENCRYPTION_DONE);
                        }

                        if (cb) {
                            cb();
                        }
                        if (!exiting) {
                            util.logAndExit('Encryption done.');
                        }
                    });

                // If another script has signaled an error, exit, marking ourselves as DONE
                ipc.once(signals.CLOUD_LIBS_ERROR)
                    .then(() => {
                        ipc.send(options.signal || signals.ENCRYPTION_DONE);
                        util.logAndExit('ERROR signaled from other script. Exiting');
                    });
            } catch (err) {
                if (logger) {
                    logger.error('Encryption error:', err);
                    if (cb) {
                        cb(err);
                    }
                } else if (cb) {
                    cb(err);
                }
            }
        }
    };

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
