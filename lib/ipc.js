/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
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
 */
module.exports = {
    /**
     * Signals once when a signal is sent
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