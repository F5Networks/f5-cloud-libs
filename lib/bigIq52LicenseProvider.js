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
const Logger = require('./logger');

const LICENSE_PATH = '/cm/device/licensing/pool/regkey/licenses/';
const LICENSE_TIMEOUT = { maxRetries: 40, retryIntervalMs: 5000 };

let logger;

/**
 * BigIq 5.2 license provider constructor
 *
 * @class
 * @classdesc
 * Provides ability to get licenses from BIG-IQ 5.2 (and compatible versions).
 *
 * @param {Object} bigIp                   - Base {@link BigIp} object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function BigIq52LicenseProvider(bigIp, options) {
    const injectedLogger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;

    if (injectedLogger) {
        this.logger = injectedLogger;
        util.setLogger(injectedLogger);
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        util.setLoggerOptions(loggerOptions);
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
BigIq52LicenseProvider.prototype.getUnmanagedDeviceLicense = function getUnmanagedDeviceLicense(
    bigIqControl,
    poolName,
    bigIpMgmtAddress,
    bigIpMgmtPort
) {
    this.logger.debug('Getting BIG-IP license pool UUID.');

    return getPoolUuid(bigIqControl, poolName)
        .then((poolUuid) => {
            this.logger.debug('Got pool UUID:', poolUuid);
            return util.tryUntil(
                this,
                util.MEDIUM_RETRY,
                licenseFromPool,
                [
                    bigIqControl,
                    bigIpMgmtAddress,
                    bigIpMgmtPort,
                    poolUuid
                ]
            );
        })
        .catch((err) => {
            this.logger.warn(err);
            return q.reject(err);
        });
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
BigIq52LicenseProvider.prototype.revoke = function revoke(bigIqControl, poolName, bigIpHostname) {
    let poolUuid;

    return getPoolUuid(bigIqControl, poolName)
        .then((uuid) => {
            poolUuid = uuid;
            return getLicensesInPool(bigIqControl, poolUuid);
        })
        .then((licensesInPool) => {
            const deferred = q.defer();
            let licenses;

            if (!licensesInPool) {
                licenses = [];
            } else if (!Array.isArray(licensesInPool)) {
                licenses = [licensesInPool];
            } else {
                licenses = licensesInPool.slice();
            }

            const findRegKeyForHostname = function (index) {
                let currentIndex = index;
                let license;

                if (currentIndex > licenses.length - 1) {
                    logger.info('License for host not found.');
                    deferred.reject(new Error('License for host not found.'));
                } else {
                    license = licenses[currentIndex];
                    if (license.licenseState) {
                        getMembersForKey(bigIqControl, poolUuid, license.licenseState.registrationKey)
                            .then((membersForKey) => {
                                let found = false;
                                let members;

                                if (!membersForKey) {
                                    members = [];
                                } else if (!Array.isArray(membersForKey)) {
                                    members = [membersForKey];
                                } else {
                                    members = membersForKey.slice();
                                }

                                logger.silly(
                                    'reg key members',
                                    license.licenseState.registrationKey,
                                    'members',
                                    members
                                );

                                for (let i = 0; i < members.length; i++) {
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
                                    currentIndex += 1;
                                    findRegKeyForHostname(currentIndex);
                                }
                            })
                            .catch((err) => {
                                logger.debug('error while iterating licenses', err);
                                currentIndex += 1;
                                findRegKeyForHostname(currentIndex);
                            });
                    }
                }
            };

            findRegKeyForHostname(0);

            return deferred.promise;
        })
        .then((regKeyMember) => {
            if (regKeyMember) {
                // If we have the password, use it. Otherwise, use dummy values. This still makes
                // the license available on BIG-IQ, but does not inform the BIG-IP (it's likely down anyway)
                const body = {
                    username: this.bigIp.user || 'dummyUser',
                    password: this.bigIp.password || 'dummyPassword',
                    id: regKeyMember.member.id
                };

                return bigIqControl.delete(
                    // eslint-disable-next-line max-len
                    `${LICENSE_PATH}${poolUuid}/offerings/${regKeyMember.regKey}/members/${regKeyMember.member.id}`,
                    body
                );
            }
            return q();
        });
};

/**
 * Gets the license timeout to use
 *
 * This is here so that it can be overridden by test code
 *
 * @returns the license timeout
 */
BigIq52LicenseProvider.prototype.getLicenseTimeout = function getLicenseTimeout() {
    return LICENSE_TIMEOUT;
};

