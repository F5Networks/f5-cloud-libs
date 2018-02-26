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

const LICENSE_PATH = '/cm/shared/licensing/pools/';
const LICENSE_TIMEOUT = { maxRetries: 40, retryIntervalMs: 5000 };

let logger;

/**
 * BigIq 5.0 license provider constructor
 *
 * @class
 * @classdesc
 * Provides ability to get licenses from BIG-IQ 5.0 (and compatible versions).
 *
 * @param {Object} bigIp                   - Base {@link BigIp} object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
*/
function BigIq50LicenseProvider(bigIp, options) {
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
BigIq50LicenseProvider.prototype.getUnmanagedDeviceLicense = function getUnmanagedDeviceLicense(
    bigIqControl,
    poolName,
    bigIpMgmtAddress,
    bigIpMgmtPort
) {
    let poolUuid;

    this.logger.debug('Getting BIG-IP license pool UUID.');
    return getPoolUuid(bigIqControl, poolName)
        .then((response) => {
            poolUuid = response;
            logger.silly('Got pool UUID:', poolUuid);

            this.logger.debug('Requesting license from BIG-IQ license pool.');
            return bigIqControl.create(
                `${LICENSE_PATH}${poolUuid}/members`,
                {
                    deviceAddress: `${bigIpMgmtAddress}:${bigIpMgmtPort}`,
                    username: this.bigIp.user,
                    password: this.bigIp.password
                }
            );
        })
        .then((response) => {
            this.logger.debug(response);

            let licenseUuid;

            const isLicensed = function () {
                const deferred = q.defer();

                bigIqControl.list(`${LICENSE_PATH}${poolUuid}/members/${licenseUuid}`)
                    .then((licenseUuidRespnse) => {
                        const state = licenseUuidRespnse.state;
                        this.logger.verbose('Current licensing state:', state);
                        if (state === 'LICENSED') {
                            deferred.resolve();
                        } else {
                            deferred.reject();
                        }
                    });

                return deferred.promise;
            };

            if (response) {
                const state = response.state;
                licenseUuid = response.uuid;
                this.logger.verbose('Current licensing state:', state);
                this.logger.debug('License UUID:', licenseUuid);

                if (state === 'LICENSED') {
                    return q();
                }
                this.logger.verbose('Waiting to be LICENSED.');
                return util.tryUntil(this, this.getLicenseTimeout(), isLicensed)
                    .then(() => {
                        return q();
                    })
                    .catch(() => {
                        return q.reject(new Error('Giving up on licensing via BIG-IQ.'));
                    });
            }

            return q();
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
BigIq50LicenseProvider.prototype.revoke = function revoke(bigIqControl, poolName, bigIpHostname) {
    let poolUuid;

    this.logger.debug('Getting BIG-IP license pool UUID.');
    return getPoolUuid(bigIqControl, poolName)
        .then((response) => {
            poolUuid = response;
            this.logger.debug('Getting licenses in pool');
            return bigIqControl.list(`${LICENSE_PATH}${poolUuid}/members/`);
        })
        .then((response) => {
            const licenses = response || [];
            let license;

            for (let i = 0; i < licenses.length; i++) {
                if (licenses[i].deviceName && licenses[i].deviceName === bigIpHostname) {
                    license = licenses[i];
                    break;
                }
            }

            if (license) {
                return bigIqControl.delete(
                    `${LICENSE_PATH}${poolUuid}/members/${license.uuid}`,
                    {
                        username: this.bigIp.user || 'dummyUser',
                        password: this.bigIp.password || 'dummyPassword',
                        uuid: license.uuid
                    }
                );
            }

            return q.reject(new Error('no license found for host:', bigIpHostname));
        });
};

/**
 * Gets the license timeout to use
 *
 * This is here so that it can be overridden by test code
 *
 * @returns the license timeout
 */
BigIq50LicenseProvider.prototype.getLicenseTimeout = function getLicenseTimeout() {
    return LICENSE_TIMEOUT;
};

function getPoolUuid(bigIqControl, poolName) {
    return bigIqControl.list(`${LICENSE_PATH}?$select=uuid,name`)
        .then((response) => {
            logger.debug(response);

            let poolUuid;

            if (Array.isArray(response)) {
                for (let i = 0; i < response.length; i++) {
                    if (response[i].name === poolName) {
                        poolUuid = response[i].uuid;
                        break;
                    }
                }

                if (poolUuid) {
                    return poolUuid;
                }
                return q.reject(new Error(`No license pool found with name: ${poolName}`));
            }

            return q.reject(new Error(`Error getting license pools: ${response}`));
        });
}

module.exports = BigIq50LicenseProvider;
