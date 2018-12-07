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
const fs = require('fs');
const util = require('./util');
const Logger = require('./logger');
const BigIq = require('./bigIq');
const AutoscaleInstance = require('./autoscaleInstance');
const cryptoUtil = require('./cryptoUtil');

const SYS_DB_PATH = '/tm/sys/db/';

/**
 * Onboard constructor
 *
 * @class
 * @classdesc
 * Provides onboarding functionality to a base BigIp object
 *
 * @mixes bigIqOnboardMixins
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

                if (oldName !== name) {
                    return this.core.create(
                        '/tm/cm/device',
                        {
                            command: 'mv',
                            name: oldName,
                            target: name
                        },
                        undefined,
                        util.NO_RETRY
                    )
                        .then(() => {
                            return this.core.ready();
                        });
                }

                this.logger.debug('New hostname matches existing cm device name');
                return q();
            })
            .then(() => {
                return this.core.list('/tm/sys/global-settings');
            })
            .then((response) => {
                const oldName = response.hostname;
                if (oldName !== name) {
                    return this.core.modify(
                        '/tm/sys/global-settings',
                        { hostname: name },
                        undefined,
                        util.NO_RETRY
                    );
                }

                this.logger.debug('New hostname matches existing global-settings hostname');
                return q();
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Installs a given license on the device
 *
 * @param {String} licenseText - The license contents (the stuff that goes in /config/bigip.license)
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIpOnboard.prototype.installLicense = function installLicense(licenseText) {
    return this.core.ready()
        .then(() => {
            return this.core.save();
        })
        .then(() => {
            this.logger.debug('Installing license');
            const commandBody = {
                licenseText
            };
            return this.core.replace(
                '/tm/shared/licensing/registration',
                commandBody,
                null,
                { maxRetries: 0, retryInterval: 0 }
            );
        })
        .then((response) => {
            this.logger.debug(response);
            this.logger.debug('Waiting for active');
            return this.core.active();
        });
};

/**
 * Licenses the device
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
                    message = 'Device is already licensed. Use overwrite option to re-license.';
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
 * @param {String}  host                        - IP or FQDN of BIG-IQ.
 * @param {String}  user                        - BIG-IQ admin user name.
 * @param {String}  password                    - Password for BIG-IQ admin user.
 * @param {String}  poolName                    - Name of pool to license from.
 * @param {String}  cloud                       - Name of cloud. Only BIG-IQ 5.4+ needs this but
 *                                                since we don't know what version we are using, this
 *                                                is required. Supported values are
 *                                                aws, azure, gce, vmware, hyperv, kvm, xen
 * @param {Object}  [options]                   - Options for licenseViaBigIq.
 * @param {Boolean} [options.passwordIsUri]     - Indicates that password is a URI for the password.
 * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted
 * @param {String}  [options.bigIpMgmtAddress]  - IP address of BIG-IP management port.
 *                                                Default is that returned by device info.
 * @param {String}  [options.bigIpMgmtPort]     - Port of BIG-IP management port. Default is this.core.port.
 * @param {String}  [options.skuKeyword1]       - skuKeyword1 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.skuKeyword2]       - skuKeyword2 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.unitOfMeasure]     - unitOfMeasure parameter for CLPv2 licensing. Default none.
 * @param {Boolean} [options.overwrite]         - Whether or not to overwrite an existing license
 *                                                if it exists. Default is false.
 * @param {Boolean} [options.noUnreachable]     - Do not use the unreachable API even on
 *                                                BIG-IQs that support it.
 * @param {Boolean} [options.autoApiType]       - Automatically determine API type rather than basing
 *                                                on BIG-IQ version.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIpOnboard.prototype.licenseViaBigIq = function licenseViaBigIq(
    host,
    user,
    password,
    poolName,
    cloud,
    options
) {
    const overwrite = options ? options.overwrite : undefined;
    const passwordIsUri = options ? options.passwordIsUri : undefined;
    const passwordEncrypted = options ? options.passwordEncrypted : undefined;
    const bigIpMgmtPort = options ? options.bigIpMgmtPort : undefined;
    const skuKeyword1 = options ? options.skuKeyword1 : undefined;
    const skuKeyword2 = options ? options.skuKeyword2 : undefined;
    const unitOfMeasure = options ? options.unitOfMeasure : undefined;
    const noUnreachable = options ? options.noUnreachable : undefined;
    const autoApiType = options ? options.autoApiType : undefined;
    let bigIpMgmtAddress = options ? options.bigIpMgmtAddress : undefined;

    return this.core.list('/tm/shared/licensing/registration', undefined, util.NO_RETRY)
        .then((response) => {
            if (!response.registrationKey || overwrite) {
                const bigIq = new BigIq(this.options);
                return bigIq.init(
                    host,
                    user,
                    password,
                    { passwordIsUri, passwordEncrypted, bigIp: this.core }
                )
                    .then(() => {
                        return this.core.save();
                    })
                    .then(() => {
                        // Wait for ready again after save
                        return this.core.ready();
                    })
                    .then(() => {
                        // Get our management IP if it was not given to us
                        if (!bigIpMgmtAddress) {
                            return this.core.deviceInfo();
                        }

                        return q();
                    })
                    .then((deviceInfo) => {
                        this.logger.debug(deviceInfo);

                        if (deviceInfo) {
                            bigIpMgmtAddress = deviceInfo.managementAddress;
                        }

                        return bigIq.licenseBigIp(
                            poolName,
                            bigIpMgmtAddress,
                            bigIpMgmtPort || this.core.port,
                            {
                                cloud,
                                skuKeyword1,
                                skuKeyword2,
                                unitOfMeasure,
                                noUnreachable,
                                autoApiType
                            }
                        );
                    })
                    .catch((err) => {
                        this.logger.info(
                            'Error licensing via BIG-IQ',
                            err && err.message ? err.message : err
                        );
                        return q.reject(err);
                    });
            }
            this.logger.info('BIG-IP already licensed. Use overwrite option to re-license.');
            return q();
        });
};

/**
 * Tells BIG-IQ to revoke this BIG-IPs license
 *
 * @param {String}  host                        - IP or FQDN of BIG-IQ.
 * @param {String}  user                        - BIG-IQ admin user nam´.e
 * @param {String}  password                    - Password for BIG-IQ admin user.
 * @param {String}  poolName                    - Name of pool to license from.
 * @param {Object}  [options]                   - Options for licenseViaBigIq.
 * @param {Boolean} [options.passwordIsUri]     - Indicates that password is a URI for the password.
 * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted
 * @param {Boolean} [options.noUnreachable]    - Do not use the unreachable API even on
 *                                               BIG-IQs that support it.
 *
 * @returns {Promise} A promise which is resolved when the revoke
 *                    is complete or rejected if an error occurs.
 */
