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
const childProcess = require('child_process');
const http = require('http');
const https = require('https');
const q = require('q');
const Logger = require('./logger');
const ipc = require('./ipc');
const signals = require('./signals');

const REBOOT_SCRIPTS_DIR = '/tmp/rebootScripts/';

let logger = Logger.getLogger({
    logLevel: 'none',
    module
});

/**
 * @module
 */
module.exports = {

    DEFAULT_RETRY: {
        maxRetries: 90,
        retryIntervalMs: 10000
    },

    SHORT_RETRY: {
        maxRetries: 3,
        retryIntervalMs: 300
    },

    MEDIUM_RETRY: {
        maxRetries: 30,
        retryIntervalMs: 2000
    },

    NO_RETRY: {
        maxRetries: 0,
        retryIntervalMs: 0
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
     * @param {Object}   thisArg                      - The 'this' argument to pass to the called function
     * @param {Object}   retryOptions                 - Options for retrying the request.
     * @param {Integer}  retryOptions.maxRetries      - Number of times to retry if first try fails.
     *                                                  0 to not retry. Default 60.
     * @param {Integer}  retryOptions.retryIntervalMs - Milliseconds between retries. Default 10000.
     * @param {Function} funcToTry                    - Function to try. Function should return a
     *                                                  Promise which is later resolved or rejected.
     * @param {Object[]} args                         - Array of arguments to pass to funcToTry
     *
     * @returns {Promise} A promise which is resolved with the return from funcToTry
     *                    if funcToTry is resolved within maxRetries.
     */
    tryUntil(thisArg, retryOptions, funcToTry, args) {
        let deferred;

        const tryIt = function tryIt(maxRetries, interval, theFunc, deferredOrNull) {
            let numRemaining = maxRetries;
            let promise;

            const retryOrReject = function (err) {
                if (numRemaining > 0) {
                    numRemaining -= 1;
                    setTimeout(tryIt, interval, numRemaining, interval, theFunc, deferred);
                } else {
                    logger.verbose('Max tries reached.');
                    deferred.reject(err);
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
                        let message = '';
                        if (err) {
                            message = err.message ? err.message : err;
                        }
                        logger.verbose('tryUntil error:', message, 'tries left:', maxRetries);
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

        setImmediate(() => {
            logger.log(logLevel, message, () => {
                process.exit(exitCode);
            });
        });
    },

    /**
     * Reboots BIG-IP
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
                    // Just resolve - may as well try any to run anyway
                    deferred.resolve();
                }

                try {
                    fs.open(fullPath, 'w', (fsOpenErr, fd) => {
                        if (fsOpenErr) {
                            logger.warn('Unable to open', fullPath, 'Not saving args for a second try.');
                            // Just resolve - may as well try any to run anyway
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
     * Gets data from a URL.
     *
     * Only file, http, https URLs are supported for now.
     *
     * @param {String}   url               - URL from which to get the data. Only
     *                                       file, http, https URLs are supported for now.
     * @param {Object}   [options]         - Optional parameters
     * @param {Object}   [options.headers] - Map of headers to add to the request. Format:
     *
     *                   {
     *                       <header1_name>: <header1_value>,
     *                       <header2_name>: <header2_value>
     *                   }
     *
     * @returns {String} A promise which will be resolved with the data
     *                   or rejected if an error occurs.
     */
    getDataFromUrl(url, options) {
        const parsedUrl = URL.parse(url);
        const deferred = q.defer();
        const requestOptions = {};
        let executor;

        const headers = options ? options.headers : undefined;

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
                requestOptions.headers = headers;

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
        const tmshCommand = `/usr/bin/tmsh ${command}`;
        return this.runShellCommand(tmshCommand);
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
    }
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
