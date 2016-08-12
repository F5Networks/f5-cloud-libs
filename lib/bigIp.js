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

var q = require('q');
var IControl = require('icontrol');
var util = require('./util');

var BigIpCluster = require('./bigIpCluster');
var BigIpOnboard = require('./bigIpOnboard');

/**
 * Creates the BIG-IP client
 *
 * @param {String} host - Host name or IP address.
 * @param {String} user - User with admin rights.
 * @param {String} password - Password for user.
 * @param {Object} [testOpts] - Options used during testing.
 */
function BigIp(host, user, password, testOpts) {
    this.host = host;
    this.user = user;
    this.password = password;

    testOpts = testOpts || {};

    if (testOpts.icontrol) {
        this.icontrol = testOpts.icontrol;
    }
    else {
        this.init(this.host, this.user, this.password);
    }

    this.cluster = new BigIpCluster(this, testOpts);
    this.onboard = new BigIpOnboard(this, testOpts);
}

/**
 * Initialize this instance w/ host user password
 *
 * @param {String} host     - Host to connect to.
 * @param {String} user     - User (with admin rights).
 # @param {String} password - Password for the user.
 */
BigIp.prototype.init = function(host, user, password) {
    this.icontrol = new IControl({
        host: host,
        user: user,
        pass: password,
        basePath: '/mgmt',
        strict: false
    });
};

/**
 * Low-level interface
 */

/**
 * Submits a list (GET) request
 *
 * @param {String} path - The path to get.
 * @param {Object} options - See iControl list options.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.list = function (path, options) {
    var deferred = q.defer();

    try {
        this.icontrol.list(path, options, function(err, response) {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve(response);
            }
        });
    }
    catch (err) {
        deferred.reject(err);
    }

    return deferred.promise;
};

/**
 * Submits a create (POST) request
 *
 * @param {String} path - The path to get.
 * @param {Object} body - The body for the POST request.
 * @param {Object} options - See iControl create options.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.create = function(path, body, options) {
    var deferred = q.defer();

    try {
        this.icontrol.create(path, body, options, function(err, response) {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve(response);
            }
        });
    }
    catch (err) {
        deferred.reject(err);
    }

    return deferred.promise;
};

/**
 * Submits a modify (PATCH) request
 *
 * @param {String} path - The path to get.
 * @param {Object} body - The body for the patch request.
 * @param {Object} options - See iControl modify options.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.modify = function(path, body, options) {
    var deferred = q.defer();

    try {
        this.icontrol.modify(path, body, options, function(err, response) {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve(response);
            }
        });
    }
    catch (err) {
        deferred.reject(err);
    }

    return deferred.promise;
};

/**
 * Submits a delete (DELETE) request
 *
 * @param {String} path - The path to get.
 * @param {Object} options - See iControl delete options.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.delete = function(path, options) {
    var deferred = q.defer();

    try {
        this.icontrol.delete(path, options, function(err, response) {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve(response);
            }
        });
    }
    catch (err) {
        deferred.reject(err);
    }

    return deferred.promise;
};

/**
 * Higher level interface
 */

/**
 * Gets the device info
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.deviceInfo = function() {
    return this.list('/shared/identified-devices/config/device-info');
};

/**
 * Loads sys config
 *
 * @param {String} [file] - Full path on BIG-IP of file to load. Default is to load the default config.
 * @param {Object} [options] - Object map of load options (for example, {merge: true})
 *
 * @returns {Promise} A promise which is resolved when the config has been
 *                    loaded or rejected if an error occurs.
 */
BigIp.prototype.load = function(file, options) {
    return this.ready()
        .then(function() {
            var commandBody = {
                command: "load",
                options: []
            };
            var option;
            var optionBody;
            if (file) {
                commandBody.options.push({file: file});
            }
            else {
                commandBody.name = 'default';
            }
            if (options) {
                for (option in options) {
                    if (options.hasOwnProperty(option)) {
                        optionBody = {};
                        optionBody[option] = options[option];
                        commandBody.options.push(optionBody);
                    }
                }
            }
            return this.create('/tm/sys/config', commandBody);
        }.bind(this));
};

/**
 * Resolves when BIG-IP is ready.
 *
 * BIG-IP is determined to be ready when the nodejs echo-js worker
 * is ready.
 *
 * @param {Number} [maxRetries] - Number of calls to BIG-IP to try. Default is 10.
 * @param {Number} [retryIntervalMs] = Milliseconds to wait between retries. Default is 1000.
 *
 * @returns {Promise} A Promise which is resolved when BIG-IP is ready
 *                    or rejected after trying a fixed number of times.
 */
