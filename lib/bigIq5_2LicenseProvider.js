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
var logger;

const LICENSE_PATH = '/cm/device/licensing/pool/regkey/licenses/';

/**
 * Provides ability to get licenses from BIG-IQ 5.2.
 *
 * @class
 * @classdesc
 * Provides ability to get licenses from BIG-IQ 5.2
 *
 * @param {Object} bigIp                   - Base {@link BigIp} object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
 */
function BigIq5_2LicenseProvider(bigIp, options) {
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

    logger = this.logger;
    this.bigIp = bigIp;
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
    this.logger.debug('Getting BIG-IP license pool UUID.');

    return getPoolUuid(bigIqControl, poolName)
        .then(function(poolUuid) {
            if (poolUuid) {
                this.logger.debug('Got pool UUID:', poolUuid);
                return licenseFromPool.call(this, bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid);
            }
            else {
                return q.reject(new Error('No pool uuid found for: ' + poolName));
            }
        }.bind(this))
        .catch(function(err) {
            this.logger.warn(err);
            return q.reject(err);
        }.bind(this));
};

/**
 * Revokes a license from a BIG-IP
 *
 * @param {Object} bigIqControl     - iControl object for BIG-IQ
 * @param {String} poolName         - Name of the BIG-IQ license pool to use
 * @param {String} bigIpHostname    - Hostname of the BIG-IP to revoke the license from
 *
 * @returns {Promise} A promise which is resolved when the BIG-IP license has
 *                    been revoked, or rejected if an error occurs.
 */
BigIq5_2LicenseProvider.prototype.revoke = function(bigIqControl, poolName, bigIpHostname) {

    var poolUuid;

    return getPoolUuid(bigIqControl, poolName)
        .then(function(uuid) {
            poolUuid = uuid;
            return getLicensesInPool(bigIqControl, poolUuid);
        })
        .then(function(licenses) {
            var deferred = q.defer();

            licenses = licenses || [];

            var findRegKeyForHostname = function(index) {
                var license;

                if (index > licenses.length - 1) {
                    logger.info('License for host not found.');
                    deferred.resolve();
                }

                else {
                    license = licenses[index];
                    if (license.licenseState) {
                        getMembersForKey(bigIqControl, poolUuid, license.licenseState.registrationKey)
                            .then(function(members) {
                                var found = false;
                                var i;

                                members = members || [];
                                if (!Array.isArray(members)) {
                                    members = [members];
                                }

                                logger.silly("reg key members", license.licenseState.registrationKey, "members", members);
                                for (i = 0; i < members.length; ++i) {
                                    if (members[i].deviceName === bigIpHostname) {
                                        found = true;
                                        deferred.resolve(
                                            {
                                                regKey: license.licenseState.registrationKey,
                                                member: members[i]
                                            }
                                        );
                                    }
                                }

                                if (!found) {
                                    findRegKeyForHostname(++index);
                                }
                            })
                            .catch(function(err) {
                                logger.debug('error while iterating licenses', err);
                                findRegKeyForHostname(++index);
                            });
                    }
                }
            };

            findRegKeyForHostname(0);

            return deferred.promise;
        })
        .then(function(regKeyMember) {
            if (regKeyMember) {
                // If we have the password, use it. Otherwise, use dummy values. This still makes
                // the license available on BIG-IQ, but does not inform the BIG-IP (it's likely down anyway)
                var body = {
                    username: this.bigIp.user || 'dummyUser',
                    password: this.bigIp.password || 'dummyPassword',
                    id: regKeyMember.member.id
                };

                return bigIqControl.delete(
                    LICENSE_PATH + poolUuid + '/offerings/' + regKeyMember.regKey + '/members/' + regKeyMember.member.id,
                    body
                );
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

var getPoolUuid = function(bigIqControl, poolName) {
    var poolUuid;

    return bigIqControl.list(LICENSE_PATH + '?$select=id,name')
        .then(function(response) {
            var i;

            response = response || [];
            if (!Array.isArray(response)) {
                response = [response];
            }

            for (i = 0; i < response.length; ++i) {
                if (response[i].name === poolName) {
                    poolUuid = response[i].id;
                    break;
                }
            }

            if (poolUuid) {
                return poolUuid;
            }
            else {
                return q.reject(new Error('No license pool found with name: ' + poolName));
            }
        });
};

var getValidRegKey = function(bigIqControl, poolUuid) {
    this.logger.debug('Getting reg keys in pool');
    return getLicensesInPool(bigIqControl, poolUuid)
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
                        getMembersForKey(bigIqControl, poolUuid, license.licenseState.registrationKey)
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

            findValidLicense(0);

            return deferred.promise;
        }.bind(this));
};

var getLicensesInPool = function(bigIqControl, poolUuid) {
    return bigIqControl.list(LICENSE_PATH + poolUuid + '/offerings?$select=licenseState');
};

var getMembersForKey = function(bigIqControl, poolUuid, regKey) {
    return bigIqControl.list(LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members');
};

var tryRegKey = function(bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid, regKey) {
    this.logger.info('Requesting license using', regKey);
    return bigIqControl.create(
        LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
        {
            deviceAddress: bigIpMgmtAddress + ':' + bigIpMgmtPort,
            username: this.bigIp.user,
            password: this.bigIp.password
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
