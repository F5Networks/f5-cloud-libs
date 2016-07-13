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

var icontrol;

function BigIp(host, user, password) {

    icontrol = new IControl({
        host: host,
        user: user,
        pass: password,
        basePath: '/mgmt',
        strict: false
    });
}

/**
 * Low-level interface
 */

/**
 * Submits a list (GET) request
 *
 * @param {String} path - the path to get
 * @param {Object} options - see iControl list options
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.list = function (path, options) {
    var deferred = q.defer();

    try {
        icontrol.list(path, options, function(err, response) {
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
 * @param {String} path - the path to get
 * @param {Object} body - the body for the POST request
 * @param {Object} options - see iControl create options
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.create = function(path, body, options) {
    var deferred = q.defer();

    try {
        icontrol.create(path, body, options, function(err, response) {
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
 * @param {String} path - the path to get
 * @param {Object} body - the body for the patch request
 * @param {Object} options - see iControl modify options
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.modify = function(path, body, options) {
    var deferred = q.defer();

    try {
        icontrol.modify(path, body, options, function(err, response) {
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
 * @param {String} path - the path to get
 * @param {Object} options - see iControl delete options
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.delete = function(path, options) {
    var deferred = q.defer();

    try {
        icontrol.delete(path, options, function(err, response) {
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
 * Do some basic initial configuration of BIG-IP
 *
 * @param {Object}   options - Initial configuration optons.
 * @param {Object}   [options.globalSettings] - A object containing global settings.
 * @param {Object}   [options.dns] - DNS configuration options
 * @param {String[]} [options.dns.name-servers] - Array of name servers.
 * @param {Object}   [options.ntp] - NTP configuration options.
 * @param {String}   [options.ntp.timezone] - Local timezone.
 * @param {String[]} [options.ntp.servers] - Array of NTP servers.
 * @param {String}   [options.hostname] - Hostname to set. Overrides options.globlaSettings.hostname.
 *
 * @returns {Promise} A promise which is resolved when the initial
 *                    configuration is complete or rejected if an
 *                    error occurs.
 */
BigIp.prototype.initialSetup = function(options) {
    var commands = [];

    var executeCommands = function() {
        if (options.globalSettings) {
            commands.push(
                {
                    promise: this.modify,
                    arguments: [
                        '/tm/sys/global-settings',
                        options.globalSettings
                    ],
                    message: 'Updating global settings:\n' + JSON.stringify(options.globalSettings, null, 4)
                }
            );
        }

        if (options.dns) {
            commands.push(
                {
                    promise: this.modify,
                    arguments: [
                        '/tm/sys/dns',
                        {
                            'name-servers': options.dns.nameServers
                        }
                    ],
                    message: 'Setting up DNS.'
                }
            );
        }

        if (options.ntp) {
            commands.push(
                {
                    promise: this.modify,
                    arguments: [
                        '/tm/sys/ntp',
                        {
                            'timezone': options.ntp.timezone,
                            'servers': options.ntp.servers
                        }
                    ],
                    message: 'Setting up NTP.'
                }
            );
        }

        if (commands.length > 0) {
            return util.callInSerial(this, commands, "Initial setup complete.");
        }
        else {
            return q();
        }
    }.bind(this);

    // Hostname might be set in two places: globalSettings and with the hostname option.
    // options.hostname will override options.globalSettings.hostname.
    // If either is set, we need to set the other.
    if (options.hostname) {
        options.globalSettings = options.globalSettings || {};
        options.globalSettings.hostname = options.hostname;
    }

    if (options.globalSettings && options.globalSettings.hostname && !options.hostname) {
        options.hostname = options.globalSettings.hostname;
    }

    // If hostname is being set, get the current hostname before proceeding
    if (options.hostname) {
        return this.list('/tm/cm/device')
            .then(function(response) {
                var oldName = response[0].name;
                var newName = options.hostname;

                if (oldName !== newName) {
                    commands.push(
                        {
                            promise: this.create,
                            arguments: [
                                '/tm/cm/device',
                                {
                                    command: 'mv',
                                    name: oldName,
                                    target: newName
                                }
                            ]
                        }
                    );
                }
                return executeCommands();
            }.bind(this));
    }
    else {
        return executeCommands();
    }
};