BigIpOnboard.prototype.revokeLicenseViaBigIq = function revokeLicenseViaBigIq(
    host,
    user,
    password,
    poolName,
    options
) {
    const passwordIsUri = options ? options.passwordIsUri : undefined;
    const passwordEncrypted = options ? options.passwordEncrypted : undefined;
    const bigIq = new BigIq(this.options);
    const instance = new AutoscaleInstance();

    return this.core.ready()
        .then(() => {
            return this.core.deviceInfo();
        })
        .then((deviceInfo) => {
            instance.setHostname(deviceInfo.hostname);
            instance.setMachineId(deviceInfo.machineId);
            instance.setMacAddress(deviceInfo.hostMac);

            return bigIq.init(host, user, password, { passwordIsUri, passwordEncrypted, bigIp: this.core });
        })
        .then(() => {
            return bigIq.revokeLicense(poolName, instance, options);
        })
        .catch((err) => {
            this.logger.info(
                'Error revoking license via BIG-IQ',
                err && err.message ? err.message : err
            );
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
    const methodOptions = {};
    Object.assign(methodOptions, options);

    let readPassword;
    let userEndpoint = '/tm/auth/user';
    if (this.core.isBigIq()) {
        userEndpoint = '/shared/authz/users';
    }

    return this.core.ready()
        .then(() => {
            // retrieve the password
            return methodOptions.passwordIsUrl ? util.getDataFromUrl(password) : q(password);
        })
        .then((response) => {
            readPassword = response;

            // Check to see if the user exists
            return this.core.list(userEndpoint);
        })
        .then((response) => {
            const body = {
                password: readPassword
            };

            if (shell) {
                body.shell = shell;
            }

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
                    methodOptions.port = this.core.port;
                    return this.core.init(this.core.host, this.core.user, password, methodOptions)
                        .then(() => {
                            return this.core.modify(`${userEndpoint}/${user}`, body);
                        });
                }
                return this.core.modify(`${userEndpoint}/${user}`, body);
            }

            if (!role) {
                return q.reject(new Error('Must specify role when creating a user.'));
            }

            body.name = user;
            body.shell = body.shell || 'tmsh';
            body['partition-access'] = {
                'all-partitions': { role }
            };

            return this.core.create(userEndpoint, body);
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
 * @param {Object}  [options]                      - Options for setting a user's password
 * @param {String}  [options.enableRoot]           - If changing root's password, optionally set whether to
 *                                                   enable root user
 *
 * @returns {Promise} A promise which is resolved when the password
 *                    has been set, or rejected if an error occurs.
 */
BigIpOnboard.prototype.password = function password(user, newPassword, oldPassword, retryOptions, options) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const deferred = q.defer();
        let promise;

        this.core.ready()
            .then(() => {
                if (user === 'root') {
                    promise = this.setRootPassword(newPassword, oldPassword, options);
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
 * Sets the root password on the BIG-IP/BIG-IQ. Optionally enables the root user.
 *
 * If the oldPassword is not provided, the root password will first be set to a randomly generated
 * password, and then the newPassword value.
 *
 * @param {String} newPassword           - Password to set for root user
 * @param {String} oldPassword           - Old password for root user, if known
 * @param {Object} [options]             - Options for setting the root password
 * @param {String} [options.enableRoot]  - Enables the root user
 */
BigIpOnboard.prototype.setRootPassword = function setRootPassword(newPassword, oldPassword, options) {
    const deferred = q.defer();

    q()
        .then(() => {
            if (typeof oldPassword === 'undefined') {
                this.logger.debug('Generating random temporary password for root user');
                return forceResetUserPassword('root');
            }
            return q(oldPassword);
        })
        .then((response) => {
            this.logger.debug('Setting root password');
            return this.core.create(
                '/shared/authn/root',
                {
                    oldPassword: response,
                    newPassword
                },
                null,
                {
                    continueOnErrorMessage: 'The old password is incorrect.',
                    maxRetries: 30,
                    retryIntervalMs: 2000
                },
                { silent: true }
            );
        })
        .then(() => {
            this.rootPassword = newPassword;
            if (options && options.enableRoot) {
                this.logger.debug('Enabling root user account');

                return this.core.modify(`${SYS_DB_PATH}systemauth.disablerootlogin`,
                    { value: 'false' },
                    undefined,
                    util.SHORT_RETRY);
            }
            return q();
        })
        .then(() => {
            deferred.resolve();
        })
        .catch((err) => {
            deferred.reject(err);
        });
    return deferred.promise;
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
    const DELAY_BETWEEN_PROVISION_COMMANDS = 1000;

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

                // Get the current provisionable modules with their levels
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

                const messagesToIgnore = /(in progress)|(temporarily)|(not available)|(not registered)/;

                // create provisioning string for any module not already provisioned at the right level
                modulesToProvision.forEach((module) => {
                    if (provisionSettings[module] !== currentProvisioning[module]) {
                        provisioningCommands.push({
                            promise: this.core.modify,
                            arguments: [
                                PROVISION_PATH + module,
                                { level: provisionSettings[module] },
                                null,
                                {
                                    maxRetries: 90,
                                    retryIntervalMs: 10000,
                                    continueOnErrorMessage: messagesToIgnore
                                }
                            ]
                        });
                    }
                });
                // if provisioning, check for active after last module
                if (provisioningCommands.length > 0) {
                    provisioningCommands.push({
                        promise: this.core.active
                    });
                }

                return util.callInSerial(this.core, provisioningCommands, DELAY_BETWEEN_PROVISION_COMMANDS);
            });
    }

    return q();
};

/**
 *
 * Installs an iControl LX/iApps LX package from a given URI
 *
 * @param {String}  packageUri - URI of iControl LX/iApps LX package to install
 */
BigIpOnboard.prototype.installIlxPackage = function installIlxPackage(packageUri) {
    const fileUriRegex = /file:\/\//;
    let packageFilePath;
    // Currently only support file URI
    if (packageUri.match(fileUriRegex)) {
        packageFilePath = packageUri.replace(fileUriRegex, '');
    } else {
        return q.reject(new Error(
            `iLX package path: ${packageUri} is not a valid URI. URI must have file:// prefix.`
        ));
    }

    if (!fs.existsSync(packageFilePath)) {
        return q.reject(
            new Error(`Package does not exist at path: ${packageFilePath}`)
        );
    }
    this.logger.info(`Installing package at path: ${packageFilePath}`);
    return this.core.runTask(
        '/shared/iapp/package-management-tasks',
        {
            operation: 'INSTALL',
            packageFilePath
        },
        {
            idAttribute: 'id',
            validate: false,
            statusAttribute: 'status'
        }
    );
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
                    // Since we just reset our port, we need to update our BigIp
                    return this.core.setPort(port);
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

/**
 * Force resets a user's password, even if the oldPassword is not known.
 *
 * @param {String} user - user to reset
 *
 * @returns {Promise} A promise which is resolved when the operation is complete
 *                    or rejected if an error occurs.
 */
function forceResetUserPassword(user) {
    const deferred = q.defer();

    cryptoUtil.generateRandomBytes(24, 'hex')
        .then((randomBytes) => {
            util.runShellCommand(`echo -e "${randomBytes}\n${randomBytes}" | passwd ${user}`);
            deferred.resolve(randomBytes);
        })
        .catch((err) => {
            deferred.reject(err);
        });
    return deferred.promise;
}

module.exports = BigIpOnboard;
