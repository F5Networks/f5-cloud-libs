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

var q = require('q');
var IControl = require('./iControl');
var util = require('./util');
var Logger = require('./logger');
var BigIpCluster = require('./bigIpCluster');
var BigIpOnboard = require('./bigIpOnboard');
var ActiveError = require('./activeError');

/**
 * Creates the BIG-IP client
 * @class
 * @classdesc
 * Provides core functionality (CRUD operations, ready, etc) and maintains
 * references to other modules in f5-cloud-libs.
 *
 * After createing a BigIp with this constructor, you must call the
 * async init() method.
 *
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
*/
function BigIp(options) {

    options = options || {};

    if (options.logger) {
        this.logger = options.logger;
        util.setLogger(options.logger);
    }
    else {
        options.loggerOptions = options.loggerOptions || {logLevel: 'none'};
        options.loggerOptions.module = module;
        this.logger = Logger.getLogger(options.loggerOptions);
        util.setLoggerOptions(options.loggerOptions);
    }

    // We're not ready until we have all the info we need (password from URL, for example)
    // Must call init() to set this
    this.isInitialized = false;

    this.cluster = new BigIpCluster(this, {logger: this.logger});
    this.onboard = new BigIpOnboard(this, {logger: this.logger});
}

/**
 * Initialize this instance w/ host user password
 *
 * @param {String}  host                    - Host to connect to.
 * @param {String}  user                    - User (with admin rights).
 * @param {String}  password                - Password for user or URL (file, http, https) to location containing password.
 * @param {Object}  [options]               - Optional parameters.
 * @param {Number}  [options.port]          - Port to connect to. Default 443.
 * @param {Boolean} [options.passwordIsUrl] - Indicates that password is a URL for the password
 *
 * @returns {Promise} A promise which is resolved when initialization is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.init = function(host, user, password, options) {
    var passwordPromise;

    this.initOptions = options || {};
    this.initPassword = password;
    this.host = host.trim();
    this.user = user.trim();
    this.port = this.initOptions.port || 443;

    passwordPromise = this.initOptions.passwordIsUrl ? util.getDataFromUrl(password) : q(password);
    return passwordPromise
        .then(function(password) {
            this.password = password;
            this.icontrol = new IControl({
                host: this.host,
                port: this.port,
                user: this.user,
                password: this.password,
                basePath: '/mgmt',
                strict: false
            });
            this.isInitialized = true;
        }.bind(this));
};

/**
 * Low-level interface
 */

/**
 * Submits a list (GET) request
 *
 * @param {String}  path                           - The path to get.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.list = function (path, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("list", path);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.list(path, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a create (POST) request
 *
 * @param {String}  path                           - The path to post.
 * @param {Object}  body                           - The body for the POST request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.create = function(path, body, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("create", path, body);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.create(path, body, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a modify (PATCH) request
 *
 * @param {String}  path                           - The path to patch.
 * @param {Object}  body                           - The body for the patch request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.modify = function(path, body, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("modify", path, body);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.modify(path, body, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a replace (PUT) request
 *
 * @param {String}  path                           - The path to put.
 * @param {Object}  body                           - The body for the patch request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.replace = function(path, body, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("replace", path, body);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.replace(path, body, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a delete (DELETE) request
 *
 * @param {String}  path                           - The path to delete.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.delete = function(path, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("delete", path);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.delete(path, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Higher level interface
 */

/**
 * Determines if the BIG-IP status is either active or standby
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the status is either active or standby.
 */
