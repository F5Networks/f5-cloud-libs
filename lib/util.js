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

module.exports = {

    /**
     * Tries a method until it succeeds or reaches a maximum number of retries.
     *
     * @param {Object}   thisArg     - The 'this' argument to pass to the called function
     * @param {Number}   maxRetries  - Max times to retry the function.
     * @param {Number}   interval    - Delay between retries in milliseconds.
     * @param {Function} funcToTry   - Function to try. Function should return a
     *                                 Promise which is later resolved or rejected.
     * @param {String[]} args        - Array of arguments to pass to funcToTry
     *
     * @returns {Promise} A promise which is resolved if funcToTry is resolved
     *                    within maxRetries.
     */
    tryUntil: function(thisArg, maxRetries, interval, funcToTry, args) {
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

        return _tryUntil(maxRetries, interval, funcToTry);
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

        if (process.argv.length > 100) {
            process.stdout.write("Too many arguments - maybe we're stuck in a restart loop?");
        }
        else {
            args = process.argv.slice(1);
            args.push('--foreground');
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
    }
};

