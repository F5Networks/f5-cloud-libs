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

const EOL = require('os').EOL;
const URL = require('url');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const http = require('http');
const https = require('https');
const q = require('q');
const Logger = require('./logger');
const ipc = require('./ipc');
const signals = require('./signals');
const cloudProviderFactory = require('./cloudProviderFactory');

const REBOOT_SCRIPTS_DIR = '/tmp/rebootScripts/';

const ARGS_TO_KEEP = [
    '--host',
    '--user',
    '--password',
    '--password-uri',
    '--password-url',
    '--password-encrypted',
    '--port',
    '--signal',
    '--log-level',
    '--output',
    '--error-file',
    '--no-console'];

let logger = Logger.getLogger({
    logLevel: 'none',
    module
});

/**
 * Miscellaneous utility functions that don't have a better home
 *
 * @module
 */
module.exports = {

    // 15 minutes
    DEFAULT_RETRY: {
        maxRetries: 90,
        retryIntervalMs: 10000
    },

    // 15 minutes - explicit continue on all error codes
    DEFAULT_RETRY_IGNORE_ERRORS: {
        maxRetries: 90,
        retryIntervalMs: 10000,
        continueOnError: true
    },

    // 1 secondish
    SHORT_RETRY: {
        maxRetries: 3,
        retryIntervalMs: 300
    },

    // 1 minute
    MEDIUM_RETRY: {
        maxRetries: 30,
        retryIntervalMs: 2000
    },

    // 10 minutes
    SEVERAL_LONG_RETRY: {
        maxRetries: 10,
        retryIntervalMs: 60000
    },

    // 5 minutes, 5 second interval
    LONG_RETRY: {
        maxRetries: 60,
        retryIntervalMs: 5000
    },

    // 5 minutes, 1 second interval
    QUICK_BUT_LONG_RETRY: {
        maxRetries: 300,
        retryIntervalMs: 1000
    },

    NO_RETRY: {
        maxRetries: 0,
        retryIntervalMs: 0
    },

    getProduct() {
        return this.getProductString()
            .then((response) => {
                if (!response) {
                    return this.runTmshCommand('save sys config')
                        .then(() => {
                            return this.getProductString();
                        })
                        .then((productString) => {
                            return q(productString);
                        })
                        .catch((errString) => {
                            logger.silly('Unable to get product string',
                                errString && errString.message ? errString.message : errString);
                            return q.reject(errString);
                        });
                }
                return q(response);
            })
            .catch((err) => {
                return q.reject(err);
            });
    },

    ipToNumber(ip) {
        const d = ip.split('.');
        let n = d[0] * Math.pow(256, 3); // eslint-disable-line no-restricted-properties
        n += d[1] * Math.pow(256, 2); // eslint-disable-line no-restricted-properties
        n += d[2] * 256;
        n += d[3] * 1;
        return n;
    },

    setLogger(aLogger) {
        logger = aLogger;
    },

    setLoggerOptions(loggerOptions) {
        const loggerOpts = {};
        Object.keys(loggerOptions).forEach((option) => {
            loggerOpts[option] = loggerOptions[option];
        });
        loggerOpts.module = module;
        logger = Logger.getLogger(loggerOpts);
    },

    /**
     * Tries a method until it succeeds or reaches a maximum number of retries.
     *
     * @param {Object}              thisArg                               - The 'this' argument to pass to the
     *                                                                      called function
     * @param {Object}              retryOptions                          - Options for retrying the request.
     * @param {Integer}             retryOptions.maxRetries               - Number of times to retry if first
     *                                                                      try fails. 0 to not retry.
     *                                                                      Default 60.
     * @param {Integer}             retryOptions.retryIntervalMs          - Milliseconds between retries.
     *                                                                      Default 10000.
     * @param {Boolean}             [retryOptions.continueOnError]        - Continue even if we get an
     *                                                                      HTTP BAD_REQUEST code.
     *                                                                      Default false.
     * @param {String | RegExp}     [retryOptions.continueOnErrorMessage] - Continue on error if the 400 error
     *                                                                      message matches this regex
     * @param {String[] | RegExp[]} [retryOptions.failOnErrorMessages]    - Prevent retry logic if message
     *                                                                      matches any value in array.
     * @param {Integer[]}           [retryOptions.failOnErrorCodes]       - Prevent retry logic if status
     *                                                                      code matches any value in array.
     * @param {Object}              [retryOptions.shortRetryOnError]      - Retry for a limited number of
     *                                                                      times on a specified error.
     * @param {Integer}             [retryOptions.shortRetryOnError.codes] - The codes that we should shorten
     *                                                                       the retries on.
     * @param {Object}              [retryOptions.shortRetryOnError.retryOptions] - Options for retrying the
     *                                                                              request. Currently
     *                                                                              maxRetries and
     *                                                                              retryIntervalMs are
     *                                                                              supported.
     * @param {Function}            funcToTry                             - Function to try. Function should
     *                                                                      return a Promise which is later
     *                                                                      resolved or rejected.
     * @param {Object[]}            args                                  - Array of arguments to pass to
     *                                                                      funcToTry
     *
     * @returns {Promise} A promise which is resolved with the return from funcToTry
     *                    if funcToTry is resolved within maxRetries.
     */
    tryUntil(thisArg, retryOptions, funcToTry, args) {
        let deferred;
        let resumeRetries;

        const shouldReject = function (err) {
            if (!err) { return false; }

            if (retryOptions.failOnErrorMessages && err.message) {
                return retryOptions.failOnErrorMessages.some((message) => {
                    let regex = message;
                    if (!(regex instanceof RegExp)) {
                        regex = new RegExp(message);
                    }
                    return regex.test(err.message);
                });
            }

            if (err.code) {
                if (retryOptions.failOnErrorCodes && retryOptions.failOnErrorCodes.indexOf(err.code) > -1) {
                    return true;
                }

                if (err.code === 400) {
                    if (retryOptions.continueOnError) {
                        return false;
                    }
                    if (err.message && retryOptions.continueOnErrorMessage) {
                        let regex = retryOptions.continueOnErrorMessage;
                        if (!(regex instanceof RegExp)) {
                            regex = new RegExp(retryOptions.continueOnErrorMessage);
                        }
                        return !regex.test(err.message);
                    }
                    return true;
                }
            }
            return false;
        };

        const tryIt = function tryIt(maxRetries, interval, theFunc, deferredOrNull) {
            let numRemaining = maxRetries;
            let retryInterval = interval;
            let promise;

            const retryOrReject = function (err) {
                logger.silly(
                    'tryUntil: retryOrReject: numRemaining:', numRemaining,
                    ', code:', err && err.code ? err.code : err,
                    ', message:', err && err.message ? err.message : err
                );
                if (shouldReject(err)) {
                    logger.verbose('Unrecoverable error from HTTP request. Not retrying.');
                    deferred.reject(err);
                } else if (numRemaining > 0) {
                    if (retryOptions.shortRetryOnError && err
                        && retryOptions.shortRetryOnError.codes.indexOf(err.code) > -1 && !resumeRetries) {
                        resumeRetries = numRemaining;
                        numRemaining = retryOptions.shortRetryOnError.retryOptions.maxRetries;
                        retryInterval = retryOptions
                            .shortRetryOnError.retryOptions.retryIntervalMs || interval;
                    } else if (retryOptions.shortRetryOnError && err
                        && retryOptions.shortRetryOnError.codes.indexOf(err.code) < 0 && resumeRetries) {
                        numRemaining = resumeRetries;
                        resumeRetries = undefined;
                        retryInterval = retryOptions.retryIntervalMs;
                    } else {
                        numRemaining -= 1;
                    }
                    setTimeout(tryIt, retryInterval, numRemaining, retryInterval, theFunc, deferred);
                } else {
                    logger.verbose('Max tries reached.');
                    const originalMessage = err && err.message ? err.message : 'unknown';
                    const updatedError = {};
                    Object.assign(updatedError, err);
                    updatedError.message = `tryUntil: max tries reached: ${originalMessage}`;
                    updatedError.name = err && err.name ? err.name : '';
                    deferred.reject(updatedError);
                }
            };

            if (!deferredOrNull) {
                deferred = q.defer();
            }

            try {
                promise = theFunc.apply(thisArg, args)
                    .then((response) => {
                        deferred.resolve(response);
                    })
                    .catch((err) => {
                        logger.silly('tryUntil: got error', err);
                        logger.silly('typeof err', typeof err);
                        let message = '';
                        if (err) {
                            message = err.message ? err.message : err;
                        }
                        logger.verbose('tryUntil error:', message, 'tries left:', maxRetries.toString());
                        retryOrReject(err);
                    });

                // Allow this to work with native promises which do not have a done
                if (promise.done) {
                    promise.done();
                }
            } catch (err) {
                retryOrReject(err);
            }

            return deferred.promise;
        };

        return tryIt(retryOptions.maxRetries, retryOptions.retryIntervalMs, funcToTry);
    },

    /**
     * Calls an array of promises in serial.
     *
     * @param {Object}   thisArg  - The 'this' argument to pass to the called function
     * @param {Object[]} promises - An array of promise definitions. Each
     *                              definition should be:
     *                              {
     *                                  promise: A function that returns a promise
     *                                  arguments: Array of arguments to pass to the function,
     *                                  message: An optional message to display at the start of this promise
     *                              }
     * @param {Integer}  [delay]  - Delay in milliseconds to use between calls.
     */
    callInSerial(thisArg, promises, delay) {
        const interval = delay || 0;

        const deferred = q.defer();
        const results = [];

        const callThem = function (index) {
            if (index === promises.length) {
                deferred.resolve(results);
                return;
            }

            if (promises[index].message) {
                logger.info(promises[index].message);
            }

            promises[index].promise.apply(thisArg, promises[index].arguments)
                .then((response) => {
                    results.push(response);

                    if (index < promises.length - 1) {
                        setTimeout(callThem, interval, index + 1);
                    } else {
                        deferred.resolve(results);
                    }
                })
                .catch((err) => {
                    deferred.reject(err);
                });
        };

        callThem(0);

        return deferred.promise;
    },

    deleteUser(user) {
        return this.runTmshCommand(`delete auth user ${user}`);
    },

    /**
     *
     * Create a buffer from a data string.
     * Buffer.from() is preferred, and should be used in versions of NodeJS that support it.
     * Buffer.from() was introduced in Node 4.5.0 and in 5.10.0
     *
     * @param {String} data     - data to create a buffer from
     * @param {String} encoding - data encoding. Default is 'utf8'
     */
    createBufferFrom(data, encoding) {
        if (typeof data !== 'string') {
            throw new Error('data must be a string');
        }
        let useBufferFrom;
        const nodeVersion = process.version.split('v').pop();
        if (nodeVersion.split('.')[0] === '4' && (this.versionCompare(nodeVersion, '4.5.0') > -1)) {
            useBufferFrom = true;
        } else if (this.versionCompare(nodeVersion, '5.10.0') > -1) {
            useBufferFrom = true;
        } else {
            useBufferFrom = false;
        }
        if (useBufferFrom) {
            return Buffer.from(data, encoding || 'utf8');
        }
        // eslint-disable-next-line
        return new Buffer(data, encoding || 'utf8');
    },

    /**
     * Log a message and exit.
     *
     * Makes sure that message is logged before exiting.
     *
     * @param {String} message - Message to log
     * @param {String} [level] - Level at which to log the message. Default info.
     * @param {Number} [code]  - Exit code. Default 0.
     */
    logAndExit(message, level, code) {
        const logLevel = level || 'info';
        let exitCode = code;

        if (typeof exitCode === 'undefined') {
            exitCode = 0;
        }

        logger.log(logLevel, message);
        // exit on flush event if file transport exists
        if (logger.transports.file) {
            logger.transports.file.on('flush', () => {
                process.exit(exitCode);
            });
        }
        // if no file transport or flush event does not trigger
        // simply exit after hard count
        setTimeout(() => {
            process.exit(exitCode);
        }, 1000);
    },

    /**
     * Log a message to the error log file.
     *
     * @param {String} message - Message to log
     * @param {Object} options - Logger options
     */
    logError(message, options) {
        const loggerOptions = {};
        Object.assign(loggerOptions, options);

        loggerOptions.json = true;
        loggerOptions.verboseLabel = true;

        if (loggerOptions.errorFile) {
            loggerOptions.fileName = loggerOptions.errorFile;
        } else if (loggerOptions.fileName) {
            loggerOptions.fileName = `${path.dirname(loggerOptions.fileName)}/cloudLibsError.log`;
        } else {
            loggerOptions.fileName = '/tmp/cloudLibsError.log';
        }

        const errorLogger = Logger.getLogger(loggerOptions);
        errorLogger.error(message);
    },

    /**
     * Returns the count of running processes, given the provided grep command
     * example:
     *      getProcessCount('grep autoscale.js')
     *
     * @param {String} grepCommand - grep command to execute.
     *
     * @returns {Promise}   A Promise that is resolved with the output of the
     *                      shell command or rejected if an error occurs.
     */
    getProcessCount(grepCommand) {
        if (!grepCommand) {
            const errorMessage = 'grep command is required';
            logger.error(errorMessage);
            return q.reject(new Error(errorMessage));
        }
        const shellCommand = `/bin/ps -eo pid,cmd | ${grepCommand} | wc -l`;

        return this.runShellCommand(shellCommand)
            .then((response) => {
                return q(
                    (typeof response === 'string') ? response.trim() : response
                );
            })
            .catch((err) => {
                logger.warn('Unable to get process count', err && err.message ? err.message : err);
                return q.reject(err);
            });
    },

    /**
     * Returns execution time and pid of process, given the provided grep command
     * example:
     *      getProcessExecutionTimeWithPid('grep autoscale.js')
     *
     * @param {String} grepCommand - grep command to execute.
     *
     * @returns {Promise}   A Promise that is resolved with the output of the
     *                      shell command or rejected if an error occurs.
     */
    getProcessExecutionTimeWithPid(grepCommand) {
        if (!grepCommand) {
            const errorMessage = 'grep command is required';
            logger.error(errorMessage);
            return q.reject(new Error(errorMessage));
        }
        const cmd = `/bin/ps -eo pid,etime,cmd --sort=-time | ${grepCommand} | awk '{ print $1"-"$2 }'`;

        logger.silly(`shellCommand: ${cmd}`);
        return this.runShellCommand(cmd)
            .then((response) => {
                return q(
                    (typeof response === 'string') ? response.trim() : response
                );
            })
            .catch((err) => {
                logger.warn('Unable to get process execution time with pid',
                    err && err.message ? err.message : err);
                return q.reject(err);
            });
    },

    /**
     * Terminates process using PID value
     * example:
     *      terminateProcessById('1212')
     *
     * @param {String} pid - process pid value.
     *
     * @returns {Promise}   A Promise that is resolved with the output of the
     *                      shell command or rejected if an error occurs.
     */
    terminateProcessById(pid) {
        if (!pid) {
            const errorMessage = 'pid is required for process termination';
            logger.error(errorMessage);
            return q.reject(new Error(errorMessage));
        }
        logger.silly(`Autoscale Process ID to kill: ${pid}`);
        const shellCommand = `/bin/kill -9 ${pid}`;
        return this.runShellCommand(shellCommand)
            .then((response) => {
                return q(
                    (typeof response === 'string') ? response.trim() : response
                );
            })
            .catch((err) => {
                logger.warn('Unable to terminate the process',
                    err && err.message ? err.message : err);
                return q.reject(err);
            });
    },

    /**
     * Reboots the device
     *
     * First save arguments from running scripts so that they are started
     * again on startup
     *
     * @param {Object}  bigIp                - The BigIp instance to reboot.
     * @param {Object}  [options]            - Optional parameters.
     * @param {Boolean} [options.signalOnly] - Indicates that we should not actually reboot, just
     *                                         prepare args and signal that reboot is required
     *
     * @returns {Promise} A Promise that is resolved when the reboot command
     *                    has been sent or rejected if an error occurs.
     */
    reboot(bigIp, options) {
        return prepareArgsForReboot(logger)
            .then(() => {
                if (options && options.signalOnly) {
                    logger.info('Skipping reboot due to options. Signaling only.');
                    ipc.send(signals.REBOOT_REQUIRED);
                    return q();
                }
                logger.info('Rebooting.');
                ipc.send(signals.REBOOT);
                return bigIp.reboot();
            });
    },

    /**
     * Spawns a new process in the background and exits current process
     *
     * @param {Object} process     - Node.js process
     * @param {String} logFileName - Name to pass for output log file
     */
    runInBackgroundAndExit(process, logFileName) {
        let args;
        let myChild;

        if (process.argv.length > 100) {
            logger.warn("Too many arguments - maybe we're stuck in a restart loop?");
        } else {
            args = process.argv.slice(1);

            // remove the background option(s)
            for (let i = args.length - 1; i >= 0; i -= 1) {
                if (args[i] === '--background') {
                    args.splice(i, 1);
                }
            }

            // capture output in a log file
            if (args.indexOf('--output') === -1) {
                args.push('--output', logFileName);
            }

            logger.debug('Spawning child process.', args);
            myChild = childProcess.spawn(
                process.argv[0],
                args,
                {
                    stdio: 'ignore',
                    detached: true
                }
            );
            myChild.unref();
        }

        logger.debug('Original process exiting.');
        process.exit();
    },

    /**
     * Filters options arguments provided based on a list of arguments to keep
     *
     * @param {Object} options      - Options object to pull arguments from
     * @param {Object} [argsToKeep] - Arguments to keep. Default ARGS_TO_KEEP.
     */
    getArgsToStripDuringForcedReboot(options, argsToKeep) {
        const argsTK = argsToKeep || ARGS_TO_KEEP;
        const argsToStrip = [];
        options.options.forEach((opt) => {
            // add to argsToStrip, unless it is one of the args we want to keep
            if (argsTK) {
                if (opt.long && argsTK.indexOf(opt.long) === -1) {
                    argsToStrip.push(opt.long);
                    // if short option exist for this arg, also strip
                    if (opt.short) {
                        argsToStrip.push(opt.short);
                    }
                }
            }
        });
        return argsToStrip;
    },

    /**
     * Saves arguments that started a script so that they can be re-used
     * in the event we get stuck and need to reboot.
     *
     * @param {String[]} args          - Array of arguments that can be used to re-run
     *                                   the process (i.e. process.argv)
     * @param {String}   id            - Some unique id for the process. This will be used
     *                                   as the file name in which
     *                                   to store the files.
     * @param {Object}   [argsToStrip] - Array of arguments to strip. Default none.
     */
    saveArgs(args, id, argsToStrip) {
        const deferred = q.defer();
        const fullPath = `${REBOOT_SCRIPTS_DIR}${id}.sh`;
        const updatedArgs = [];

        try {
            fs.stat(REBOOT_SCRIPTS_DIR, (fsStatErr) => {
                if (fsStatErr && fsStatErr.code === 'ENOENT') {
                    try {
                        fs.mkdirSync(REBOOT_SCRIPTS_DIR);
                    } catch (err) {
                        // Check for race condition on creating directory while others are doing the same
                        if (err.code !== 'EEXIST') {
                            logger.error(
                                'Error creating',
                                REBOOT_SCRIPTS_DIR,
                                'Not saving args for a second try.',
                                err
                            );
                            deferred.resolve();
                        }
                    }
                } else if (fsStatErr) {
                    logger.warn('Unable to stat', REBOOT_SCRIPTS_DIR, 'Not saving args for a second try.');
                    // Just resolve - may as well try to run anyway
                    deferred.resolve();
                }

                try {
                    fs.open(fullPath, 'w', (fsOpenErr, fd) => {
                        if (fsOpenErr) {
                            logger.warn('Unable to open', fullPath, 'Not saving args for a second try.');
                            // Just resolve - may as well try to run anyway
                            deferred.resolve();
                            return;
                        }

                        // push the executable and script name
                        updatedArgs.push(args[0], args[1]);
                        for (let i = 2; i < args.length; i++) {
                            if (args[i][0] === '-') {
                                if (!argsToStrip || argsToStrip.indexOf(args[i]) === -1) {
                                    updatedArgs.push(args[i]);

                                    // If the first character of the next argument does not start with '-',
                                    // assume it is a parameter for this argument
                                    if (args.length > i + 1) {
                                        if (args[i + 1][0] !== '-') {
                                            updatedArgs.push(args[i + 1]);
                                        }
                                    }
                                }
                            }
                        }

                        try {
                            fs.writeSync(fd, `#!/bin/bash${EOL}`);
                            fs.writeSync(fd, updatedArgs.join(' ') + EOL);
                            fs.fchmodSync(fd, 0o755);
                        } catch (err) {
                            logger.warn('Unable to save args', err);
                        } finally {
                            fs.closeSync(fd);
                            deferred.resolve();
                        }
                    });
                } catch (err) {
                    logger.warn('Unable to open args file', err);
                    deferred.resolve();
                }
            });
        } catch (err) {
            logger.warn('Unable to stat', REBOOT_SCRIPTS_DIR);
            deferred.resolve();
        }

        return deferred.promise;
    },

    /**
     * Deletes the arguments previously saved with saveArgs
     *
     * This should be called when a script successfully completes.
     *
     * @param {String} id - Some unique id for the process. This will be used as the file name in which
     *                      to store the files.
     */
    deleteArgs(id) {
        const file = `${REBOOT_SCRIPTS_DIR}${id}.sh`;
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    },

    /**
     * Adds value to an array
     *
     * Typically used by the option parser for collecting
     * multiple values for a command line option
     *
     * @param {String} val           - The comma separated value string
     * @param {String[]} collecction - The array into which to put the value
     *
     * @returns {String[]} The updated collection
     */
    collect(val, collection) {
        collection.push(val);
        return collection;
    },

    /**
     * Parses a comma-separated value
     *
     * Typically used by the option parser for collecting
     * multiple values which are comma separated values.
     *
     * Leading and trailing spaces are removed from keys and values
     *
     * @param {String} val             - The comma separated value string
     * @param {String[][]} collecction - The array into which to put a new array conataining the values
     *
     * @returns {String[][]} The updated collection
     */
    csv(val, collection) {
        const values = val.split(',');
        const newEntry = [];
        values.forEach((value) => {
            newEntry.push(value.trim());
        });
        collection.push(newEntry);
        return collection;
    },

    /**
     * Parses a ':' deliminated key-value pair and stores them
     * in a container.
     *
     * Leading and trailing spaces are removed from keys and values
     *
     * Typically used by the option parser for collecting
     * multiple key-value pairs for a command line option
     *
     * @param {String} pair      - String in the format of key:value
     * @param {Object} container - Object into which to put the key:value
     */
    pair(pair, container) {
        const nameVal = pair.split(/:(.+)/);
        container[nameVal[0].trim()] = nameVal[1].trim(); // eslint-disable-line no-param-reassign
    },

    /**
     * Parses a string of keys and values into a single map
     *
     * Keys are separated from values by a ':'
     * Key value pairs are separated from each other by a ','
     * Example:
     *    user:JoeBob,password:iamcool
     *
     * @param {String} mapString - String form of map. See example above.
     * @param {Objcect} container - Container to hold the map
     *
     * @returns {Object} A map of all of key value pairs.
     */
    map(mapString, container) {
        let params;
        let key;
        let value;

        // prepend a ',' so we can use a regex to split
        const mungedString = `,${mapString}`;

        // split on ,<key>:<value>
        params = mungedString.split(/,([^,]+?):/);

        // strip off the first match, which is an empty string
        params = params.splice(1);

        for (let i = 0; i < params.length; i++) {
            key = params[i].trim();
            value = params[i + 1].trim();

            if (value.toLocaleLowerCase() === 'true' || value.toLocaleLowerCase() === 'false') {
                value = Boolean(value.toLocaleLowerCase() === 'true');
            }

            container[key] = value; // eslint-disable-line no-param-reassign
            i += 1;
        }
    },

    /**
     * Parses a string of keys and values. Each call is one element
     * in the array.
     *
     * Keys are separated from values by a ':'
     * Key value pairs are separated from each other by a ','
     * Example:
     *    user:JoeBob,password:iamcool
     *
     * @param {String} mapString - String form of map. See example above.
     * @param {Objcect[]} container - Container into which to push the map object
     *
     * @returns {Object[]} An array containing one map per call with the same container
     */
    mapArray(mapString, container) {
        const mapObject = {};
        let params;
        let i;

        // prepend a ',' so we can use a regex to split
        const mungedString = `,${mapString}`;

        // split on ,<key>:<value>
        params = mungedString.split(/,([^,]+?):/);

        // strip off the first match, which is an empty string
        params = params.splice(1);

        for (i = 0; i < params.length; i++) {
            mapObject[params[i].trim()] = params[i + 1].trim();
            i += 1;
        }

        container.push(mapObject);
    },

    /**
     * Lower cases all the keys in an object, including nested keys.
     *
     * Typically used when working with JSON input.
     *
     * If a parameter that is not of type object is provided, the original parameter will be returned.
     *
     * @param {Object} obj  - Object in which to lowercase keys
     *
     * @returns {Object}    - An object resembling the provided obj, but with lowercased keys.
     */
    lowerCaseKeys(obj) {
        if (typeof obj === 'object') {
            const newObj = {};
            Object.keys(obj).forEach((key) => {
                if (typeof obj[key] === 'object') {
                    const nestedObj = this.lowerCaseKeys(obj[key]);
                    newObj[key.toLocaleLowerCase()] = nestedObj;
                } else {
                    newObj[key.toLocaleLowerCase()] = obj[key];
                }
            });
            return newObj;
        }
        return obj;
    },

    /**
     * Writes data to a file
     *
     * @param {String} data - The data to write
     * @param {String} file - The file to write to
     *
     * @returns A promise which will be resolved when the file is written
     *          or rejected if an error occurs
     */
    writeDataToFile(data, file) {
        const deferred = q.defer();

        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

        fs.writeFile(
            file,
            data,
            { mode: 0o400 },
            (err) => {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            }
        );

        return deferred.promise;
    },

    /**
     * Reads data from a file
     *
     * @param {String} file - The file to read from
     *
     * @returns A promise which will be resolved with the contents of the file
     *          or rejected if an error occurs
     */
    readDataFromFile(file) {
        const deferred = q.defer();

        fs.readFile(file, (err, data) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    },

    /**
     * Writes data to a URL.
     *
     * Only file URLs are supported for now.
     *
     * @param {String} data - The data to write
     * @param {String} url  - URL to which to write. Only file URLs are supported
     */
    writeDataToUrl(data, url) {
        const deferred = q.defer();
        let parsedUrl;

        try {
            parsedUrl = URL.parse(url);
            if (parsedUrl.protocol === 'file:') {
                this.writeDataToFile(data, parsedUrl.pathname)
                    .then(() => {
                        deferred.resolve();
                    })
                    .catch((err) => {
                        deferred.reject(err);
                    });
            } else {
                deferred.reject(new Error('Only file URLs are currently supported.'));
            }
        } catch (err) {
            deferred.reject(err);
        }

        return deferred.promise;
    },

    /**
    * Disambiguates data that is either raw data or in a URI.
    *
    * @param {String}  dataOrUri               - Data URI (file, http, https, AWS arn) to
    *                                            location containing data.
    * @param {Boolean} dataIsUri               - Indicates that password is a URI for the password
    * @param {Object}  [options]               - Optional parameters.
    * @param {Object}  [options.clOptions]     - Command line options if called from a script.
    *                                            Required for Azure Storage URIs
    * @param {Object}  [options.logger]        - Logger to use. Or, pass loggerOptions to
    *                                            get your own logger.
    * @param {Object}  [options.loggerOptions] - Options for the logger.
    *                                            See {@link module:logger.getLogger} for details.
    */
    readData(dataOrUri, dataIsUri, options) {
        const deferred = q.defer();
        if (dataIsUri) {
            const matchOptions = {
                storageUri: dataOrUri
            };
            let provider;

            // If no cloud provider match, proceed since URI may be plain URL or plain data
            try {
                provider = cloudProviderFactory.getCloudProvider(null, options, matchOptions);
            } catch (err) {
                if (err.message !== 'Unavailable cloud provider') {
                    throw err;
                }
            }

            if (provider) {
                const clOptions = (options && options.clOptions) ? options.clOptions : null;
                provider.init(clOptions)
                    .then(() => {
                        return this.tryUntil(
                            provider,
                            this.MEDIUM_RETRY,
                            provider.getDataFromUri,
                            [dataOrUri]
                        );
                    })
                    .then((data) => {
                        deferred.resolve(data);
                    })
                    .catch((err) => {
                        logger.info('Could not find BIG-IQ credentials file in cloud provider storage');
                        deferred.reject(err);
                    });
            } else {
                // Plain old url
                this.getDataFromUrl(dataOrUri)
                    .then((data) => {
                        deferred.resolve(data);
                    })
                    .catch((err) => {
                        deferred.reject(err);
                    });
            }
        } else {
            // Plain old data
            deferred.resolve(dataOrUri);
        }

        return deferred.promise;
    },

    /**
     * Gets data from a URL.
     *
     * Only file, http, https URLs are supported for now.
     *
     * @param {String}   url               - URL from which to get the data. Only
     *                                       file, http, https URLs are supported for now.
     * @param {Object}   [options]         - http/https request options
     *
     * @returns {String} A promise which will be resolved with the data
     *                   or rejected if an error occurs.
     */
    getDataFromUrl(url, options) {
        const parsedUrl = URL.parse(url);
        const deferred = q.defer();
        const requestOptions = Object.assign({}, options);
        let executor;

        try {
            if (parsedUrl.protocol === 'file:') {
                fs.readFile(parsedUrl.pathname, { encoding: 'ascii' }, (err, data) => {
                    if (err) {
                        deferred.reject(err);
                    } else {
                        deferred.resolve(data.trim());
                    }
                });
            } else if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                executor = parsedUrl.protocol === 'http:' ? http : https;
                requestOptions.protocol = parsedUrl.protocol;
                requestOptions.hostname = parsedUrl.hostname;
                requestOptions.port = parsedUrl.port;
                requestOptions.path = parsedUrl.pathname + (parsedUrl.search ? parsedUrl.search : '');

                executor.get(requestOptions, (response) => {
                    const statusCode = response.statusCode;
                    const contentType = response.headers['content-type'];
                    let rawData = '';
                    let data;

                    if (statusCode >= 300) {
                        const message = `${url.toString()} returned with status code ${statusCode}`;
                        deferred.reject(new Error(message));
                        response.resume();
                    }

                    response.setEncoding('utf8');
                    response.on('data', (chunk) => {
                        rawData += chunk;
                    });
                    response.on('end', () => {
                        if (contentType && contentType.indexOf('application/json') !== -1) {
                            try {
                                data = JSON.parse(rawData);
                            } catch (err) {
                                deferred.reject(err);
                            }
                        } else {
                            data = rawData.trim();
                        }
                        deferred.resolve(data);
                    });
                })
                    .on('error', (err) => {
                        deferred.reject(err);
                    });
            } else {
                deferred.reject(new Error('Only file, http, and https URLs are currently supported.'));
            }
        } catch (err) {
            deferred.reject(err);
        }

        return deferred.promise;
    },

    /**
     * Downloads a file from a URL
     *
     * @param {String} url - URL to download from
     *
     * @returns {Promise} A promise which is resolved with the file name the file was downloaded to
     *                    or rejected if an error occurs.
     */
    download(url) {
        const deferred = q.defer();
        const parsedUrl = URL.parse(url);
        let executor;

        if (parsedUrl.protocol === 'http:') {
            executor = http;
        } else if (parsedUrl.protocol === 'https:') {
            executor = https;
        } else {
            deferred.reject(new Error(`Unhandled protocol: ${parsedUrl.protocol}`));
            return deferred.promise;
        }

        const fileName = `/tmp/f5-cloud-libs_'${Date.now()}`;
        const file = fs.createWriteStream(fileName);

        executor.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    deferred.resolve(fileName);
                });
            });
        })
            .on('error', (err) => {
                if (fs.existsSync(fileName)) {
                    fs.unlink(fileName);
                }
                deferred.reject(err);
            });

        return deferred.promise;
    },

    /**
     * Synchronously removes a directory and all files in the directory
     *
     * @param {String} dir - Directory to remove
     */
    removeDirectorySync(dir) {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach((file) => {
                const curPath = `${dir}/${file}`;
                if (fs.statSync(curPath).isDirectory()) {
                    this.removeDirectorySync(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(dir);
        }
    },

    /**
     * Performs a local ready check
     *
     * @returns {Promise} A promise which is resolved upon completion of
     *                    the script or rejected if an error occurs.
     */
    localReady() {
        const deferred = q.defer();

        logger.silly('Performing local ready check');
        childProcess.exec(`/bin/sh ${__dirname}/../scripts/waitForMcp.sh`, (error) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    },

    /**
     * Runs a shell command and returns the output
     *
     * @param {String} commands - Command to run
     *
     * @returns {Promise} A promise which is resolved with the results of the
     *                    command or rejected if an error occurs.
     */
    runShellCommand(command) {
        const deferred = q.defer();
        childProcess.exec(command, (error, stdout, stderr) => {
            if (error) {
                deferred.reject(new Error(`${error}:${stderr}`));
            } else {
                deferred.resolve(stdout);
            }
        });
        return deferred.promise;
    },

    /**
     * Runs a tmsh command and returns the output
     *
     * @param {String} commands - Command to run ('list ltm pool', for example)
     *
     * @returns {Promise} A promise which is resolved with the results of the
     *                    command or rejected if an error occurs.
     */
    runTmshCommand(command) {
        const deferred = q.defer();

        this.localReady()
            .then(() => {
                const tmshCommand = `/usr/bin/tmsh -a ${command}`;
                return this.tryUntil(this, this.MEDIUM_RETRY, this.runShellCommand, [tmshCommand]);
            })
            .then((response) => {
                deferred.resolve(response);
            })
            .catch((err) => {
                logger.silly('tmsh command failed', err && err.message ? err.message : err);
                deferred.reject(err);
            });
        return deferred.promise;
    },

    /**
     * Parse a tmsh response into an object
     *
     * @param {String} response - tmsh response data to parse
     *
     * @returns {Promise} A promise containing the parsed response data, as an object.
     */
    parseTmshResponse(response) {
        const keyVals = response.split(/\s+/);
        const result = {};

        // find the parts inside the {}
        const openingBraceIndex = keyVals.indexOf('{');
        const closingBraceIndex = keyVals.lastIndexOf('}');

        for (let i = openingBraceIndex + 1; i < closingBraceIndex - 1; i += 2) {
            result[keyVals[i]] = keyVals[i + 1];
        }

        return result;
    },

    /**
     * Returns the product type (BigIP/BigIQ) from the bigip_base.conf file
    */
    getProductString() {
        const deferred = q.defer();
        fs.stat('/usr/bin/tmsh', (fsStatErr) => {
            if (fsStatErr && fsStatErr.code === 'ENOENT') {
                deferred.resolve('CONTAINER');
            } else if (fsStatErr) {
                logger.silly('Unable to determine product', fsStatErr.message);
                deferred.reject(fsStatErr);
            } else {
                this.runShellCommand('grep -m 1 product /config/bigip_base.conf | awk \'{print $2}\'')
                    .then((response) => {
                        deferred.resolve(response.trim());
                    })
                    .catch((err) => {
                        logger.silly('Unable to determine product', err && err.message ? err.message : err);
                        deferred.reject(err);
                    });
            }
        });

        return deferred.promise;
    },
    /**
     * Compares two software version numbers (e.g. "1.7.1" or "1.2b").
     *
     * This function is based on https://gist.github.com/TheDistantSea/8021359
     *
     * @param {string} v1 The first version to be compared.
     * @param {string} v2 The second version to be compared.
     * @param {object} [options] Optional flags that affect comparison behavior:
     * <ul>
     *     <li>
     *         <tt>zeroExtend: true</tt> changes the result if one version
     *                         string has less parts than the other. In
     *                         this case the shorter string will be padded with "zero"
     *                         parts instead of being considered smaller.
     *     </li>
     * </ul>
     * @returns {number}
     * <ul>
     *    <li>0 if the versions are equal</li>
     *    <li>a negative integer iff v1 < v2</li>
     *    <li>a positive integer iff v1 > v2</li>
     * </ul>
     *
     * @copyright by Jon Papaioannou (["john", "papaioannou"].join(".") + "@gmail.com"),
     *               Eugene Molotov (["eugene", "m92"].join(".") + "@gmail.com")
     * @license This function is in the public domain. Do what you want with it, no strings attached.
     */
    versionCompare(v1, v2, options) {
        function compareParts(v1parts, v2parts, zeroExtend) {
            if (zeroExtend) {
                while (v1parts.length < v2parts.length) v1parts.push('0');
                while (v2parts.length < v1parts.length) v2parts.push('0');
            }

            for (let i = 0; i < v1parts.length; i++) {
                if (v2parts.length === i) {
                    return 1;
                }

                let v1part = parseInt(v1parts[i], 10);
                let v2part = parseInt(v2parts[i], 10);
                const v1partIsString = (Number.isNaN(v1part));
                const v2partIsString = (Number.isNaN(v2part));
                v1part = v1partIsString ? v1parts[i] : v1part;
                v2part = v2partIsString ? v2parts[i] : v2part;

                if (v1partIsString === v2partIsString) {
                    if (v1partIsString === false) {
                        // integer compare
                        if (v1part > v2part) {
                            return 1;
                        } else if (v1part < v2part) {
                            return -1;
                        }
                    } else {
                        // letters and numbers in string
                        // split letters and numbers
                        const v1subparts = v1part.match(/[a-zA-Z]+|[0-9]+/g);
                        const v2subparts = v2part.match(/[a-zA-Z]+|[0-9]+/g);
                        if ((v1subparts.length === 1) && (v2subparts.length === 1)) {
                            // only letters in string
                            v1part = v1subparts[0];
                            v2part = v2subparts[0];
                            if (v1part > v2part) {
                                return 1;
                            } else if (v1part < v2part) {
                                return -1;
                            }
                        }

                        if (v1part !== v2part) {
                            const result = compareParts(v1subparts, v2subparts);
                            if (result !== 0) {
                                return result;
                            }
                        }
                    }
                } else {
                    return v2partIsString ? 1 : -1;
                }
            }

            if (v1parts.length !== v2parts.length) {
                return -1;
            }

            return 0;
        }

        const v1split = v1.split(/[.-]/);
        const v2split = v2.split(/[.-]/);
        const zeroExtend = options && options.zeroExtend;
        return compareParts(v1split, v2split, zeroExtend);
    },
    /**
     * Writes UCS file to disk
     *
     * @returns {Promise} A promise which is resolved upon completion of
     *                    the script or rejected if an error occurs.
     */
    writeUcsFile(ucsFilePath, ucsData) {
        const deferred = q.defer();
        let ucsFile;
        // If ucsData has a pipe method (is a stream), use it
        if (ucsData.pipe) {
            logger.silly('ucsData is a Stream');
            if (!fs.existsSync(ucsFilePath.substring(0, ucsFilePath.lastIndexOf('/')))) {
                fs.mkdirSync(ucsFilePath.substring(0, ucsFilePath.lastIndexOf('/')), { recursive: true });
            }
            ucsFile = fs.createWriteStream(ucsFilePath);

            ucsData.pipe(ucsFile);

            ucsFile.on('finish', () => {
                logger.silly('finished piping ucsData');
                ucsFile.close(() => {
                    deferred.resolve(true);
                });
            });
            ucsFile.on('error', (err) => {
                logger.silly('Error piping ucsData', err);
                deferred.reject(err);
            });
            ucsData.on('error', (err) => {
                logger.info('Error reading ucs data', err);
                deferred.reject(err);
            });
        } else {
            // Otherwise, assume it's a Buffer
            logger.silly('ucsData is a Buffer');
            logger.silly(`ucsFilePath: ${ucsFilePath}`);
            try {
                fs.mkdirSync(ucsFilePath.substr(0, ucsFilePath.lastIndexOf('/')));
            } catch (err) {
                if (err.code !== 'EEXIST') {
                    deferred.reject(err);
                }
            }
            fs.writeFile(ucsFilePath, ucsData, (err) => {
                logger.silly('finished writing ucsData');
                if (err) {
                    logger.silly('Error writing ucsData', err);
                    deferred.reject(err);
                    return;
                }
                deferred.resolve(true);
            });
        }

        return deferred.promise;
    },

};

/**
 * Copies all the saved arguments (from saveArgs) to the startup file
 * so that when the box reboots, the arguments are executed.
 */
function prepareArgsForReboot() {
    const deferred = q.defer();
    let startupScripts;
    let startupCommands;
    let startupCommandsChanged;

    const STARTUP_DIR = '/config/';
    const STARTUP_FILE = `${STARTUP_DIR}startup`;
    const REBOOT_SIGNAL = ipc.signalBasePath + signals.REBOOT;

    if (!fs.existsSync(STARTUP_DIR)) {
        logger.debug('No /config directory. Skipping.');
        deferred.resolve();
        return deferred.promise;
    }

    try {
        startupCommands = fs.readFileSync(STARTUP_FILE, 'utf8');
    } catch (err) {
        logger.warn('Error reading starup file.');
        deferred.reject(err);
        return deferred.promise;
    }

    try {
        startupScripts = fs.readdirSync(REBOOT_SCRIPTS_DIR);
    } catch (err) {
        logger.warn('Error reading directory with reboot args.');
        deferred.reject(err);
        return deferred.promise;
    }

    // Make sure there's a new line at the end in case we add anything
    startupCommands += EOL;

    // If we just rebooted, make sure the REBOOT signal file is deleted
    // so scripts don't think we need to reboot again
    if (startupCommands.indexOf(REBOOT_SIGNAL) === -1) {
        startupCommandsChanged = true;
        startupCommands += `rm -f ${REBOOT_SIGNAL}${EOL}`;
    }

    startupScripts.forEach((script) => {
        const fullPath = REBOOT_SCRIPTS_DIR + script;
        if (startupCommands.indexOf(fullPath) === -1) {
            startupCommandsChanged = true;
            startupCommands += `if [ -f ${fullPath} ]; then${EOL}`;
            startupCommands += `    ${fullPath} &${EOL}`;
            startupCommands += `fi${EOL}`;
            startupCommands += EOL;
        }
    });

    if (startupCommandsChanged) {
        try {
            fs.writeFileSync(STARTUP_FILE, startupCommands);
        } catch (err) {
            logger.warn('Failed writing startup file', STARTUP_FILE, err);
        }
    }

    deferred.resolve();

    return deferred.promise;
}