function licenseFromPool(bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid) {
    const deferred = q.defer();

    getValidRegKey.call(this, bigIqControl, poolUuid)
        .then((regKey) => { // eslint-disable-line consistent-return
            if (regKey) {
                return tryRegKey.call(this, bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid, regKey);
            }
            deferred.reject(new Error('No valid reg keys found.'));
        })
        .then(() => {
            deferred.resolve();
        })
        .catch((err) => {
            this.logger.info(err);
            deferred.reject(err);
        });

    return deferred.promise;
}

function getPoolUuid(bigIqControl, poolName) {
    let poolUuid;

    return bigIqControl.list(`${LICENSE_PATH}?$select=id,name`)
        .then((poolResponse) => {
            let pools;

            if (!poolResponse) {
                pools = [];
            } else if (!Array.isArray(poolResponse)) {
                pools = [poolResponse];
            } else {
                pools = poolResponse.slice();
            }

            for (let i = 0; i < pools.length; i++) {
                if (pools[i].name === poolName) {
                    poolUuid = pools[i].id;
                    break;
                }
            }

            if (poolUuid) {
                return poolUuid;
            }
            return q.reject(new Error(`No license pool found with name: ${poolName}`));
        });
}

function getValidRegKey(bigIqControl, poolUuid) {
    this.logger.debug('Getting reg keys in pool');
    return getLicensesInPool(bigIqControl, poolUuid)
        .then((licensesResponse) => {
            const now = new Date();
            const deferred = q.defer();

            let licenses;

            if (!licensesResponse) {
                licenses = [];
            } else if (!Array.isArray(licensesResponse)) {
                licenses = [licensesResponse];
            } else {
                licenses = licensesResponse.slice();
            }

            const findValidLicense = function (index) {
                let currentIndex = index;

                let license;

                if (index > licenses.length - 1) {
                    logger.info('No valid licenses available.');
                    deferred.resolve();
                } else {
                    license = licenses[currentIndex];
                    if (
                        license.licenseState &&
                        license.licenseState.licenseStartDateTime &&
                        license.licenseState.licenseEndDateTime &&
                        new Date(license.licenseState.licenseStartDateTime) < now &&
                        now < new Date(license.licenseState.licenseEndDateTime)
                    ) {
                        logger.silly(license.licenseState.registrationKey, 'is active');
                        getMembersForKey(bigIqControl, poolUuid, license.licenseState.registrationKey)
                            .then((response) => {
                                logger.silly(
                                    'reg key',
                                    license.licenseState.registrationKey,
                                    'members',
                                    response
                                );

                                if (Array.isArray(response) && response.length === 0) {
                                    logger.silly(license.licenseState.registrationKey, 'is available');
                                    deferred.resolve(license.licenseState.registrationKey);
                                } else {
                                    currentIndex += 1;
                                    findValidLicense(currentIndex);
                                }
                            })
                            .catch((err) => {
                                logger.debug('error while iterating licenses', err);
                                currentIndex += 1;
                                findValidLicense(currentIndex);
                            });
                    } else {
                        logger.debug(license.licenseState.registrationKey, 'is not active');
                        currentIndex += 1;
                        findValidLicense(currentIndex);
                    }
                }
            };

            findValidLicense(0);

            return deferred.promise;
        });
}

function getLicensesInPool(bigIqControl, poolUuid) {
    return bigIqControl.list(`${LICENSE_PATH}${poolUuid}/offerings?$select=licenseState`);
}

function getMembersForKey(bigIqControl, poolUuid, regKey) {
    return bigIqControl.list(`${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`);
}

function tryRegKey(bigIqControl, bigIpMgmtAddress, bigIpMgmtPort, poolUuid, regKey) {
    this.logger.info('Requesting license using', regKey);
    return bigIqControl.create(
        `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
        {
            deviceAddress: `${bigIpMgmtAddress}:${bigIpMgmtPort}`,
            username: this.bigIp.user,
            password: this.bigIp.password
        }
    )
        .then((response) => {
            this.logger.debug(response);

            let status;
            let memberId;

            const isLicensed = function () {
                return bigIqControl.list(`${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members/${memberId}`)
                    .then((membersResponse) => {
                        status = membersResponse.status;
                        logger.verbose('Current licensing status:', status);
                        if (status === 'LICENSED') {
                            return q();
                        }

                        return q.reject();
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

                this.logger.verbose('Waiting to be LICENSED.');
                return util.tryUntil(this, this.getLicenseTimeout(), isLicensed)
                    .then(() => {
                        this.logger.info('Successfully licensed');
                        return q();
                    })
                    .catch((err) => {
                        this.logger.info('Failed to license', err);
                        return q.reject(new Error('Giving up on licensing via BIG-IQ.'));
                    });
            }

            return q.reject(new Error('No resposnse for pool/offerings/key/members'));
        });
}

module.exports = BigIq52LicenseProvider;
