/**
 * Copyright 2016-2017 F5 Networks, Inc.
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
var BASE_PATH = '/tmp/';

/**
 * Creates the signal file.
 *
 * @param {String} signale - Name of signal
 *
 * @returns {Boolean} Whether or not the file was created.
 */
var create = function(signal) {
    var filename = BASE_PATH + signal;

    if (fs.existsSync(filename)) {
        if (!fs.statSync(filename).isFile) {
            throw new Error(signal, 'exists but is not a regular file');
        }
    }
    else {
        touch(signal);
    }

    return true;
};

var touch = function(signal) {
    fs.closeSync(fs.openSync(BASE_PATH + signal, 'w'));
};

/**
 * @module
 * @description
 * Provides basic interprocess signalling. A script running in a node.js
 * process may wait on a signal sent by another script in the same process.
 */
module.exports = {
    /**
     * Resolves once when a signal is sent
     *
     * @return {Promise} A promise which is resolved when the signal is sent
     */
    once: function(signal) {
        var deferred = q.defer();

        if (create(signal)) {
            var watcher = fs.watch(BASE_PATH + signal, function() {
                deferred.resolve();
                watcher.close();
            });
        }
        else {
            deferred.reject(new Error('Failed to create signal file', signal));
        }

        return deferred.promise;
    },

    /**
     * Sends a signal
     *
     * @param {String} signal - Name of the signal to send.
     */
    send: function(signal) {
        // Use setImmediate here in case signal is sent in same tick as creation
        setImmediate(touch, signal);
    }
};
