/**
 * Copyright 2017-2018 F5 Networks, Inc.
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
const IControl = require('./iControl');
const util = require('./util');
const cloudProviderFactory = require('./cloudProviderFactory');
const Logger = require('./logger');
const BigIq50LicenseProvider = require('./bigIq50LicenseProvider');
const BigIq52LicenseProvider = require('./bigIq52LicenseProvider');
const BigIq53LicenseProvider = require('./bigIq53LicenseProvider');

let icontrol;

/**
 * BigIq constructor
 *
 * @class
 * @classdesc
 * Provides core functionality (CRUD operations, ready, etc) and maintains
 * references to other modules in f5-cloud-libs.
 *
 * After creating a BigIq with this constructor, you must call the
 * async init() method.
 *
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function BigIq(options) {
    const logger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;

    this.constructorOptions = {};
    if (options) {
        Object.keys(options).forEach((option) => {
            this.constructorOptions[option] = options[option];
        });
    }

    if (logger) {
        this.logger = logger;
        util.setLogger(logger);
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        util.setLoggerOptions(loggerOptions);
    }
}

/**
 * Initialize this instance w/ host user password
 *
 * @param {String}  host                    - Host to connect to.
 * @param {String}  user                    - User (with admin rights).
 * @param {String}  passwordOrUri           - Password for user or URL (file, http, https) to
 *                                            location containing password.
 * @param {Object}  [options]               - Optional parameters.
 * @param {Boolean} [options.passwordIsUri] - Indicates that password is a URI for the password
 * @param {Object}  [options.bigIp]         - {@link BigIp} object. BigIp to control.
 *
 * @returns {Promise} A promise which is resolved when initialization is complete
 *                    or rejected if an error occurs.
 */
BigIq.prototype.init = function init(host, user, passwordOrUri, options) {
    this.initOptions = options || {};
    this.host = host.trim();
    this.user = user.trim();

    const bigIp = options ? options.bigIp : undefined;

    return getActualPassword.call(this, passwordOrUri, this.initOptions, this.constructorOptions)
        .then((password) => {
            const login = function () {
                return icontrol.create(
                    '/shared/authn/login',
                    {
                        password,
                        username: user,
                    }
                );
            };

            if (!password) {
                return q.reject(new Error('Failed to retrieve actual password'));
            }

            icontrol = this.icontrol || new IControl(
                {
                    host: host.trim(),
                    user: user.trim(),
                    password: password.trim(),
                    strict: false
                }
            );

            this.bigIp = bigIp || {};

            // Token auth is required for BIG-IQ licensing, so get the token
            this.logger.debug('Getting BIG-IQ auth token.');
            return util.tryUntil(this, { maxRetries: 72, retryIntervalMs: 5000 }, login);
        })
        .then((response) => {
            // Don't log the response here - it has the auth token in it

            // Setup bigIqControl with auth token
            icontrol = this.icontrol || new IControl(
                {
                    host,
                    authToken: response.token.token,
                    strict: false
                }
            );

            this.logger.debug('Getting BIG-IQ version.');
            return icontrol.list(
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version'
            );
        })
        .then((response) => {
            this.logger.debug(response);
            this.version = response[0].version;
        })
        .catch((err) => {
            return q.reject(err);
        });
};

/**
 * Revokes a license for a BIG-IP
 * @param {String} poolName         - The name of the license pool to revoke from
 * @param {String} bigIpHostname    - Hostname of the BIG-IP to revoke the license from
 */
BigIq.prototype.revokeLicense = function revokeLicense(poolName, bigIpHostname) {
    let licenseProvider;
    try {
        licenseProvider = getLicenseProvider.call(this, this.version);
        return licenseProvider.revoke(icontrol, poolName, bigIpHostname);
    } catch (err) {
        return q.reject(err);
    }
};

function getActualPassword(passwordOrUri, initOptions, constructorOptions) {
    const deferred = q.defer();

    if (initOptions.passwordIsUri) {
        if (passwordOrUri.startsWith('arn')) {
            // AWS arn
            // this.provider can be injected by test code
            if (!this.provider) {
                this.provider = cloudProviderFactory.getCloudProvider('aws', constructorOptions);
            }

            this.provider.init()
                .then(() => {
                    return this.provider.getDataFromUri(passwordOrUri);
                })
                .then((data) => {
                    deferred.resolve(data);
                })
                .catch((err) => {
                    deferred.reject(err);
                });
        } else {
            // Plain old url
            util.getDataFromUrl(passwordOrUri)
                .then((data) => {
                    deferred.resolve(data);
                })
                .catch((err) => {
                    deferred.reject(err);
                });
        }
    } else {
        // Plain old password
        deferred.resolve(passwordOrUri);
    }

    return deferred.promise;
}

function getLicenseProvider(version) {
    if (util.versionCompare(version, '5.0.0') < 0) {
        throw new Error('Licensing via BIG-IQ is only supported on BIG-IQ versions 5.0.x and greater');
    }

    if (util.versionCompare(version, '5.0.0') >= 0 && util.versionCompare(version, '5.2.0') < 0) {
        return new BigIq50LicenseProvider(this.bigIp, this.options);
    } else if (util.versionCompare(version, '5.2.0') >= 0 && util.versionCompare(version, '5.3.0') < 0) {
        return new BigIq52LicenseProvider(this.bigIp, this.options);
    }
    return new BigIq53LicenseProvider(this.bigIp, this.options);
}

module.exports = BigIq;
