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
const util = require('./util');
const authn = require('./authn');
const sharedConstants = require('./sharedConstants');
const bigIqLicenseProviderFactory = require('./bigIqLicenseProviderFactory');
const Logger = require('./logger');
const PRODUCTS = require('./sharedConstants').PRODUCTS;

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
 * @param {String}  passwordOrUri               - Password for user or URL (file, http, https, arn) to
 *                                                location containing password.
 * @param {Object}  [options]                   - Optional parameters.
 * @param {Boolean} [options.passwordIsUri]     - Indicates that password is a URI for the password
 * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted
 * @param {Object}  [options.bigIp]             - {@link BigIp} object. BigIp to control.
 *
 * @returns {Promise} A promise which is resolved when initialization is complete
 *                    or rejected if an error occurs.
 */
BigIq.prototype.init = function init(host, user, passwordOrUri, options) {
    this.initOptions = {};
    Object.assign(this.initOptions, options);

    this.host = host.trim();
    this.user = user.trim();

    this.bigIp = options ? options.bigIp || {} : {};

    const authnOptions = {
        product: PRODUCTS.BIGIQ,
        passwordIsUri: this.initOptions.passwordIsUri,
        passwordEncrypted: this.initOptions.passwordEncrypted
    };

    return authn.authenticate(this.host, this.user, passwordOrUri, authnOptions)
        .then((icontrol) => {
            this.icontrol = icontrol;
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
 * Licenses a BIG-IP from a license pool
 *
 * @param {String}  poolName                 - Name of the BIG-IQ pool to license from.
 * @param {String}  bigIpMgmtAddress         - Management address of BIG-IP
 * @param {String}  bigIpMgmtPort            - Management port of BIG-IP
 * @param {Object}  [options]                - Optional parameters
 * @param {String}  [options.cloud]          - Name of cloud. Only BIG-IQ 5.4+ needs this.
 *                                             Supported values are:
 *                                             aws, azure, gce, vmware, hyperv, kvm, xen
 * @param {String}  [options.skuKeyword1]    - skuKeyword1 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.skuKeyword2]    - skuKeyword2 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.unitOfMeasure]  - unitOfMeasure parameter for CLPv2 licensing. Default none.
 * @param {Boolean} [options.noUnreachable]  - Do not use the unreachable API even on BIG-IQs that support it.
 * @param {Boolean} [options.autoApiType]    - Automatically determine API type rather than basing on BIG-IQ
 *                                             version.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIq.prototype.licenseBigIp = function licenseBigIp(poolName, bigIpMgmtAddress, bigIpMgmtPort, options) {
    const methodOptions = {};
    Object.assign(methodOptions, options);

    this.logger.debug('Getting license provider');
    return getLicenseProvider.call(this, poolName, methodOptions)
        .then((licenseProvider) => {
            this.logger.debug('Getting license from provider.');
            return licenseProvider.getUnmanagedDeviceLicense(
                this.icontrol,
                poolName,
                bigIpMgmtAddress,
                bigIpMgmtPort,
                {
                    cloud: methodOptions.cloud,
                    skuKeyword1: methodOptions.skuKeyword1,
                    skuKeyword2: methodOptions.skuKeyword2,
                    unitOfMeasure: methodOptions.unitOfMeasure,
                    noUnreachable: methodOptions.noUnreachable
                }
            );
        });
};

/**
 * Revokes a license for a BIG-IP
 *
 * @param {String}  poolName                 - The name of the license pool to revoke from
 * @param {String}  instance                 - {@link AutoscaleInstance} to revoke license for
 * @param {Object}  [options]                - Optional parameters
 * @param {Boolean} [options.noUnreachable]  - Do not use the unreachable API even on BIG-IQs that support it.
 */
BigIq.prototype.revokeLicense = function revokeLicense(poolName, instance, options) {
    let licenseProvider;
    this.logger.silly('Revoking license for', instance);
    try {
        licenseProvider = bigIqLicenseProviderFactory.getLicenseProviderByVersion(
            this.version,
            this.bigIp,
            this.constructorOptions
        );
        this.logger.silly('Calling license provider revoke');
        return licenseProvider.revoke(this.icontrol, poolName, instance, options);
    } catch (err) {
        this.logger.debug('Error revoking license', err && err.message ? err.message : err);
        return q.reject(err);
    }
};

/**
 * Gets a license provider based on api type or version
 * @param {String} poolName                 - The name of the license pool
 * @param {Object} options                  - Options
 * @param {Boolean} options.autoApiType     - Automatically determine API type rather
 *                                            than basing on BIG-IQ version.
 * @param {Boolean} [options.noUnreachable] - Do not use the unreachable API even on BIG-IQs that support it.
 */
function getLicenseProvider(poolName, options) {
    const methodOptions = {};
    Object.assign(methodOptions, options);
    const factoryOptions = {};
    Object.assign(factoryOptions, this.constructorOptions);

    let licenseProvider;

    if (methodOptions.autoApiType) {
        return getApiType.call(this, poolName, methodOptions)
            .then((apiType) => {
                // Even though the main API by type is the same across BIG-IQ versions,
                // there are some subtle differences the implementations need to know
                // about
                factoryOptions.version = this.version;
                try {
                    licenseProvider = bigIqLicenseProviderFactory.getLicenseProviderByType(
                        apiType,
                        this.bigIp,
                        factoryOptions
                    );
                    return q(licenseProvider);
                } catch (err) {
                    this.logger.info(
                        'Error getting license provider by type', err && err.message ? err.message : err
                    );
                    return q.reject(err);
                }
            })
            .catch((err) => {
                this.logger.info('Error getting api type', err && err.message ? err.message : err);
                return q.reject(err);
            });
    }

    try {
        licenseProvider = bigIqLicenseProviderFactory.getLicenseProviderByVersion(
            this.version,
            this.bigIp,
            factoryOptions
        );

        return q(licenseProvider);
    } catch (err) {
        this.logger.info(
            'Error getting license provider by type', err && err.message ? err.message : err
        );
        return q.reject(err);
    }
}

function getApiType(poolName, options) {
    const deferred = q.defer();

    // Check all the pools until we find a name match
    // check purchased pools
    let apiType;
    this.icontrol.list('/cm/device/licensing/pool/purchased-pool/licenses?$select=name')
        .then((results) => {
            if (containsPool(results, poolName)) {
                if (options.noUnreachable) {
                    apiType = sharedConstants.LICENSE_API_TYPES.UTILITY;
                } else {
                    apiType = sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE;
                }
                return q();
            }

            // not found - check utility pools
            return this.icontrol.list('/cm/device/licensing/pool/utility/licenses?$select=name');
        })
        .then((results) => {
            if (!apiType) {
                if (containsPool(results, poolName)) {
                    if (options.noUnreachable) {
                        apiType = sharedConstants.LICENSE_API_TYPES.UTILITY;
                    } else {
                        apiType = sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE;
                    }
                    return q();
                }
                // not found - check reg key pools
                return this.icontrol.list('/cm/device/licensing/pool/regkey/licenses?$select=name');
            }
            return q();
        })
        .then((results) => {
            if (!apiType) {
                if (containsPool(results, poolName)) {
                    apiType = sharedConstants.LICENSE_API_TYPES.REG_KEY;
                }
            }
            return q();
        })
        .then(() => {
            if (apiType) {
                this.logger.silly(`using api type ${apiType}`);
                deferred.resolve(apiType);
            } else {
                const message = `pool ${poolName} not found`;
                this.logger.info(message);
                deferred.reject(new Error(message));
            }
        })
        .catch((err) => {
            this.logger.debug('Error getting API type', err && err.message ? err.message : err);
            deferred.reject(err);
        });

    return deferred.promise;
}

function containsPool(pools, poolName) {
    for (let i = 0; i < pools.length; i++) {
        if (pools[i].name === poolName) {
            return true;
        }
    }
    return false;
}

module.exports = BigIq;