/**
 * Licenses the BIG-IP
 *
 * @param {Object}   options - Licensing options
 * @param {Boolean}  [options.overwrite] - Whether or not to overwrite an
 *                                         existing license file if it exists.
 *                                         Default is false
 * @param {String}   [options.registrationKey] - The registration key
 * @param {String[]} [options.addOnKeys] - Array of add on keys.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIp.prototype.license = function(options) {
    var alreadyLicensed;

    if (!(options.registrationKey || options.addOnKeys)) {
        return q('No registration key or add on keys. Nothing to do.');
    }

    return this.list('/tm/shared/licensing/registration')
        .then(function(response) {
            if (response.registrationKey && !options.addOnKeys.length && !options.overwrite) {
                alreadyLicensed = true;
                return q();
            }

            // If we are going to license, we first need to save sys config, otherwise
            // we lose any mods we have made but not yet saved
            return this.save();
        }.bind(this))
        .then(function() {
            var licenseBody;

            if (!alreadyLicensed) {
                licenseBody = {
                    command: 'install'
                };

                if (options.registrationKey) {
                    licenseBody.registrationKey = options.registrationKey;
                }

                if (options.addOnKeys.length > 0) {
                    licenseBody.addOnKeys = options.addOnKeys;
                }
                return this.create('/tm/sys/license', licenseBody);
            }
            else {
                return q();
            }
        }.bind(this))
        .then(function(response) {
            var message;

            if (alreadyLicensed) {
                message = 'BIG-IP already licensed. Use overwrite option to re-license.';
                return q(message);
            }
            else {
                message = response.commandResult.trim();
                if (message.indexOf("New license installed") === -1) {
                    return q.reject(message);
                }
                else {
                    return q(message);
                }
            }
        })
        .catch(function(error) {
            throw error;
        });
};

/**
 * Loads sys config
 *
 * @param {String} [file] - Full path on BIG-IP of file to load. Default is to load the default config.
 * @param {Object} [options] - Object map of load options (for example, {merge: true})
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIp.prototype.load = function(file, options) {
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
};

/**
 * Provisions modules
 *
 * @param {Object} provisionSettings - Object map of module to provisioning level
 *                                     ['dedicated', 'nominial', 'minimum', 'none']
 *
 * @returns {Promise} A promise which is resolved when the modules have
 *                    been provisioned, or rejected if an error occurs.
 */
BigIp.prototype.provision = function(provisionSettings) {
    var modulesToProvision = Object.keys(provisionSettings);
    var PROVISION_PATH = '/tm/sys/provision/';

    if (modulesToProvision.length > 0) {

        // Get list of provisionable modules
        return this.list(PROVISION_PATH)
            .then(function(response) {
                var currentProvisioning = {};
                var provisioningCommands = [];
                var provisionableModules;
                var i;

                // Get the current provisionalbe modules with their levels
                response.forEach(function(module) {
                    currentProvisioning[module.name] = module.level;
                });

                provisionableModules = Object.keys(currentProvisioning);

                // validate that modules we are to provision are provisionable
                for (i = 0; i < modulesToProvision.length; ++i) {
                    if (provisionableModules.indexOf(modulesToProvision[i]) < 0) {
                        return q.reject(new Error(modulesToProvision[i] + ' is not provisonable. Provisionable modules are: ' + provisionableModules));
                    }
                }

                // create provisioning string for any module not already provisioned at the right level
                modulesToProvision.forEach(function(module) {
                    if (provisionSettings[module] !== currentProvisioning[module]) {
                        provisioningCommands.push(
                            {
                                method: 'modify',
                                path: PROVISION_PATH + module,
                                body: {
                                    level: provisionSettings[module]
                                }
                            }
                        );
                    }
                });

                return this.transaction(provisioningCommands);
            }.bind(this));
    }

    else {
        return q();
    }
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
    maxRetries = maxRetries || 10;
    retryIntervalMs = retryIntervalMs || 1000;

    var isReady = function() {
        var deferred = q.defer();
        var promises = [];

        var requiredListUris = [
            '/shared/echo-js/available',
            '/tm/sys/available',
            '/tm/cm/available'
        ];

        var i;

        for (i = 0; i < requiredListUris.length; ++i) {
            promises.push(this.list(requiredListUris[i]));
        }

        q.all(promises)
            .then(function() {
               deferred.resolve();
            })
            .catch(function (err) {
                deferred.reject('Error calling /shared/echo-js: ' + err.message);
            });

        return deferred.promise;
    };

    return util.tryUntil(this, maxRetries, retryIntervalMs, isReady);
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
};

/**
 * Updates db variables
 *
 * @param {Object} dbVars - Object map of db variable to value
 *
 * @returns {Promise} A promise which is resolved when the db variables
 *                    have been set, or rejected if an error occurs.
 */
BigIp.prototype.setDbVars = function(dbVars) {
    var dbVarKeys = Object.keys(dbVars);
    var promises = [];
    var i;

    for (i = 0; i < dbVarKeys.length; ++i) {
        promises.push(this.modify(
            '/tm/sys/db/' + dbVarKeys[i],
            {
                value: dbVars[dbVarKeys[i]]
            }
        ));
    }

    return q.all(promises);
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
                    return q.reject('Transaction state not completed(' + response.state + ')');
                }
                return q();
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
        return q();
    }

    return startTransaction()
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
        })
        .then(function() {
            return commitTransaction();
        })
        .catch(function(err) {
            return q.reject(err);
        });
};

module.exports = BigIp;