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
const BigIq52LicenseProvider = require('./bigIq52LicenseProvider');

const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';
const LICENSE_TIMEOUT = { maxRetries: 40, retryIntervalMs: 5000 };
const ALREADY_LICENSED_LIMIT = 5;

let alreadyLicensedCount = 0;

let bigIq52LicenseProvider;

/**
 * BigIq 5.3 license provider constructor
 *
 * @class
 * @classdesc
 * Provides ability to get licenses from BIG-IQ 5.3 (and compatible versions).
 *
 * @param {Object} bigIp                   - Base {@link BigIp} object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
*/
function BigIq53LicenseProvider(bigIp, options) {
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

    this.bigIp = bigIp;

    // Use this for backwards compatible APIs
    bigIq52LicenseProvider = new BigIq52LicenseProvider(bigIp, options);
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
BigIq53LicenseProvider.prototype.getUnmanagedDeviceLicense = function getUnmanagedDeviceLicense(
    bigIqControl,
    poolName,
    bigIpMgmtAddress,
    bigIpMgmtPort
) {
    this.logger.debug('Licensing from pool', poolName);
    return licenseFromPool.call(this, bigIqControl, poolName, bigIpMgmtAddress, bigIpMgmtPort);
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
BigIq53LicenseProvider.prototype.revoke = function revoke(bigIqControl, poolName, bigIpHostname) {
    return bigIq52LicenseProvider.revoke(bigIqControl, poolName, bigIpHostname);
};

/**
 * Gets the license timeout to use
 *
 * This is here so that it can be overridden by test code
 *
 * @returns the license timeout
 */
BigIq53LicenseProvider.prototype.getLicenseTimeout = function getLicenseTimeout() {
    return LICENSE_TIMEOUT;
};

function licenseFromPool(bigIqControl, poolName, bigIpMgmtAddress, bigIpMgmtPort) {
    return bigIqControl.create(
        LICENSE_PATH,
        {
            command: 'assign',
            licensePoolName: poolName,
            address: bigIpMgmtAddress,
            port: bigIpMgmtPort,
            user: this.bigIp.user,
            password: this.bigIp.password
        }
    )
        .then((response) => {
            this.logger.debug(response);

            const taskId = response.id;

            const isLicensed = function () {
                return bigIqControl.list(LICENSE_PATH + taskId)
                    .then((taskResponse) => {
                        const status = taskResponse.status;
                        this.logger.verbose('Current licensing task status:', status);
                        if (status === 'FINISHED') {
                            return q(
                                {
                                    success: true
                                }
                            );
                        } else if (status === 'FAILED') {
                            return q(
                                {
                                    success: false,
                                    errorMessage: taskResponse.errorMessage
                                }
                            );
                        }
                        return q.reject();
                    });
            };

            return util.tryUntil(this, this.getLicenseTimeout(), isLicensed)
                .then((isLicensedResponse) => {
                    if (isLicensedResponse.success) {
                        this.logger.info('Successfully licensed');
                        return q();
                    }

                    this.logger.info('Licensing failed', isLicensedResponse.errorMessage);

                    // If we run into the race condition of 2 BIG-IPs trying to license at the
                    // same time, try a different license
                    if (isLicensedResponse.errorMessage.indexOf('already been granted to a BIG-IP') !== -1) {
                        alreadyLicensedCount += 1;
                        if (alreadyLicensedCount <= ALREADY_LICENSED_LIMIT) {
                            this.logger.debug('Got a license that is already in use. Retrying.');
                            return licenseFromPool.call(
                                this,
                                bigIqControl,
                                poolName,
                                bigIpMgmtAddress,
                                bigIpMgmtPort
                            );
                        }

                        return q.reject();
                    }

                    return q.reject(new Error(isLicensedResponse.errorMessage));
                })
                .catch((err) => {
                    this.logger.info('Failed to license', err);
                    return q.reject(new Error('Giving up on licensing via BIG-IQ.'));
                });
        });
}

module.exports = BigIq53LicenseProvider;
