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
var BASE_PATH = '/tmp/';

var create = function(signal) {
    var deferred = q.defer();

    fs.stat(BASE_PATH + signal, function(err, stats) {
        if (err && err.code === 'ENOENT') {
            touch(signal)
                .then(function() {
                    deferred.resolve();
                })
                .done();
        }
        else if (err || !stats.isFile()) {
            deferred.reject();
        }
        else {
            deferred.resolve();
        }
    });

    return deferred.promise;
};

var touch = function(signal) {
    var deferred = q.defer();

    fs.open(BASE_PATH + signal, 'w', function(err, fd) {
        if (err) {
            deferred.reject(err);
        }
        else {
            fs.closeSync(fd);
            deferred.resolve();
        }
    });

    return deferred.promise;
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

        create(signal)
            .then(function() {
                var watcher = fs.watch(BASE_PATH + signal, function() {
                    deferred.resolve();
                    watcher.close();
                });
            })
            .catch(function(err) {
                deferred.reject(err);
            })
            .done();

        return deferred.promise;
    },

    /**
     * Sends a signal
     *
     * @param {String} signal - Name of the signal to send.
     */
    send: function(signal) {
        touch(signal);
    }
};