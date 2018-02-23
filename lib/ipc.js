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
var Logger = require('./logger');

var logger = Logger.getLogger({logLevel: 'none', module: module});

/**
 * @module
 * @description
 * Provides basic interprocess signalling. A script running in a node.js
 * process may wait on a signal sent by another script running in the same
 * or another process.
 */
module.exports = {
    signalBasePath: '/tmp/f5-cloud-libs-signals/',

    setLoggerOptions: function(loggerOptions) {
        loggerOptions.module = module;
        logger = Logger.getLogger(loggerOptions);
    },

    /**
     * Resolves once when a signal is sent
     *
     * @return {Promise} A promise which is resolved when the signal is sent
     */
    once: function(signal) {
        const fileName = this.signalBasePath + signal;
        const retryInterval = 1000;

        var deferred = q.defer();

        var checkExists = function() {
            if (fs.existsSync(fileName)) {
                deferred.resolve();
                clearInterval(timerId);
            }
        };

        try {
            if (!fs.existsSync(this.signalBasePath)) {
                fs.mkdirSync(this.signalBasePath);
            }

            var timerId = setInterval(checkExists, retryInterval);
        }
        catch(err) {
            logger.warn('once:', err);
            deferred.reject(err);
        }

        return deferred.promise;
    },

    /**
     * Sends a signal
     *
     * @param {String} signal - Name of the signal to send.
     */
    send: function(signal) {
        const fileName = this.signalBasePath + signal;

        try {
            if (!fs.existsSync(this.signalBasePath)) {
                fs.mkdirSync(this.signalBasePath);
            }

            fs.closeSync(fs.openSync(fileName, 'w'));
        }
        catch(err) {
            logger.warn('send:', err);
            throw err;
        }
    },

    /**
     * Clears all previously sent signals
     */
    clearSignals: function() {
        var files;

        try {
            files = fs.readdirSync(this.signalBasePath);
            files.forEach(function(file) {
                fs.unlinkSync(this.signalBasePath + file);
            }.bind(this));
        }
        catch(err) {
            logger.warn('clearSignals:', err);
            throw err;
        }
    }
};
