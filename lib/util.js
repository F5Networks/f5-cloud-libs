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

class Util {

    constructor() {}

    /**
     * Retries a method until it succeeds or reaches a maximum number of retries.
     *
     * @param {Number} maxTries - Max times to try the function.
     * @param {Number} interval - Delay between retries in milliseconds.
     * @param {Function} funcToTry - Function to try. Function should return a
     *                               Promise which is later resolved or rejected.
     *
     * @returns {Promise} A promise which is resolved if funcToTry is resolved
     *                    within maxTries.
     */
    static tryUntil(maxTries, interval, funcToTry) {
        return _tryUntil(maxTries, interval, funcToTry);
    }
}

var _tryUntil = function(maxTries, interval, funcToTry, promise, resolve, reject) {
    if (!promise) {
        promise = new Promise(function(_resolve, _reject) {
            resolve = _resolve;
            reject = _reject;
        });
    }

    --maxTries;

    funcToTry()
        .then(function(response) {
            resolve(response);
        })
        .catch(function() {
            if (maxTries > 0) {
                setTimeout(_tryUntil, interval, maxTries, interval, funcToTry, promise, resolve, reject);
            }
            else {
                reject('Giving up after max tries');
            }
        }.bind(this));

    return promise;
};

module.exports = Util;