BigIp.prototype.ready = function(maxRetries, retryIntervalMs) {
    maxRetries = 60;
    retryIntervalMs = retryIntervalMs || 10000;

    var isReady = function() {
        var promises = [];

        var availabilityChecks = [
            '/shared/echo-js/available',
            '/tm/sys/available',
            '/tm/cm/available'
        ];

        var mcpCheck = function() {
            var deferred = q.defer();

            this.list('/tm/sys/mcp-state/')
                .then(function(response) {
                    var entries = response.entries;
                    var allRunning = true;
                    var entry;
                    for (entry in entries) {
                        if (entries.hasOwnProperty(entry)) {
                            if (entries[entry].nestedStats.entries.phase.description !== 'running') {
                                allRunning = false;
                            }
                        }
                    }

                    if (allRunning) {
                        deferred.resolve();
                    }
                    else {
                        deferred.reject();
                    }
                })
                .catch(function(err) {
                    deferred.reject(err);
                })
                .done();

            return deferred.promise;
        }.bind(this);

        var i;

        for (i = 0; i < availabilityChecks.length; ++i) {
            promises.push(this.list(availabilityChecks[i]));
        }

        promises.push(mcpCheck());

        return q.all(promises);
    }.bind(this);

    return util.tryUntil(this, maxRetries, retryIntervalMs, isReady);
};

/**
 * Reboots the BIG-IP
 */
BigIp.prototype.reboot = function() {
    return this.ready()
        .then(function() {
            return this.create('/tm/sys', {command: "reboot"});
        }.bind(this));
};

/**
 * Checks to see if the BIG-IP needs to be rebooted
 *
 * @returns {Promise} A promise which is resolved with 'true' if reboot is
 * required and resolved with 'false' otherwise.
 */
BigIp.prototype.rebootRequired = function() {
    var deferred = q.defer();

    this.ready()
        .then(function() {
            this.list('/tm/sys/db/provision.action')
                .then(function(response) {
                    if (response.value) {
                        deferred.resolve(response.value === 'reboot');
                    }
                    else {
                        deferred.reject(new Error('no value in response'));
                    }
                })
                .catch(function(err) {
                    deferred.reject(err);
                })
                .done();
        }.bind(this));

    return deferred.promise;
};

/**
 * Saves sys config
 *
 * @param {String} [file] - File to save to. Default is bigip.conf
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIp.prototype.save = function(file) {

    return this.ready()
        .then(function() {
            var commandBody = {
                command: "save"
            };

            if (file) {
                commandBody.options = [
                    {
                        file: file
                    }
                ];
            }

            return this.create('/tm/sys/config', commandBody);
        }.bind(this));
};

/**
 * Submits commands in a transaction
 *
 * @param {Object[]} commands - Array of command definitions. Each command should be:
 *                              {
 *                                  method: 'list' | 'create' | 'modify' | 'delete',
 *                                  path: path for command,
 *                                  body: optional body for command
 *                              }
 * @returns {Promise} A promise which is resolved when the transaction is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.transaction = function(commands) {
    var TRANSACTION_PATH = '/tm/transaction/';
    var transactionId;
    var promises = [];
    var i;

    var startTransaction = function() {
        return this.create(TRANSACTION_PATH, {})
            .then(function(response) {
                return response.transId;
            });
    }.bind(this);

    var commitTransaction = function() {
        return this.modify(TRANSACTION_PATH + transactionId, { "state":"VALIDATING" })
            .then(function(response) {
                if (response.state !== 'COMPLETED') {
                    return q.reject('Transaction state not completed (' + response.state + ')');
                }
                return q(response);
            });
    }.bind(this);

    var getPromise = function(method) {
        switch(method.toUpperCase()) {
            case 'LIST':
                return this.list;
            case 'CREATE':
                return this.create;
            case 'MODIFY':
                return this.modify;
            case 'DELETE':
                return this.delete;
        }
    }.bind(this);

    if (commands.length === 0) {
        return;
    }

    return this.ready()
        .then(function() {
            return startTransaction();
        }.bind(this))
        .then(function(transId) {
            transactionId = transId;

            for (i = 0; i < commands.length; ++i) {
                promises.push(
                    {
                        promise: getPromise(commands[i].method),
                        arguments: [
                            commands[i].path,
                            commands[i].body,
                            {
                                headers: {
                                    'X-F5-REST-Coordination-Id': transactionId
                                }
                            }
                        ]
                    }
                );
            }

            return util.callInSerial(this, promises);
        }.bind(this))
        .then(function() {
            return commitTransaction();
        });
};

module.exports = BigIp;