BigIp.prototype.active = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var deferred = q.defer();

        this.ready()
            .then(function() {
                return this.list('/tm/cm/failover-status', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var state = response.entries["https://localhost/mgmt/tm/cm/failover-status/0"].nestedStats.entries.status.description;
                this.logger.debug("Current state:", state);
                if (state === 'ACTIVE' || state === 'STANDBY') {
                    deferred.resolve();
                }
                else {
                    deferred.reject(new ActiveError("BIG-IP not active."));
                }
            }.bind(this))
            .catch(function(err) {
                deferred.reject(new ActiveError(err ? err.message : ''));
            })
            .done();

        return deferred.promise;
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Gets the device info
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.deviceInfo = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.list('/shared/identified-devices/config/device-info', undefined, util.NO_RETRY);
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Loads sys config
 *
 * @param {String}  [file]                         - Full path on BIG-IP of file to load. Default is to load the default config.
 * @param {Object}  [options]                      - Object map of load options (for example, {merge: true})
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the config has been
 *                    loaded or rejected if an error occurs.
 */
BigIp.prototype.loadConfig = function(file, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
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
                return this.create('/tm/sys/config', commandBody, undefined, util.NO_RETRY);
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};


/**
 * Loads sys UCS
 *
 * @param {String}  file                           - Full path on BIG-IP of file to load.
 * @param {Object}  [options]                      - Options for the load ucs task (for example, {noLicense: true, resetTrust: true})
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the config has been
 *                    loaded or rejected if an error occurs.
 */
BigIp.prototype.loadUcs = function(file, options, retryOptions) {
    var taskId;

    const TASK_PATH = '/tm/task/sys/ucs';

    options = options || {};
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var checkTask = function(taskId) {
        var func = function() {
            var deferred = q.defer();
            this.list(TASK_PATH + '/' + taskId + '/result', undefined, util.NO_RETRY)
                .then(function(response) {
                    if (response._taskState === 'COMPLETED') {
                        deferred.resolve(true);
                    }
                    else if (response._taskState === 'FAILED') {
                        deferred.resolve(false);
                    }
                    else {
                        deferred.reject();
                    }
                })
                .catch(function() {
                    // if this throws, assume it is because restjavad has been restarted
                    // and we are done for now - just need to wait for bigIp.ready
                    deferred.resolve(true);
                });

            return deferred.promise;
        };

        return util.tryUntil(this, retryOptions, func);
    }.bind(this);

    return this.ready()
        .then(function() {
            var commandBody = {
                command: "load",
                name: file
            };
            var commandOptions = [];
            var commandOption;
            var option;

            for (option in options) {
                commandOption = {};
                commandOption[option] = options[option];
                commandOptions.push(commandOption);
            }

            if (commandOptions.length > 0) {
                commandBody.options = commandOptions;
            }

            return this.create(TASK_PATH, commandBody, undefined, util.NO_RETRY);
        }.bind(this))
        .then(function(response) {
            taskId = response._taskId;
            this.logger.silly('loadUcs taskId:', taskId);
            return this.replace(
                TASK_PATH + '/' + taskId,
                {
                    _taskState: "VALIDATING"
                },
                undefined,
                util.NO_RETRY
            );
        }.bind(this))
        .then(function() {
            return checkTask(taskId);
        }.bind(this))
        .then(function(status) {
            var deferred;
            if (status === true) {
                deferred = q.defer();
                // Our password may have changed due to the UCS load. If we
                // were given a password-url, we can get the correct password
                if (this.initOptions.passwordIsUrl) {
                    util.getDataFromUrl(this.initPassword)
                        .then(function(password) {
                            this.password = password;
                            this.icontrol = new IControl({
                                host: this.host,
                                port: this.port,
                                user: this.user,
                                password: this.password,
                                basePath: '/mgmt',
                                strict: false
                            });
                            this.isInitialized = true;
                            return this.ready();
                        }.bind(this))
                        .then(function() {
                            deferred.resolve();
                        })
                        .catch(function(err) {
                            return deferred.reject(err);
                        });
                }
                else {
                    // Hope for the best
                    deferred.resolve();
                }
                return deferred.promise;
            }
            else {
                return q.reject(new Error('load UCS task failed'));
            }
        }.bind(this));
};

/**
 * Pings a given address once
 *
 * @param {String}  address                        - IP address or hostname to ping.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved if the ping succeeds
 *                    or rejected if an error occurs.
 */
BigIp.prototype.ping = function(address, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    if (!address) {
        return q.reject(new Error('Address is required for ping.'));
    }

    var func = function() {
        return this.ready()
            .then(function() {
                var pingCommand = {
                    command: 'run',
                    utilCmdArgs: address + ' -c 1'
                };
                return this.create('/tm/util/ping', pingCommand, undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                if (!response) {
                    this.logger.debug('No response from ping');
                    return q.reject();
                }

                var receivedRegex = new RegExp(/transmitted, (\d+) received/);
                var receivedCheck = receivedRegex.exec(response.commandResult);
                var packetsReceived;

                if (receivedCheck && receivedCheck.length > 0) {
                    packetsReceived = receivedCheck[1];
                    this.logger.verbose("Ping received", packetsReceived, "packet(s).");
                    if (packetsReceived > 0) {
                        return true;
                    }
                    else {
                        return q.reject();
                    }
                }
                else {
                    return q.reject();
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Resolves when BIG-IP is ready.
 *
 * BIG-IP is determined to be ready when the nodejs echo-js worker
 * is ready.
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A Promise which is resolved when BIG-IP is ready
 *                    or rejected after trying a fixed number of times.
 */
BigIp.prototype.ready = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var promises = [];

        var availabilityChecks = [
            '/shared/echo-js/available',
            '/shared/identified-devices/config/device-info/available',
            '/tm/sys/available',
            '/tm/cm/available'
        ];

        var mcpCheck = function() {
            var deferred = q.defer();

            this.list('/tm/sys/mcp-state/', undefined, util.NO_RETRY)
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
                        deferred.reject(new Error('MCP not ready yet.'));
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
            promises.push(
                {
                    promise: this.list,
                    arguments: [availabilityChecks[i], undefined, util.NO_RETRY]
                }
            );
        }

        promises.push(
            {
                promise: mcpCheck
            }
        );

        return isInitialized(this)
            .then(function() {
                return util.callInSerial(this, promises);
            }.bind(this));

    }.bind(this);

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Reboots the BIG-IP
 */
BigIp.prototype.reboot = function() {
    return this.create('/tm/sys', {command: "reboot"}, undefined, util.NO_RETRY);
};

/**
 * Checks to see if the BIG-IP needs to be rebooted
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with 'true' if reboot is
 * required and resolved with 'false' otherwise.
 */
BigIp.prototype.rebootRequired = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var deferred = q.defer();

        this.ready()
            .then(function() {
                this.list('/tm/sys/db/provision.action', undefined, util.NO_RETRY)
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

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Saves sys config
 *
 * @param {String}  [file]                         - File to save to. Default is bigip.conf
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIp.prototype.save = function(file, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
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

                return this.create('/tm/sys/config', commandBody, undefined, util.NO_RETRY);
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
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
        return this.create(TRANSACTION_PATH, {}, undefined, util.NO_RETRY)
            .then(function(response) {
                return response.transId;
            });
    }.bind(this);

    var commitTransaction = function() {
        return this.modify(TRANSACTION_PATH + transactionId, { "state":"VALIDATING" }, undefined, util.NO_RETRY)
            .then(function(response) {
                if (response.state !== 'COMPLETED') {
                    return q.reject(new Error('Transaction state not completed (' + response.state + ')'));
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

    commands = commands || [];
    if (commands.length === 0) {
        return q();
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

var isInitialized = function(bigIp) {
    if (bigIp.isInitialized) {
        return q();
    }
    return q.reject();
};

module.exports = BigIp;
