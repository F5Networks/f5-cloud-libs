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

var q = require("q");

/**
 * @module
 */
module.exports = {

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
        var _tryUntil = function(maxRetries, interval, funcToTry, deferred, resolve, reject) {

            if (!deferred) {
                deferred = q.defer();
            }

            funcToTry.apply(thisArg, args)
                .then(function(response) {
                    deferred.resolve(response);
                })
                .catch(function() {
                    if (maxRetries > 0) {
                        --maxRetries;
                        setTimeout(_tryUntil, interval, maxRetries, interval, funcToTry, deferred, resolve, reject);
                    }
                    else {
                        deferred.reject('Giving up after max tries');
                    }
                })
                .done();

            return deferred.promise;
        };

        return _tryUntil(retryOptions.maxRetries, retryOptions.retryIntervalMs, funcToTry);
    },

    /**
     * Calls an array of promises in serial.
     *
     * @param {Object} thisArg - The 'this' argument to pass to the called function
     * @param {Object[]} promises - An array of promise definitions. Each
     *                              definition should be:
     *                              {
     *                                  promise: A function that returns a promise
     *                                  arguments: Array of arguments to pass to the function,
     *                                  message: An optional message to display at the start of this promise
     *                              }
     * @param {String} [successMessage] - Message to resolve with upon success
     */
    callInSerial: function(thisArg, promises, successMessage) {
        var _callInSerial = function(index) {

            if (promises[index].message) {
                console.log(promises[index].message);
            }

            promises[index].promise.apply(thisArg, promises[index].arguments)
                .then(function() {
                    if (index < promises.length - 1) {
                        _callInSerial(++index);
                    }
                    else {
                        deferred.resolve(successMessage);
                    }
                })
                .catch(function(err) {
                    deferred.reject(err);
                });
        };

        var deferred = q.defer();

        _callInSerial(0);

        return deferred.promise;
    },

    /** Spawns a new process in the background and exits current process
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
            process.stdout.write("Too many arguments - maybe we're stuck in a restart loop?");
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
            args.push('--output', logFileName);
            myChild = childProcess.spawn(
                process.argv[0],
                args,
                {
                    detached: true
                }
            );
            myChild.unref();
        }

        process.exit();
    },

    /**
     * Adds value to an array
     *
     * Typically used by the option parser for collecting
     * multiple values for a command line option
     */
    collect: function(val, collection) {
        collection.push(val);
        return collection;
    },

    /**
     * Parses a ':' deliminated key-value pair and stores them
     * in a container.
     *   - Key is the part before the first ':',
     *   - Value is everything after.
     *   - Leading and trailing spaces are removed from keys and values
     *
     * Typically used by the option parser for collecting
     * multiple key-value pairs for a command line option
     */
    map: function(pair, container) {
        var nameVal = pair.split(/:(.+)/);
        container[nameVal[0].trim()] = nameVal[1].trim();
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

