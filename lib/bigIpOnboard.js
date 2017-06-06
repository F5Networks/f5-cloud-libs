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
var util = require('./util');
var Logger = require('./logger');

/**
 * Provides onboarding functionality to a base BigIp object
 * @class
 * @classdesc
 * Provides basic onboarding operaitons for a BIG-IP.
 *
 * @param {Object} bigIpCore               - Base BigIp object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
*/
function BigIpOnboard(bigIpCore, options) {
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

    this.core = bigIpCore;
}

/**
 * Sets global settings
 *
 * If settings include hostname, a CM move of hostname is also performed.
 *
 * @param {Object}  globalSettings                 - An object containing the global settings
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the global settings
 *                    are set or rejected if an error occurs.
 */
BigIpOnboard.prototype.globalSettings = function(globalSettings, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var hostname;

        return this.core.ready()
            .then(function() {
                // if hostname is set, pull it out and use the hostname method
                if (globalSettings.hostname) {
                    hostname = globalSettings.hostname;
                    delete globalSettings.hostname;
                }

                return this.core.modify('/tm/sys/global-settings', globalSettings, undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                if (hostname) {
                    return this.hostname(hostname);
                }
                else {
                    return q(response);
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Sets the hostname
 *
 * Sets the global settings host-name and also does a cm mv from
 * old hostname to new.
 *
 * @param {String}  hostname                       - The hostname to set
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the hostname
 *                    is set or rejected if an error occurs.
 */
BigIpOnboard.prototype.hostname = function(hostname, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.list('/tm/cm/device', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var oldName = response[0].name;
                var newName = hostname;

                if (oldName !== newName) {
                    return this.core.create(
                        '/tm/cm/device',
                        {
                            command: 'mv',
                            name: oldName,
                            target: newName
                        },
                        undefined,
                        util.NO_RETRY
                    )
                    .then(function() {
                        return this.core.ready();
                    }.bind(this))
                    .then(function() {
                        return this.core.modify(
                            '/tm/sys/global-settings',
                            {
                                hostname: hostname
                            },
                            undefined,
                            util.NO_RETRY
                        );
                    }.bind(this));
                }
                else {
                    return 'New hostname matches existing hostname';
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Licenses the BIG-IP
 *
 * @param {Object}   options                        - Licensing options
 * @param {Boolean}  [options.overwrite]            - Whether or not to overwrite an
 *                                                    existing license file if it exists.
 *                                                    Default is false
 * @param {String}   [options.registrationKey]      - The registration key
 * @param {String[]} [options.addOnKeys]            - Array of add on keys.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIpOnboard.prototype.license = function(options, retryOptions) {

    var licenseRetryOptions = {
        maxRetries: 5,
        retryIntervalMs: 10000
    };

    options = options || {};
    options.addOnKeys = options.addOnKeys || [];

    if (!(options.registrationKey || options.addOnKeys.length)) {
        return q('No registration key or add on keys. Nothing to do.');
    }

    retryOptions = retryOptions || licenseRetryOptions;

    var func = function() {
        var alreadyLicensed;
        var identicalLicense;

        return this.core.ready()
            .then(function() {
                return this.core.list('/tm/shared/licensing/registration', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                if (response.registrationKey && !options.addOnKeys.length && response.registrationKey === options.registrationKey) {
                    identicalLicense = true;
                    return;
                }
                else if (response.registrationKey && !options.addOnKeys.length && !options.overwrite) {
                    alreadyLicensed = true;
                    return;
                }
                // If we are going to license, we first need to save sys config, otherwise
                // we lose any mods we have made but not yet saved
                return this.core.save();
            }.bind(this))
            .then(function() {
                var licenseBody;
                if (!identicalLicense && !alreadyLicensed) {
                    licenseBody = {
                        command: 'install'
                    };
                    if (options.registrationKey) {
                        licenseBody.registrationKey = options.registrationKey;
                    }
                    if (options.addOnKeys.length > 0) {
                        licenseBody.addOnKeys = options.addOnKeys;
                    }
                    return this.core.create('/tm/sys/license', licenseBody, undefined, util.NO_RETRY);
                }
            }.bind(this))
            .then(function(response) {
                var message;
                if (identicalLicense) {
                    message = 'Identical license. Skipping.';
                    return message;
                }

                else if (alreadyLicensed) {
                    message = 'BIG-IP already licensed. Use overwrite option to re-license.';
                    return message;
                }
                else {
                    message = response.commandResult.trim();
                    if (message.indexOf("New license installed") === -1) {
                        return q.reject(new Error(message));
                    }
                    else {
                        return message;
                    }
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Licenses the BIG-IP from a BIG-IQ license pool
 *
 * @param {String}  host                    - IP or FQDN of BIG-IQ
 * @param {String}  user                    - BIG-IQ admin user name
 * @param {String}  password                - Password for BIG-IQ admin user
 * @param {String}  poolName                - Name of pool to license from
 * @param {String}  [bigIpMgmtAddress]      - IP address of BIG-IP management port. Default is that returned by device info.
 * @param {Object}  [options]               - Options for licenseViaBigIq
 * @param {Boolean} [options.passwordIsUrl] - Indicates that password is a URL for the password
 *
 */
BigIpOnboard.prototype.licenseViaBigIq = function(host, user, password, poolName, bigIpMgmtAddress, options) {

    var deferred = q.defer();
    var IControl = require('./iControl');
    // this.bigIqControl is used for testing
    var bigIqControl;
    var poolUuid;

    options = options || {};

    // Licensing is disruptive - save sys config first.
    this.core.save()
        .then(function() {
            return options.passwordIsUrl ? util.getDataFromUrl(password) : q(password);
        })
        .then(function(password) {
            var func = function() {
                return bigIqControl.create(
                    '/shared/authn/login',
                    {
                        username: user,
                        password: password
                    }
                );
            };

            bigIqControl = this.bigIqControl || new IControl(
                {
                    host: host.trim(),
                    user: user.trim(),
                    password: password,
                    strict: false
                }
            );

            // Token auth is required for BIG-IQ licensing, so get the token
            this.logger.debug('Getting BIG-IQ auth token.');
            return util.tryUntil(this, {maxRetries: 72, retryIntervalMs: 5000}, func);
        }.bind(this))
        .then(function(response) {
            // Don't log the response here - it has the auth token in it

            bigIqControl = this.bigIqControl || new IControl(
                {
                    host: host,
                    authToken: response.token.token,
                    strict: false
                }
            );

            this.logger.debug('Getting BIG-IQ version.');
            return bigIqControl.list('/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version');
        }.bind(this))
        .then(function(response) {
            this.logger.debug(response);

            var version = response[0].version;

            if (util.versionCompare(version, '5.0.0') < 0 || util.versionCompare(version, '5.2.0') > 0) {
                 throw new Error('Licensing via BIG-IQ is only supported on BIG-IQ versions 5.0.x and 5.1.x');
            }

            this.logger.debug('Getting BIG-IP license pool UUID.');
            return bigIqControl.list('/cm/shared/licensing/pools/?$select=uuid,name');
        }.bind(this))
        .then(function(response) {
            this.logger.debug(response);

            var i;

            if (Array.isArray(response)) {
                for (i = 0; i < response.length; ++i) {
                    if (response[i].name === poolName) {
                        poolUuid = response[i].uuid;
                        break;
                    }
                }

                if (poolUuid) {
                    this.logger.debug('Got pool UUID:', poolUuid);

                    // Get our management IP if it was not given to us
                    if (!bigIpMgmtAddress) {
                        return this.core.deviceInfo();
                    }
                }
                else {
                    deferred.reject(new Error('No license pool found with name: ' + poolName));
                }
            }
            else {
                deferred.reject(new Error ('Error getting license pools: ' + response));
            }
        }.bind(this))
        .then(function(response) {
            this.logger.debug(response);

            if (response || bigIpMgmtAddress) {
                bigIpMgmtAddress = bigIpMgmtAddress || response.managementAddress;
                this.logger.debug('Requesting license from BIG-IQ license pool.');
                return bigIqControl.create(
                    '/cm/shared/licensing/pools/' + poolUuid + '/members',
                    {
                        deviceAddress: bigIpMgmtAddress + ':' + this.core.port,
                        username: this.core.user,
                        password: this.core.password
                    }
                );
            }
        }.bind(this))
        .then(function(response) {
            this.logger.debug(response);

            var state;
            var licenseUuid;

            var isLicensed = function() {
                var deferred = q.defer();

                bigIqControl.list(
                    '/cm/shared/licensing/pools/' + poolUuid + '/members/' + licenseUuid
                )
                .then(function(response) {
                    var state;
                    state = response.state;
                    this.logger.verbose('Current licensing state:', state);
                    if (state === 'LICENSED') {
                        deferred.resolve();
                    }
                    else {
                        deferred.reject();
                    }
                }.bind(this));

                return deferred.promise;
            };

            if (response) {
                state = response.state;
                licenseUuid = response.uuid;
                this.logger.verbose('Current licensing state:', state);
                this.logger.debug('License UUID:', licenseUuid);

                if (state === 'LICENSED') {
                    deferred.resolve();
                }
                else {
                    this.logger.verbose('Waiting to be LICENSED.');
                    util.tryUntil(this, {maxRetries: 40, retryIntervalMs: 5000}, isLicensed)
                        .then(function() {
                            deferred.resolve();
                        })
                        .catch(function() {
                            deferred.reject(new Error('Giving up on licensing via BIG-IQ.'));
                        });
                }
            }
        }.bind(this))
        .catch(function(err) {
            deferred.reject(err);
        });

    return deferred.promise;
};

/**
 * Updates or creates a user
 *
 * @param {String}  user                    - Username to update or create.
 * @param {String}  password                - Password for user or file URL from which password can be retrieved.
 * @param {String}  [role]                  - Role for user. Only valid when creating user.
 * @param {String}  [shell]                 - Shell for user (bash | tmsh | none). Only valid when creating user. Default tmsh.
 * @param {Object}  [options]               - Options for user
 * @param {Boolean} [options.passwordIsUrl] - Indicates that password is a URL for the password
 *
 * @returns {Promise} A promise which is resolved when the user has been updated
 *                    or rejected if an error occurs.

 */
BigIpOnboard.prototype.updateUser = function(user, password, role, shell, options) {
    options = options || {};

    return this.core.ready()
        .then(function() {
            // Check to see if the user exists
            return this.core.list('/tm/auth/user');
        }.bind(this))
        .then(function(response) {
            var body = {
                password: options.passwordIsUrl ? util.getPasswordFromUrl(password) : password
            };

            var currentUser = -1;

            if (Array.isArray(response)) {
                currentUser = response.findIndex(function(element) {
                    return element.name === user;
                });
            }

            if (currentUser !== -1) {
                // If we're setting the password for our user, we need to
                // re-initialize the bigIp core
                if (user === this.core.user) {
                    return this.core.init(this.core.host, this.core.user, password, this.core.port, options)
                        .then(function() {
                            return this.core.modify('/tm/auth/user/' + user, body);
                        }.bind(this));
                }
                else {
                    return this.core.modify('/tm/auth/user/' + user, body);
                }
            }
            else {
                if (!role) {
                    return q.reject(new Error('Must specify role when creating a user.'));
                }

                shell = shell || 'tmsh';

                body.name = user;
                body.shell = shell;
                body["partition-access"] = {
                    "all-partitions": {
                        role: role
                    }
                };

                return this.core.create('/tm/auth/user', body);
            }
        }.bind(this));
};

/**
 * Sets the password for a user
 *
 * @param {String}  user                           - The user for whom to set the password
 * @param {String}  newPassword                    - The password to set
 * @param {String}  [oldPassword]                  - The old password for the user. Only
 *                                                   required for the root user. Ignored
 *                                                   otherwise;
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the password
 *                    has been set, or rejected if an error occurs.
 */
BigIpOnboard.prototype.password = function(user, newPassword, oldPassword, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var deferred = q.defer();
        var promise;

        this.core.ready()
            .then(function() {
                if (user === 'root') {
                    promise = this.core.create(
                        '/shared/authn/root',
                        {
                            oldPassword: oldPassword,
                            newPassword: newPassword
                        },
                        null,
                        util.NO_RETRY
                    );
                }
                else {
                    promise = this.core.modify(
                        '/tm/auth/user/' + user,
                        {
                            password: newPassword
                        },
                        null,
                        util.NO_RETRY
                    );
                }
                promise
                    .then(function(response) {
                        // If we're setting the password for our user, we need to
                        // re-initialize the bigIp core
                        if (user === this.core.user) {
                            return this.core.init(this.core.host, this.core.user, newPassword, {port: this.core.port})
                                .then(function() {
                                    deferred.resolve(response);
                                });
                        }
                        else {
                            deferred.resolve(response);
                        }
                    }.bind(this))
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
 * Provisions modules
 *
 * @param {Object}  provisionSettings              - Object map of module to provisioning level
 *                                                  ['dedicated', 'nominial', 'minimum', 'none']
 *
 * @returns {Promise} A promise which is resolved when the modules have
 *                    been provisioned, or rejected if an error occurs.
 */
BigIpOnboard.prototype.provision = function(provisionSettings) {
    var modulesToProvision = Object.keys(provisionSettings);
    var PROVISION_PATH = '/tm/sys/provision/';
    var DELAY_BETWEEN_PROVISION_COMMANDS = 10000;

    if (modulesToProvision.length > 0) {

        return this.core.ready()
            .then(function() {
                // Get list of provisionable modules
                return this.core.list(PROVISION_PATH);
            }.bind(this))
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
                        return q.reject(new Error(modulesToProvision[i] + ' is not provisionable. Provisionable modules are: ' + provisionableModules));
                    }
                }
                // create provisioning string for any module not already provisioned at the right level
                modulesToProvision.forEach(function(module) {
                    if (provisionSettings[module] !== currentProvisioning[module]) {
                        provisioningCommands.push(
                            {
                                promise: this.core.modify,
                                arguments: [
                                    PROVISION_PATH + module,
                                    {
                                        level: provisionSettings[module]
                                    }
                                ]
                            }
                        );
                    }
                }.bind(this));

                return util.callInSerial(this.core, provisioningCommands, DELAY_BETWEEN_PROVISION_COMMANDS);
            }.bind(this))
            .then(function() {
                return this.core.active();
            }.bind(this));
    }
    else {
        return q();
    }
};

/**
 * Updates db variables
 *
 * @param {Object} dbVars - Object map of db variable to value
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the db variables
 *                    have been set, or rejected if an error occurs.
 */
BigIpOnboard.prototype.setDbVars = function(dbVars, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var dbVarKeys = Object.keys(dbVars);
        var promises = [];
        var i;

        for (i = 0; i < dbVarKeys.length; ++i) {
            promises.push(this.core.modify(
                '/tm/sys/db/' + dbVarKeys[i],
                {
                    value: dbVars[dbVarKeys[i]]
                }
            ));
        }
        return this.core.ready()
            .then(function() {
                return q.all(promises);
            });
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Sets the SSL port on which the management IP is listening
 *
 * @param {Integer} sslPort                        - SSL port to listen on.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Boolean} [noInit]                       - For testing only. Used so that we don't reset iControl during unit tests.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpOnboard.prototype.sslPort = function(sslPort, retryOptions, noInit) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var SELF_ALLOW_PATH = '/tm/net/self-allow';
        return this.core.ready()
            .then(function() {
                return this.core.modify(
                    '/tm/sys/httpd',
                    {
                        sslPort: sslPort
                    },
                    undefined,
                    util.NO_RETRY
                );
            }.bind(this))
            .then(function() {
                if (!noInit) {
                    // Since we just reset our port, we need to update iControl
                    return this.core.init(this.core.host, this.core.user, this.core.password, {port: sslPort});
                }
            }.bind(this))
            .then(function() {
                return this.core.list(SELF_ALLOW_PATH);
            }.bind(this))
            .then(function(response) {
                var defaults = response.defaults || [];
                var defaultsChanged;
                var index443;

                if (defaults.indexOf('tcp:' + sslPort) === -1) {
                    defaults.push('tcp:' + sslPort);
                    defaultsChanged = true;
                }

                if (sslPort !== 443) {
                    index443 = defaults.indexOf('tcp:443');
                    if (index443 !== -1) {
                        defaults.splice(index443, 1);
                        defaultsChanged = true;
                    }
                }

                if (defaultsChanged) {
                    return this.core.modify(
                        SELF_ALLOW_PATH,
                        {
                            defaults: defaults
                        }
                    );
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

module.exports = BigIpOnboard;
