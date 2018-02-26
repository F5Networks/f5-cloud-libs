/**
 * Copyright 2016-2018 F5 Networks, Inc.
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

const q = require('q');
const util = require('./util');
const cloudProviderFactory = require('./cloudProviderFactory');
const Logger = require('./logger');
const IControl = require('./iControl');
const BigIq50LicenseProvider = require('./bigIq50LicenseProvider');
const BigIq52LicenseProvider = require('./bigIq52LicenseProvider');
const BigIq53LicenseProvider = require('./bigIq53LicenseProvider');

/**
 * Onboard constructor
 *
 * @class
 * @classdesc
 * Provides onboarding functionality to a base BigIp object
 *
 * @param {Object} bigIpCore               - Base BigIp object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
*/
function BigIpOnboard(bigIpCore, options) {
    const logger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;

    if (logger) {
        this.logger = logger;
        util.setLogger(logger);
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        util.setLoggerOptions(loggerOptions);
    }

    this.core = bigIpCore;
    this.options = options;
}

/**
 * Sets global settings
 *
 * If settings include hostname, a CM move of hostname is also performed.
 *
 * @param {Object}  settings                       - An object containing the global settings
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the global settings
 *                    are set or rejected if an error occurs.
 */
BigIpOnboard.prototype.globalSettings = function globalSettings(settings, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    const updatedSettings = {};

    Object.keys(settings).forEach((setting) => {
        updatedSettings[setting] = settings[setting];
    });

    const func = function () {
        let hostname;

        return this.core.ready()
            .then(() => {
                // if hostname is set, pull it out and use the hostname method
                if (updatedSettings.hostname) {
                    hostname = updatedSettings.hostname;
                    delete updatedSettings.hostname;
                }

                return this.core.modify('/tm/sys/global-settings', updatedSettings, undefined, util.NO_RETRY);
            })
            .then((response) => {
                if (hostname) {
                    return this.hostname(hostname);
                }
                return q(response);
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Sets the hostname
 *
 * Sets the global settings host-name and also does a cm mv from
 * old hostname to new.
 *
 * @param {String}  name                           - The hostname to set
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the hostname
 *                    is set or rejected if an error occurs.
 */
BigIpOnboard.prototype.hostname = function hostname(name, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.core.list('/tm/cm/device', undefined, util.NO_RETRY);
            })
            .then((response) => {
                const oldName = response[0].name;
                const newName = name;

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
                        .then(() => {
                            return this.core.ready();
                        })
                        .then(() => {
                            return this.core.modify(
                                '/tm/sys/global-settings',
                                { hostname: name },
                                undefined,
                                util.NO_RETRY
                            );
                        });
                }

                return 'New hostname matches existing hostname';
            });
    };

    return util.tryUntil(this, retry, func);
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
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIpOnboard.prototype.license = function license(options, retryOptions) {
    const licenseRetryOptions = {
        maxRetries: 5,
        retryIntervalMs: 10000
    };

    const overwrite = options ? options.overwrite : undefined;
    const registrationKey = options ? options.registrationKey : undefined;
    const addOnKeys = options ? options.addOnKeys || [] : [];

    if (!(registrationKey || addOnKeys.length)) {
        return q('No registration key or add on keys. Nothing to do.');
    }

    const retry = retryOptions || licenseRetryOptions;

    const func = function () {
        let alreadyLicensed;
        let identicalLicense;

        return this.core.ready()
            .then(() => {
                return this.core.list('/tm/shared/licensing/registration', undefined, util.NO_RETRY);
            })
            .then((response) => {
                if (
                    response.registrationKey
                    && !addOnKeys.length
                    && response.registrationKey === registrationKey
                ) {
                    identicalLicense = true;
                    return q();
                } else if (response.registrationKey && !addOnKeys.length && !overwrite) {
                    alreadyLicensed = true;
                    return q();
                }
                // If we are going to license, we first need to save sys config, otherwise
                // we lose any mods we have made but not yet saved
                return this.core.save();
            })
            .then(() => {
                let licenseBody;
                if (!identicalLicense && !alreadyLicensed) {
                    licenseBody = {
                        command: 'install'
                    };
                    if (registrationKey) {
                        licenseBody.registrationKey = registrationKey;
                    }
                    if (addOnKeys.length > 0) {
                        licenseBody.addOnKeys = addOnKeys;
                    }
                    return this.core.create('/tm/sys/license', licenseBody, undefined, util.NO_RETRY);
                }
                return q();
            })
            .then((response) => {
                let message;
                if (identicalLicense) {
                    message = 'Identical license. Skipping.';
                    return message;
                } else if (alreadyLicensed) {
                    message = 'BIG-IP already licensed. Use overwrite option to re-license.';
                    return message;
                }
                message = response.commandResult.trim();
                if (message.indexOf('New license installed') === -1) {
                    return q.reject(new Error(message));
                }
                return message;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Licenses the BIG-IP from a BIG-IQ license pool
 *
 * @param {String}  host                       - IP or FQDN of BIG-IQ
 * @param {String}  user                       - BIG-IQ admin user name
 * @param {String}  password                   - Password for BIG-IQ admin user
 * @param {String}  poolName                   - Name of pool to license from
 * @param {Object}  [options]                  - Options for licenseViaBigIq
 * @param {Boolean} [options.passwordIsUri]    - Indicates that password is a URI for the password
 * @param {String}  [options.bigIpMgmtAddress] - IP address of BIG-IP management port.
 *                                               Default is that returned by device info.
 * @param {String}  [options.bigIpMgmtPort]    - Port of BIG-IP management port. Default is this.core.port
 * @param {Boolean} [options.overwrite]        - Whether or not to overwrite an existing license
 *                                               if it exists. Default is false.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIpOnboard.prototype.licenseViaBigIq = function licenseViaBigIq(host, user, password, poolName, options) {
    // this.bigIqControl is used for testing
    let bigIqControl;
    let licenseProvider;

    const overwrite = options ? options.overwrite : undefined;
    const passwordIsUri = options ? options.passwordIsUri : undefined;
    const bigIpMgmtPort = options ? options.bigIpMgmtPort : undefined;
    let bigIpMgmtAddress = options ? options.bigIpMgmtAddress : undefined;

    const doLicense = function doLicense() {
        // If we are going to license, we first need to save sys config, otherwise
        // we lose any mods we have made but not yet saved
        return this.core.save()
            .then(() => {
                // Wait for ready again after save
                return this.core.ready();
            })
            .then(() => {
                if (passwordIsUri) {
                    if (password.startsWith('arn')) {
                        // AWS arn
                        // this.provider can be injected by test code
                        if (!this.provider) {
                            this.provider =
                                cloudProviderFactory.getCloudProvider('aws', { logger: this.logger });
                        }

                        return this.provider.init()
                            .then(() => {
                                return this.provider.getDataFromUri(password);
                            })
                            .catch((err) => {
                                throw (err);
                            });
                    }

                    // Plain old url
                    return util.getDataFromUrl(password);
                }

                // Plain old password
                return q(password);
            })
            .then((readPassword) => {
                const func = function () {
                    return bigIqControl.create(
                        '/shared/authn/login',
                        {
                            username: user,
                            password: readPassword
                        }
                    );
                };

                bigIqControl = this.bigIqControl || new IControl({
                    host: host.trim(),
                    user: user.trim(),
                    password: readPassword ? readPassword.trim() : '',
                    strict: false
                });

                // Token auth is required for BIG-IQ licensing, so get the token
                this.logger.debug('Getting BIG-IQ auth token.');
                return util.tryUntil(this, { maxRetries: 72, retryIntervalMs: 5000 }, func);
            })
            .then((response) => {
                // Don't log the response here - it has the auth token in it

                const versionPath =
                    '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version';

                bigIqControl = this.bigIqControl || new IControl({
                    host,
                    authToken: response.token.token,
                    strict: false
                });

                this.logger.debug('Getting BIG-IQ version.');
                return bigIqControl.list(versionPath);
            })
            .then((response) => {
                this.logger.debug(response);

                const version = response[0].version;

                if (util.versionCompare(version, '5.0.0') < 0) {
                    throw new Error('Licensing via BIG-IQ is only supported on BIG-IQ versions 5.0.x +');
                }

                if (
                    util.versionCompare(version, '5.0.0') >= 0
                    && util.versionCompare(version, '5.2.0') < 0
                ) {
                    licenseProvider = new BigIq50LicenseProvider(this.core, this.options);
                } else if (
                    util.versionCompare(version, '5.2.0') >= 0
                    && util.versionCompare(version, '5.3.0') < 0
                ) {
                    licenseProvider = new BigIq52LicenseProvider(this.core, this.options);
                } else if (
                    util.versionCompare(version, '5.3.0') >= 0
                ) {
                    licenseProvider = new BigIq53LicenseProvider(this.core, this.options);
                } else {
                    throw new Error('No license provider found for BIG-IQ', version);
                }

                // Get our management IP if it was not given to us
                if (!bigIpMgmtAddress) {
                    return this.core.deviceInfo();
                }

                return q();
            })
            .then((response) => {
                this.logger.debug(response);

                if (response) {
                    bigIpMgmtAddress = response.managementAddress;
                }

                this.logger.debug('Getting license from provider.');
                return licenseProvider.getUnmanagedDeviceLicense(
                    bigIqControl,
                    poolName,
                    bigIpMgmtAddress,
                    bigIpMgmtPort || this.core.port
                );
            });
    }.bind(this);

    return this.core.ready()
        .then(() => {
            return this.core.list('/tm/shared/licensing/registration', undefined, util.NO_RETRY);
        })
        .then((response) => {
            if (!response.registrationKey || overwrite) {
                return doLicense();
            }
            this.logger.info('BIG-IP already licensed. Use overwrite option to re-license.');
            return q();
        })
        .catch((err) => {
            return q.reject(err);
        });
};

/**
 * Updates or creates a user
 *
 * @param {String}  user                    - Username to update or create.
 * @param {String}  password                - Password for user or URL from which password can be retrieved.
 * @param {String}  [role]                  - Role for user. Only valid when creating user.
 * @param {String}  [shell]                 - Shell for user (bash | tmsh | none).
 *                                            Only valid when creating user. Default tmsh.
 * @param {Object}  [options]               - Options for user
 * @param {Boolean} [options.passwordIsUrl] - Indicates that password is a URL for the password
 *
 * @returns {Promise} A promise which is resolved when the user has been updated
 *                    or rejected if an error occurs.
 */
BigIpOnboard.prototype.updateUser = function updateUser(user, password, role, shell, options) {
    const passwordIsUrl = options ? options.passwordIsUrl : undefined;
    let readPassword;

    return this.core.ready()
        .then(() => {
            // retrieve the password
            return passwordIsUrl ? util.getDataFromUrl(password) : q(password);
        })
        .then((response) => {
            readPassword = response;

            // Check to see if the user exists
            return this.core.list('/tm/auth/user');
        })
        .then((response) => {
            const body = {
                password: readPassword
            };

            let currentUser = -1;

            if (Array.isArray(response)) {
                currentUser = response.findIndex((element) => {
                    return element.name === user;
                });
            }

            if (currentUser !== -1) {
                // If we're setting the password for our user, we need to
                // re-initialize the bigIp core
                if (user === this.core.user) {
                    return this.core.init(this.core.host, this.core.user, password, this.core.port, options)
                        .then(() => {
                            return this.core.modify(`/tm/auth/user/${user}`, body);
                        });
                }
                return this.core.modify(`/tm/auth/user/${user}`, body);
            }

            if (!role) {
                return q.reject(new Error('Must specify role when creating a user.'));
            }

            body.name = user;
            body.shell = shell || 'tmsh';
            body['partition-access'] = {
                'all-partitions': { role }
            };

            return this.core.create('/tm/auth/user', body);
        });
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
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the password
 *                    has been set, or rejected if an error occurs.
 */
BigIpOnboard.prototype.password = function password(user, newPassword, oldPassword, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const deferred = q.defer();
        let promise;

        this.core.ready()
            .then(() => {
                if (user === 'root') {
                    promise = this.core.create(
                        '/shared/authn/root',
                        {
                            oldPassword,
                            newPassword
                        },
                        null,
                        util.NO_RETRY
                    );
                } else {
                    promise = this.core.modify(
                        `/tm/auth/user/${user}`,
                        {
                            password: newPassword
                        },
                        null,
                        util.NO_RETRY
                    );
                }
                return promise;
            })
            .then((response) => {
                // If we're setting the password for our user, we need to
                // re-initialize the bigIp core
                if (user === this.core.user) {
                    return this.core.init(
                        this.core.host,
                        this.core.user,
                        newPassword,
                        { port: this.core.port }
                    );
                }

                return response;
            })
            .then((response) => {
                deferred.resolve(response);
            })
            .catch((err) => {
                deferred.reject(err);
            })
            .done();
        return deferred.promise;
    };

    return util.tryUntil(this, retry, func);
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
BigIpOnboard.prototype.provision = function provision(provisionSettings) {
    const modulesToProvision = Object.keys(provisionSettings);
    const PROVISION_PATH = '/tm/sys/provision/';
    const DELAY_BETWEEN_PROVISION_COMMANDS = 10000;

    if (modulesToProvision.length > 0) {
        return this.core.ready()
            .then(() => {
                // Get list of provisionable modules
                return this.core.list(PROVISION_PATH);
            })
            .then((response) => {
                const currentProvisioning = {};
                const provisioningCommands = [];
                let i;

                // Get the current provisionalbe modules with their levels
                response.forEach((module) => {
                    currentProvisioning[module.name] = module.level;
                });

                const provisionableModules = Object.keys(currentProvisioning);

                // validate that modules we are to provision are provisionable
                for (i = 0; i < modulesToProvision.length; i++) {
                    if (provisionableModules.indexOf(modulesToProvision[i]) < 0) {
                        let message = `${modulesToProvision[i]} is not provisionable.`;
                        message += ` Provisionable modules are: ${provisionableModules}`;
                        return q.reject(new Error(message));
                    }
                }
                // create provisioning string for any module not already provisioned at the right level
                modulesToProvision.forEach((module) => {
                    if (provisionSettings[module] !== currentProvisioning[module]) {
                        provisioningCommands.push({
                            promise: this.core.modify,
                            arguments: [
                                PROVISION_PATH + module,
                                {
                                    level: provisionSettings[module]
                                }
                            ]
                        });
                    }
                });

                return util.callInSerial(this.core, provisioningCommands, DELAY_BETWEEN_PROVISION_COMMANDS);
            })
            .then(() => {
                return this.core.active();
            });
    }

    return q();
};

/**
 * Updates db variables
 *
 * @param {Object}  dbVars                         - Object map of db variable to value
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the db variables
 *                    have been set, or rejected if an error occurs.
 */
BigIpOnboard.prototype.setDbVars = function setDbVars(dbVars, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const dbVarKeys = Object.keys(dbVars);
        const promises = [];

        dbVarKeys.forEach((key) => {
            promises.push(this.core.modify(
                `/tm/sys/db/${key}`,
                {
                    value: dbVars[key]
                }
            ));
        });

        return this.core.ready()
            .then(() => {
                return q.all(promises);
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Sets the SSL port on which the management IP is listening
 *
 * @param {Integer} sslPort                        - SSL port to listen on.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Boolean} [noInit]                       - For testing only. Used so that we don't reset
 *                                                   iControl during unit tests.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpOnboard.prototype.sslPort = function sslPort(port, retryOptions, noInit) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const SELF_ALLOW_PATH = '/tm/net/self-allow';

        return this.core.ready()
            .then(() => {
                return this.core.modify(
                    '/tm/sys/httpd',
                    { sslPort: port },
                    undefined,
                    util.NO_RETRY
                );
            })
            .then(() => {
                if (!noInit) {
                    // Since we just reset our port, we need to update iControl
                    return this.core.init(
                        this.core.host,
                        this.core.user,
                        this.core.password,
                        { port }
                    );
                }
                return q();
            })
            .then(() => {
                return this.core.list(SELF_ALLOW_PATH);
            })
            .then((response) => {
                const defaults = response.defaults || [];
                let defaultsChanged;
                let index443;

                if (defaults.indexOf(`tcp:${port}`) === -1) {
                    defaults.push(`tcp:${port}`);
                    defaultsChanged = true;
                }

                if (port !== 443) {
                    index443 = defaults.indexOf('tcp:443');
                    if (index443 !== -1) {
                        defaults.splice(index443, 1);
                        defaultsChanged = true;
                    }
                }

                if (defaultsChanged) {
                    return this.core.modify(
                        SELF_ALLOW_PATH,
                        { defaults }
                    );
                }

                return q();
            });
    };

    return util.tryUntil(this, retry, func);
};

module.exports = BigIpOnboard;
