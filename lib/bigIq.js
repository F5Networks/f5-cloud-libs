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
const localCryptoUtil = require('./localCryptoUtil');
const cloudProviderFactory = require('./cloudProviderFactory');
const bigIqLicenseProviderFactory = require('./bigIqLicenseProviderFactory');
const Logger = require('./logger');

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
 * @param {String}  host                        - Host to connect to.
 * @param {String}  user                        - User (with admin rights).
 * @param {String}  passwordOrUri               - Password for user or URL (file, http, https) to
 *                                              location containing password.
 * @param {Object}  [options]                   - Optional parameters.
 * @param {Boolean} [options.passwordIsUri]     - Indicates that password is a URI for the password
 * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted
 * @param {Object}  [options.bigIp]             - {@link BigIp} object. BigIp to control.
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
        .then((data) => {
            // check if password needs to be decrypted
            if (this.initOptions.passwordEncrypted) {
                return localCryptoUtil.decryptPassword(data);
            }
            return q(data);
        })
        .then((data) => {
            let password = data;
            const login = function () {
                return this.icontrol.create(
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
            // trim password once we know we have one
            password = password.trim();

            this.icontrol = this.icontrol || new IControl(
                {
                    password,
                    host: host.trim(),
                    user: user.trim(),
                    strict: false
                }
            );
            this.icontrol.authToken = null;

            this.bigIp = bigIp || {};

            // Token auth is required for BIG-IQ licensing, so get the token
            this.logger.debug('Getting BIG-IQ auth token.');
            return util.tryUntil(this, { maxRetries: 72, retryIntervalMs: 5000 }, login);
        })
        .then((response) => {
            // Don't log the response here - it has the auth token in it

            if (response && response.token && response.token.token) {
                // Setup bigIqControl with auth token
                this.icontrol.setAuthToken(response.token.token);
            } else {
                const message = 'Did not receive BIG-IQ auth token';
                this.logger.info(message);
                return q.reject(new Error(message));
            }

            this.logger.debug('Getting BIG-IQ version.');
            return this.icontrol.list(
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version'
            );
        })
        .then((response) => {
            this.logger.debug(response);
            this.version = response[0].version;
        })
        .catch((err) => {
            this.logger.info('Unable to initialize BIG-IQ', err && err.message ? err.message : err);
            return q.reject(err);
        });
};

/**
 *
 * @param {String}  poolName                - Name of the BIG-IQ pool to license from.
 * @param {String}  bigIpMgmtAddress        - Management address of BIG-IP
 * @param {String}  bigIpMgmtPort           - Management port of BIG-IP
 * @param {Object}  [options]               - Optional parameters
 * @param {String}  [options.cloud]         - Name of cloud. Only BIG-IQ 5.4+ needs this.
 *                                            Supported values are:
 *                                            aws, azure, gce, vmware, hyperv, kvm, xen
 * @param {String}  [options.skuKeyword1]   - skuKeyword1 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.skuKeyword2]   - skuKeyword2 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.unitOfMeasure] - unitOfMeasure parameter for CLPv2 licensing. Default none.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIq.prototype.licenseBigIp = function licenseBigIp(poolName, bigIpMgmtAddress, bigIpMgmtPort, options) {
    let licenseProvider;

    try {
        licenseProvider = bigIqLicenseProviderFactory.getLicenseProvider(
            this.version,
            this.bigIp,
            this.constructorOptions
        );
    } catch (err) {
        this.logger.debug(
            'Error getting BIG-IQ license provider',
            err && err.message ? err.message : err
        );
        return q.reject(err);
    }

    this.logger.debug('Getting license from provider.');
    return licenseProvider.getUnmanagedDeviceLicense(
        this.icontrol,
        poolName,
        bigIpMgmtAddress,
        bigIpMgmtPort,
        {
            cloud: options.cloud,
            skuKeyword1: options.skuKeyword1,
            skuKeyword2: options.skuKeyword2,
            unitOfMeasure: options.unitOfMeasure
        }
    );
};

/**
 * Revokes a license for a BIG-IP
 * @param {String} poolName    - The name of the license pool to revoke from
 * @param {String} instance    - {@link AutoscaleInstance} to revoke license for
 */
BigIq.prototype.revokeLicense = function revokeLicense(poolName, instance) {
    let licenseProvider;
    this.logger.silly('Revoking license for', instance);
    try {
        licenseProvider = bigIqLicenseProviderFactory.getLicenseProvider(
            this.version,
            this.bigIp,
            this.constructorOptions
        );
        this.logger.silly('Calling license provider revoke');
        return licenseProvider.revoke(this.icontrol, poolName, instance);
    } catch (err) {
        this.logger.debug('Error revoking license', err && err.message ? err.message : err);
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

module.exports = BigIq;
