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

var fs = require('fs');
var q = require('q');
var Logger = require('./logger');

var EOL = require('os').EOL;
var REBOOT_SCRIPTS_DIR = '/tmp/rebootScripts/';

/**
 * @module
 */
module.exports = {

    logger: Logger.getLogger({logLevel: 'none'}),

    DEFAULT_RETRY: {
        maxRetries: 90,
        retryIntervalMs: 10000
    },

    NO_RETRY: {
        maxRetries: 0,
        retryIntervalMs: 0
    },

    /**
     * Tries a method until it succeeds or reaches a maximum number of retries.
     *
     * @param {Object}   thisArg                      - The 'this' argument to pass to the called function
     * @param {Object}   retryOptions                 - Options for retrying the request.
     * @param {Integer}  retryOptions.maxRetries      - Number of times to retry if first try fails. 0 to not retry. Default 60.
     * @param {Integer}  retryOptions.retryIntervalMs - Milliseconds between retries. Default 10000.
     * @param {Function} funcToTry                    - Function to try. Function should return a
     *                                                  Promise which is later resolved or rejected.
     * @param {String[]} args                         - Array of arguments to pass to funcToTry
     *
     * @returns {Promise} A promise which is resolved if funcToTry is resolved
     *                    within maxRetries.
     */
    tryUntil: function(thisArg, retryOptions, funcToTry, args) {
        var _tryUntil = function(maxRetries, interval, funcToTry, deferred) {

            if (!deferred) {
                deferred = q.defer();
            }

            funcToTry.apply(thisArg, args)
                .then(function(response) {
                    deferred.resolve(response);
                }.bind(this))
                .catch(function(err) {
                    this.logger.verbose('tryUntil:', err ? err.message : '', 'tries left:', maxRetries);
                    if (err) {
                        this.logger.debug(err);
                    }

                    if (maxRetries > 0) {
                        --maxRetries;
                        setTimeout(_tryUntil, interval, maxRetries, interval, funcToTry, deferred);
                    }
                    else {
                        this.logger.verbose('Max tries reached.');
                        deferred.reject(err);
                    }
                }.bind(this))
                .done();

            return deferred.promise;
        }.bind(this);

        return _tryUntil(retryOptions.maxRetries, retryOptions.retryIntervalMs, funcToTry);
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
    callInSerial: function(thisArg, promises, delay) {
        delay = delay || 0;

        var results = [];

        var _callInSerial = function(thisArg, promises, delay, index) {

            if (index === promises.length) {
                deferred.resolve(results);
                return;
            }

            if (promises[index].message) {
                this.logger.info(promises[index].message);
            }

            promises[index].promise.apply(thisArg, promises[index].arguments)
                .then(function(response) {
                    results.push(response);

                    if (index < promises.length - 1) {
                        setTimeout(_callInSerial, delay, thisArg, promises, delay, ++index);
                    }
                    else {
                        deferred.resolve(results);
                    }
                })
                .catch(function(err) {
                    deferred.reject(err);
                });
        }.bind(this);

        var deferred = q.defer();

        _callInSerial(thisArg, promises, delay, 0);

        return deferred.promise;
    },

    /**
     * Log a message and exit.
     *
     * Makes sure that message is logged before exitting.
     *
     * @param {String} message - Message to log
     * @param {String} [level] - Level at which to log the message. Default info.
     */
    logAndExit: function(message, level) {
        level = level || 'info';
        this.logger.log(level, message, function() {
            process.exit();
        });
    },

    /**
     * Spawns a new process in the background and exits current process
     *
     * @param {Object} process     - Node.js process
     * @param {String} logFileName - Name to pass for output log file
     */
    runInBackgroundAndExit: function(process, logFileName) {
        var childProcess = require('child_process');
        var args;
        var myChild;
        var i;

        if (process.argv.length > 100) {
            this.logger.warn("Too many arguments - maybe we're stuck in a restart loop?");
        }
        else {
            args = process.argv.slice(1);

            // remove the background option(s)
            for (i = args.length - 1; i >= 0; --i) {
                if (args[i] === '--background') {
                    args.splice(i, 1);
                }
            }

            // capture output in a log file
            if (args.indexOf('--output') === -1) {
                args.push('--output', logFileName);
            }

            this.logger.debug("Spawning child process.", args);
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

        this.logger.debug("Original process exitting.");
        process.exit();
    },

    /**
     * Saves arguments that started a script so that they can be re-used
     * in the event we get stuck and need to reboot.
     *
     * @param {String[]} args          - Array of arguments that can be used to re-run the process (i.e. process.argv)
     * @param {String}   id            - Some unique id for the process. This will be used as the file name in which
     *                                   to store the files.
     * @param {Object}   [argsToStrip] - Array of arguments to strip. Default none.
     */
    saveArgs: function(args, id, argsToStrip) {
        var deferred = q.defer();
        var fullPath = REBOOT_SCRIPTS_DIR + id + '.sh';
        var updatedArgs = [];
        var i;

        argsToStrip = argsToStrip || [];

        fs.stat(REBOOT_SCRIPTS_DIR, function(err) {
            if (err && err.code === 'ENOENT') {
                fs.mkdirSync(REBOOT_SCRIPTS_DIR);
            }
            else if (err) {
                this.logger.warn("Unable to stat", REBOOT_SCRIPTS_DIR, "Not saving args for a second try.");
                // Just resolve - may as well try any to run anyway
                deferred.resolve();
            }

            fs.open(fullPath, 'w', function(err, fd) {
                if (err) {
                    this.logger.warn("Unable to open", fullPath, "Not saving args for a second try.");
                    // Just resolve - may as well try any to run anyway
                    deferred.resolve();
                    return;
                }

                // push the executable and script name
                updatedArgs.push(args[0], args[1]);
                for (i = 2; i < args.length; ++i) {
                    if (args[i][0] === '-') {
                        if (argsToStrip.indexOf(args[i]) === -1) {
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
                    fs.writeSync(fd, '#!/bin/bash' + EOL);
                    fs.writeSync(fd, updatedArgs.join(' ') + EOL);
                    fs.fchmodSync(fd, parseInt('0755',8));
                    fs.closeSync(fd);
                    deferred.resolve();
                }
                catch (err) {
                    this.logger.warn("Unable to save args", err);
                    fs.closeSync(fd);
                    // Just resolve - may as well try any to run anyway
                    deferred.resolve();
                }
            }.bind(this));
        }.bind(this));

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
    deleteArgs: function(id) {
        var file = REBOOT_SCRIPTS_DIR + id + '.sh';
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    },

    /**
     * Copies all the saved arguments (from saveArgs) to the startup file
     * so that when the box reboots, the arguments are executed.
     */
    prepareArgsForReboot: function() {
        var deferred = q.defer();
        var startupScripts;
        var startupCommands;
        var startupCommandsChanged;
        var status;

        var STARTUP_DIR = '/config/';
        var STARTUP_FILE = STARTUP_DIR + 'startup';

        try {
            fs.statSync(STARTUP_DIR);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                this.logger.info("No config directory. Assuming non-local run. Skipping.");
                deferred.resolve(false);
                return;
            }
        }

        try {
            startupCommands = fs.readFileSync(STARTUP_FILE, 'utf8');
        }
        catch (err) {
            this.logger.warn("Error reading starup file.");
            deferred.reject(err);
            return;
        }

        try {
            startupScripts = fs.readdirSync(REBOOT_SCRIPTS_DIR);
        }
        catch (err) {
            this.logger.warn("Error reading directory with reboot args.");
            deferred.reject(err);
            return;
        }

        startupScripts.forEach(function(script) {
            var fullPath = REBOOT_SCRIPTS_DIR + script;
            if (startupCommands.indexOf(fullPath) === -1) {
                startupCommandsChanged = true;
                startupCommands += "if [ -f " + fullPath + " ]; then" + EOL;
                startupCommands += "    " + fullPath + ' &' + EOL;
                startupCommands += "fi" + EOL;
                startupCommands += EOL;
            }
        });

        if (startupCommandsChanged) {
            status = true;
            try {
                fs.writeFileSync(STARTUP_FILE, startupCommands);
            }
            catch (err) {
                this.logger.warn("Failed writing startup file", STARTUP_FILE, err);
                status = false;
            }
        }

        deferred.resolve(status);

        return deferred.promise;
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
    collect: function(val, collection) {
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
    csv: function(val, collection) {
        var values = val.split(',');
        var newEntry = [];
        values.forEach(function(value) {
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
    map: function(pair, container) {
        var nameVal = pair.split(/:(.+)/);
        container[nameVal[0].trim()] = nameVal[1].trim();
    },

    /**
     * Downloads a file from a URL
     *
     * @param {String} url - URL to download from
     *
     * @returns {Promise} A promise which is resolved with the file name the file was downloaded to
     *                    or rejected if an error occurs.
     */
    download: function(url) {
        var http = require('http');
        var https = require('https');
        var fs = require('fs');
        var URL = require('url');
        var deferred = q.defer();
        var parsedUrl;
        var executor;
        var file;
        var fileName;
        var request;

        parsedUrl = URL.parse(url);
        if (parsedUrl.protocol === 'http:') {
            executor = http;
        }
        else if (parsedUrl.protocol === 'https:') {
            executor = https;
        }
        else {
            deferred.reject('Unhandled protocol: ' + parsedUrl.protocol);
            return;
        }

        fileName = '/tmp/f5-cloud-libs_' + Date.now();
        file = fs.createWriteStream(fileName);
        request = executor.get(url, function(response) {
            response.pipe(file);
            file.on('finish', function() {
                file.close(function() {
                    deferred.resolve(fileName);
                });
            });
        })
        .on('error', function(err) {
            fs.unlink(file);
            deferred.reject(err);
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
     *         <tt>zeroExtend: true</tt> changes the result if one version string has less parts than the other. In
     *         this case the shorter string will be padded with "zero" parts instead of being considered smaller.
     *     </li>
     * </ul>
     * @returns {number}
     * <ul>
     *    <li>0 if the versions are equal</li>
     *    <li>a negative integer iff v1 < v2</li>
     *    <li>a positive integer iff v1 > v2</li>
     * </ul>
     *
     * @copyright by Jon Papaioannou (["john", "papaioannou"].join(".") + "@gmail.com"), Eugene Molotov (["eugene", "m92"].join(".") + "@gmail.com")
     * @license This function is in the public domain. Do what you want with it, no strings attached.
     */
    versionCompare: function(v1, v2, options) {
        var v1parts = v1.split(/[.-]/);
        var v2parts = v2.split(/[.-]/);

        function compareParts(v1parts, v2parts, options) {
            var zeroExtend = options && options.zeroExtend;

            if (zeroExtend) {
                while (v1parts.length < v2parts.length) v1parts.push("0");
                while (v2parts.length < v1parts.length) v2parts.push("0");
            }

            for (var i = 0; i < v1parts.length; ++i) {
                if (v2parts.length == i) {
                    return 1;
                }

                var v1part = parseInt(v1parts[i]);
                var v2part = parseInt(v2parts[i]);
                // (NaN == NaN) -> false
                var v1part_is_string = (v1part !== v1part);
                var v2part_is_string = (v2part !== v2part);
                v1part = v1part_is_string ? v1parts[i] : v1part;
                v2part = v2part_is_string ? v2parts[i] : v2part;

                if (v1part_is_string == v2part_is_string) {
                    if (v1part_is_string === false) {
                        // integer compare
                        if (v1part == v2part) {
                            continue;
                        }
                        else if (v1part > v2part) {
                            return 1;
                        }
                        else {
                            return -1;
                        }
                    }
                    else {
                        // letters and numbers in string
                        // split letters and numbers
                        var v1subparts = v1part.match(/[a-zA-Z]+|[0-9]+/g);
                        var v2subparts = v2part.match(/[a-zA-Z]+|[0-9]+/g);
                        if ( (v1subparts.length == 1) && (v2subparts.length == 1) ) {
                            // only letters in string
                            v1part = v1subparts[0];
                            v2part = v2subparts[0];
                            if (v1part == v2part) {
                                continue;
                            }
                            else if (v1part > v2part) {
                                return 1;
                            }
                            else {
                                return -1;
                            }
                        }
                        var result = compareParts(v1subparts, v2subparts);
                        if (result === 0) {
                            continue;
                        }
                        else {
                            return result;
                        }
                    }
                }
                else {
                    return v2part_is_string ? 1 : -1;
                }
            }

            if (v1parts.length != v2parts.length) {
                return -1;
            }

            return 0;
        }

        return compareParts(v1parts, v2parts, options);
    }
};

