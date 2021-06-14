/**
 * Copyright 2016-2018 F5 Networks, Inc.
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

const options = require('commander');
const fs = require('fs');
const q = require('q');
const childProcess = require('child_process');
const Logger = require('../lib/logger');
const ipc = require('../lib/ipc');
const signals = require('../lib/signals');
const util = require('../lib/util');

(function run() {
    const runner = {
        /**
         * Runs an arbitrary script
         *
         * @param {String[]} argv - The process arguments
         * @param {Function} cb - Optional cb to call when done
         */
        run(argv, cb) {
            const DEFAULT_LOG_FILE = '/tmp/runScript.log';
            const ARGS_FILE_ID = `runScript_${Date.now()}`;
            const KEYS_TO_MASK = ['--cl-args'];

            const loggerOptions = {};

            let loggableArgs;
            let logger;
            let logFileName;
            let clArgIndex;
            let exiting;

            try {
                /* eslint-disable max-len */
                options
                    .version('4.25.1')
                    .option(
                        '--background',
                        'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.'
                    )
                    .option(
                        '-f, --file <script>',
                        'File name of script to run.'
                    )
                    .option(
                        '-u, --url <url>',
                        'URL from which to download script to run. This will override --file.'
                    )
                    .option(
                        '--cl-args <command_line_args>',
                        'String of arguments to send to the script as command line arguments.'
                    )
                    .option(
                        '--shell <full_path_to_shell>',
                        'Specify the shell to run the command in. Default is to run command as a separate process (not through a shell).'
                    )
                    .option(
                        '--signal <signal>',
                        'Signal to send when done. Default SCRIPT_DONE.'
                    )
                    .option(
                        '--wait-for <signal>',
                        'Wait for the named signal before running.'
                    )
                    .option(
                        '--cwd <directory>',
                        'Current working directory for the script to run in.'
                    )
                    .option(
                        '--log-level <level>',
                        'Log level (none, error, warn, info, verbose, debug, silly). Default is info.',
                        'info'
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
                        '--no-console',
                        'Do not log to console. Default false (log to console).'
                    )
                    .parse(argv);
                /* eslint-enable max-len */

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

                // When running in cloud init, we need to exit so that cloud init can complete and
                // allow the BIG-IP services to start
                if (options.background) {
                    logFileName = options.output || DEFAULT_LOG_FILE;
                    logger.info('Spawning child process to do the work. Output will be in', logFileName);
                    util.runInBackgroundAndExit(process, logFileName);
                }

                // Log the input, but don't cl-args since it could contain a password
                loggableArgs = argv.slice();
                for (let i = 0; i < loggableArgs.length; i++) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = '*******';
                    }
                }
                logger.info(`${loggableArgs[1]} called with`, loggableArgs.join(' '));

                const mungedArgs = argv.slice();

                // With cl-args, we need to restore the single quotes around the args - shells remove them
                if (options.clArgs) {
                    logger.debug('Found clArgs - checking for single quotes');
                    clArgIndex = mungedArgs.indexOf('--cl-args') + 1;
                    logger.debug('clArgIndex:', clArgIndex);
                    if (mungedArgs[clArgIndex][0] !== "'") {
                        logger.debug('Wrapping clArgs in single quotes');
                        mungedArgs[clArgIndex] = `'${mungedArgs[clArgIndex]}'`;
                    }
                }

                // Save args in restart script in case we need to reboot to recover from an error
                logger.debug('Saving args for', options.file || options.url);
                util.saveArgs(mungedArgs, ARGS_FILE_ID)
                    .then(() => {
                        logger.debug('Args saved for', options.file || options.url);
                        if (options.waitFor) {
                            logger.info('Waiting for', options.waitFor);
                            return ipc.once(options.waitFor);
                        }
                        return q();
                    })
                    .then(() => {
                        // Whatever we're waiting for is done, so don't wait for
                        // that again in case of a reboot
                        if (options.waitFor) {
                            logger.debug('Signal received.');
                            return util.saveArgs(mungedArgs, ARGS_FILE_ID, ['--wait-for']);
                        }
                        return q();
                    })
                    .then(() => {
                        const deferred = q.defer();

                        if (options.url) {
                            logger.debug('Downloading', options.url);
                            util.download(options.url)
                                .then((fileName) => {
                                    options.file = fileName;
                                    fs.chmod(fileName, 0o755, () => {
                                        deferred.resolve();
                                    });
                                })
                                .catch((err) => {
                                    deferred.reject(err);
                                })
                                .done();
                        } else {
                            deferred.resolve();
                        }

                        return deferred.promise;
                    })
                    .then(() => {
                        const deferred = q.defer();
                        const cpOptions = {};

                        let args = [];
                        let cp;

                        logger.info(options.file, 'starting.');
                        if (options.file) {
                            ipc.send(signals.SCRIPT_RUNNING);

                            if (options.cwd) {
                                cpOptions.cwd = options.cwd;
                            }

                            if (options.shell) {
                                cpOptions.shell = options.shell;
                                cp = childProcess.exec(`${options.file} ${options.clArgs}`, cpOptions);
                            } else {
                                if (options.clArgs) {
                                    args = options.clArgs.split(/\s+/);
                                }
                                cp = childProcess.spawn(options.file, args, cpOptions);
                            }

                            cp.stdout.on('data', (data) => {
                                logger.info(data.toString().trim());
                            });

                            cp.stderr.on('data', (data) => {
                                logger.error(data.toString().trim());
                            });

                            cp.on('exit', (code, signal) => {
                                const status = signal || code.toString();
                                logger.info(
                                    options.file,
                                    'exited with',
                                    (signal ? 'signal' : 'code'),
                                    status
                                );
                                deferred.resolve();
                            });

                            cp.on('error', (err) => {
                                logger.error(options.file, 'error', err);
                            });
                        } else {
                            deferred.resolve();
                        }

                        return deferred.promise;
                    })
                    .catch((err) => {
                        ipc.send(signals.CLOUD_LIBS_ERROR);

                        const error = `Running custom script failed: ${err}`;
                        util.logError(error, loggerOptions);
                        util.logAndExit(error, 'error', 1);
                        exiting = true;
                    })
                    .done((response) => {
                        logger.debug(response);

                        util.deleteArgs(ARGS_FILE_ID);
                        if (!exiting) {
                            ipc.send(options.signal || signals.SCRIPT_DONE);
                        }

                        if (cb) {
                            cb();
                        }

                        if (!exiting) {
                            util.logAndExit('Custom script finished.');
                        }
                    });

                // If another script has signaled an error, exit, marking ourselves as DONE
                ipc.once(signals.CLOUD_LIBS_ERROR)
                    .then(() => {
                        ipc.send(options.signal || signals.SCRIPT_DONE);
                        util.logAndExit('ERROR signaled from other script. Exiting');
                    });
            } catch (err) {
                if (logger) {
                    logger.error('Custom script error:', err);
                }
            }

            // If we reboot, exit - otherwise cloud providers won't know we're done
            ipc.once('REBOOT')
                .then(() => {
                    util.logAndExit('REBOOT signaled. Exiting.');
                });
        }
    };

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
