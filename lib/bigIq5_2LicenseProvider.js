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

const LICENSE_PATH = '/cm/device/licensing/pool/regkey/licenses/';

/**
 * Provides ability to get licenses from BIG-IQ 5.2.
 *
 * @class
 * @classdesc
 * Provides ability to get licenses from BIG-IQ 5.2
 *
 * @param {Object} bigIpCore               - Base BigIp object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
*/
function BigIq5_2LicenseProvider(bigIpCore, options) {
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
 * Gets a license from BIG-IQ for an unmanaged BIG-IP
 *
 * @param {Object} bigIqControl       - iControl object for BIG-IQ
 * @param {String} poolName           - Name of the BIG-IQ license pool to use
 * @param {String} bigIpMgmtAddress   - IP address of BIG-IP management port.
 * @param {String} bigIpMgmtPort      - IP port of BIG-IP management port.
 *
 * @returns {Promise} A promise which is resolved when the BIG-IP has been licensed
 *                    or rejected if an error occurs.
 */
BigIq5_2LicenseProvider.prototype.getUnmanagedDeviceLicense = function(bigIqControl, poolName, bigIpMgmtAddress, bigIpMgmtPort) {
    var poolUuid;

    this.logger.debug('Getting BIG-IP license pool UUID.');

    return bigIqControl.list(LICENSE_PATH + '?$select=id,name')
        .then(function(response) {
            this.logger.debug(response);

            var i;

            if (Array.isArray(response)) {
                for (i = 0; i < response.length; ++i) {
                    if (response[i].name === poolName) {
                        poolUuid = response[i].id;
                        break;
                    }
                }

                if (poolUuid) {
                    this.logger.debug('Got pool UUID:', poolUuid);
                    return licenseFromPool.call(this, bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid);
                }
                else {
                    return q.reject(new Error('No license pool found with name: ' + poolName));
                }
            }
            else {
                return q.reject(new Error ('Error getting license pools: ' + response));
            }
        }.bind(this));
};

var licenseFromPool = function(bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid, deferred) {
    deferred = deferred || q.defer();

    getValidRegKey.call(this, bigIqControl, poolUuid)
        .then(function(regKey) {
            if (regKey) {
                return tryRegKey.call(this, bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid, regKey);
            }
            else {
                deferred.reject(new Error('No valid reg keys found.'));
            }
        }.bind(this))
        .then(function() {
            deferred.resolve();
        }.bind(this))
        .catch(function(err) {
            this.logger.info(err);
            licenseFromPool.call(this, bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid, deferred);
        }.bind(this));

    return deferred.promise;
};

var getValidRegKey = function(bigIqControl, poolUuid) {
    this.logger.debug('Getting reg keys in pool');
    return bigIqControl.list(LICENSE_PATH + poolUuid + '/offerings')
        .then(function(response) {
            var licenses = response || [];
            var now = new Date();
            var deferred = q.defer();
            var logger = this.logger;

            var findValidLicense = function(index) {
                var license;

                if (index > licenses.length - 1) {
                    logger.info('No valid licenses available.');
                    deferred.resolve();
                }

                else {
                    license = licenses[index];
                    if (license.licenseState &&
                        license.licenseState.licenseStartDateTime &&
                        license.licenseState.licenseEndDateTime &&
                        new Date(license.licenseState.licenseStartDateTime) < now && now < new Date(license.licenseState.licenseEndDateTime)) {

                        logger.silly(license.licenseState.registrationKey, 'is active');
                        bigIqControl.list(LICENSE_PATH + poolUuid + '/offerings/' + license.licenseState.registrationKey + '/members')
                            .then(function(response) {
                                logger.silly("reg key", license.licenseState.registrationKey, "members", response);
                                if (Array.isArray(response) && response.length === 0) {
                                    logger.silly(license.licenseState.registrationKey, 'is available');
                                    deferred.resolve(license.licenseState.registrationKey);
                                }
                                else {
                                    findValidLicense(++index);
                                }
                            })
                            .catch(function(err) {
                                logger.debug('error while iterating licenses', err);
                                findValidLicense(++index);
                            });
                    }
                    else {
                        logger.debug(license.licenseState.registrationKey, 'is not active');
                        findValidLicense(++index);
                    }
                }
            };

            findValidLicense(0, deferred);

            return deferred.promise;
    }.bind(this));
};

var tryRegKey = function(bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid, regKey) {
    this.logger.info('Requesting license using', regKey);
    return bigIqControl.create(
        LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
        {
            deviceAddress: bigIpMgmtAddress + ':' + bigIpMgmtPort,
            username: this.core.user,
            password: this.core.password
        }
    )
    .then(function(response) {
        this.logger.debug(response);

        var status;
        var memberId;
        var logger = this.logger;

        var isLicensed = function() {
            return bigIqControl.list(LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId)
                .then(function(response) {
                    status = response.status;
                    logger.verbose('Current licensing status:', status);
                    if (status === 'LICENSED') {
                        return q();
                    }
                    else {
                        return q.reject();
                    }
                });
        };

        if (response) {
            status = response.status;
            memberId = response.id;
            this.logger.debug('Current licensing state:', status);
            this.logger.silly('Member UUID:', memberId);

            if (status === 'LICENSED') {
                return q();
            }
            else {
                this.logger.verbose('Waiting to be LICENSED.');
                util.tryUntil(this, {maxRetries: 40, retryIntervalMs: 5000}, isLicensed)
                    .then(function() {
                        this.logger.info("Successfully licensed");
                        return q();
                    }.bind(this))
                    .catch(function(err) {
                        this.logger.info("Failed to license", err);
                        return q.reject(new Error('Giving up on licensing via BIG-IQ.'));
                    }.bind(this));
            }

        }
    }.bind(this));
};

module.exports = BigIq5_2LicenseProvider;
