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

/**
 * Provides onboarding functionality to a base BigIp objectn
 *
 * @param {Object} bigIpCore - Base BigIp object.
 */
function BigIpOnboard(bigIpCore) {
    this.core = bigIpCore;
}

/**
 * Sets global settings
 *
 * If settings include host name, a CM move of host name is also performed.
 *
 * @param {Object} globalSettings - An object containing the global settings
 *
 * @returns {Promise} A promise which is resolved when the global settings
 *                    are set or rejected if an error occurs.
 */
BigIpOnboard.prototype.globalSettings = function(globalSettings) {
    var hostName;

    return this.core.ready()
        .then(function() {
            // if host name is set, pull it out and use the hostName method
            if (globalSettings.hostName) {
                hostName = globalSettings.hostName;
                delete globalSettings.hostName;
            }
            return this.core.modify('/tm/sys/global-settings', globalSettings);
        }.bind(this))
        .then(function(response) {
            if (hostName) {
                return this.core.hostName(hostName);
            }
            else {
                return q(response);
            }
        }.bind(this));
};

/**
 * Sets the host name
 *
 * Sets the global settings host-name and also does a cm mv from
 * old host name to new.
 *
 * @param {String} hostName - The host name to set
 *
 * @returns {Promise} A promise which is resolved when the host name
 *                    is set or rejected if an error occurs.
 */
BigIpOnboard.prototype.hostName = function(hostName) {
    return this.core.ready()
        .then(function() {
            return this.core.list('/tm/cm/device');
        }.bind(this))
        .then(function(response) {
            var oldName = response[0].name;
            var newName = hostName;
            var commands = [];
            if (oldName !== newName) {
                commands.push(
                    {
                        method: 'create',
                        path: '/tm/cm/device',
                        body: {
                            command: 'mv',
                            name: oldName,
                            target: newName
                        }
                    }
                );
                commands.push(
                    {
                        method: 'modify',
                        path:  '/tm/sys/global-settings',
                        body: {
                            hostname: hostName
                        }
                    }
                );
                return this.core.transaction(commands);
            }
            else {
                return q('New host name matches existing host name');
            }
        }.bind(this));
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
BigIpOnboard.prototype.license = function(options) {
    var alreadyLicensed;
    if (!(options.registrationKey || options.addOnKeys)) {
        return q('No registration key or add on keys. Nothing to do.');
    }
    return this.core.ready()
        .then(function() {
            return this.core.list('/tm/shared/licensing/registration');
        }.bind(this))
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
                return this.core.create('/tm/sys/license', licenseBody);
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
        });
};

/**
 * Sets the password for a user
 *
 * @param {String} user - The user for whom to set the password
 * @param {String} newPassword - The password to set
 * @param {String} [oldPassword] - The old password for the user. Only
 *                                 required for the root user. Ignored
 *                                 otherwise;
 *
 * @returns {Promise} A promise which is resolved when the password
 *                    has been set, or rejected if an error occurs.
 */
BigIpOnboard.prototype.password = function(user, newPassword, oldPassword) {
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
                    }
                );
            }
            else {
                promise = this.core.modify(
                    '/tm/auth/user/' + user,
                    {
                        password: newPassword
                    }
                );
            }
            promise
                .then(function(response) {
                    // If we're setting the password for our user, we need to
                    // re-initialize the bigIp core
                    if (user === this.user) {
                        this.core.init(this.host, this.user, newPassword);
                    }
                    deferred.resolve(response);
                }.bind(this))
                .catch(function(err) {
                    deferred.reject(err);
                })
                .done();
        }.bind(this));
    return deferred.promise;
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
BigIpOnboard.prototype.provision = function(provisionSettings) {
    var modulesToProvision = Object.keys(provisionSettings);
    var PROVISION_PATH = '/tm/sys/provision/';
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
                                method: 'modify',
                                path: PROVISION_PATH + module,
                                body: {
                                    level: provisionSettings[module]
                                }
                            }
                        );
                    }
                });
                return this.core.transaction(provisioningCommands);
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
 *
 * @returns {Promise} A promise which is resolved when the db variables
 *                    have been set, or rejected if an error occurs.
 */
BigIpOnboard.prototype.setDbVars = function(dbVars) {
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

module.exports = BigIpOnboard;
