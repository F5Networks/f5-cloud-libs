/**
 * Copyright 2018 F5 Networks, Inc.
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
const BigIq53LicenseProvider = require('./bigIq53LicenseProvider');

const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';
const LICENSE_TIMEOUT = { maxRetries: 40, retryIntervalMs: 5000 };

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
function BigIq54LicenseProvider(bigIp, options) {
    const injectedLogger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;

    this.constructorOptions = {};
    if (options) {
        Object.keys(options).forEach((option) => {
            this.constructorOptions[option] = options[option];
        });
    }

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
}

/**
 * Gets a license from BIG-IQ for an unmanaged BIG-IP
 *
 * @param {Object}  bigIqControl             - iControl object for BIG-IQ
 * @param {String}  poolName                 - Name of the BIG-IQ license pool to use
 * @param {String}  bigIpMgmtAddress         - IP address of BIG-IP management port.
 *                                             Unused only for display in this API. Default 192.0.2.1.
 * @param {String}  bigIpMgmtPort            - IP port of BIG-IP management port.
 *                                             Unused in this API, but here for consistency.
 * @param {Object}  options                  - Optional parameters
 * @param {String}  options.cloud            - Cloud environment. Accepted values are:
 *                                             aws, azure, gce, vmware, hyperv, kvm, xen
 * @param {String}  [options.skuKeyword1]    - skuKeyword1 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.skuKeyword2]    - skuKeyword2 parameter for CLPv2 licensing. Default none.
 * @param {String}  [options.unitOfMeasure]  - unitOfMeasure parameter for CLPv2 licensing. Default none.
 * @param {Boolean} [options.noUnreachable]  - Do not use the unreachable API even on BIG-IQs that support it.
 *
 *
 * @returns {Promise} A promise which is resolved when the BIG-IP has been licensed
 *                    or rejected if an error occurs.
 */
BigIq54LicenseProvider.prototype.getUnmanagedDeviceLicense = function getUnmanagedDeviceLicense(
    bigIqControl,
    poolName,
    bigIpMgmtAddress,
    bigIpMgmtPort,
    options
) {
    if (options && options.noUnreachable) {
        this.logger.silly('noUnreachable specified, passing off to 5.3 license API');
        const licenseProvider = new BigIq53LicenseProvider(
            this.bigIp,
            this.constructorOptions
        );
        return licenseProvider.getUnmanagedDeviceLicense(
            bigIqControl,
            poolName,
            bigIpMgmtAddress,
            bigIpMgmtPort,
            options
        );
    }

    if (!options || !options.cloud) {
        const message = 'Cloud name is required when licensing from BIG-IQ 5.4';
        this.logger.info(message);
        return q.reject(new Error(message));
    }

    this.logger.debug('Licensing from pool', poolName);
    return licenseFromPool.call(this, bigIqControl, poolName, bigIpMgmtAddress, options);
};

/**
 * Revokes a license from a BIG-IP
 *
 * @param {Object}  bigIqControl            - iControl object for BIG-IQ
 * @param {String}  poolName                - Name of the BIG-IQ license pool to use
 * @param {String}  instance                - {@link AutoscaleInstance} to revoke license for
 * @param {Object}  options                 - Optional parameters
 * @param {Boolean} [options.noUnreachable] - Do not use the unreachable API even on BIG-IQs that support it.
 *
 * @returns {Promise} A promise which is resolved when the BIG-IP license has
 *                    been revoked, or rejected if an error occurs.
 */
BigIq54LicenseProvider.prototype.revoke = function revoke(bigIqControl, poolName, instance, options) {
    if (options && options.noUnreachable) {
        this.logger.silly('noUnreachable specified, passing off to 5.3 revoke API');
        const licenseProvider = new BigIq53LicenseProvider(
            this.bigIp,
            this.constructorOptions
        );
        return licenseProvider.revoke(bigIqControl, poolName, instance, options);
    }

    return bigIqControl.create(
        LICENSE_PATH,
        {
            command: 'revoke',
            licensePoolName: poolName,
            address: instance.mgmtIp || '192.0.2.1',
            assignmentType: 'UNREACHABLE',
            macAddress: instance.macAddress
        }
    );
};

/**
 * Gets the license timeout to use
 *
 * This is here so that it can be overridden by test code
 *
 * @returns the license timeout
 */
BigIq54LicenseProvider.prototype.getLicenseTimeout = function getLicenseTimeout() {
    return LICENSE_TIMEOUT;
};

function licenseFromPool(bigIqControl, poolName, bigIpMgmtAddress, options) {
    const hypervisor = options ? options.cloud : undefined;
    const skuKeyword1 = options ? options.skuKeyword1 : undefined;
    const skuKeyword2 = options ? options.skuKeyword2 : undefined;
    const unitOfMeasure = options ? options.unitOfMeasure : undefined;

    // get our mac address
    return this.bigIp.deviceInfo()
        .then((deviceInfo) => {
            return bigIqControl.create(
                LICENSE_PATH,
                {
                    hypervisor,
                    skuKeyword1,
                    skuKeyword2,
                    unitOfMeasure,
                    command: 'assign',
                    licensePoolName: poolName,
                    address: bigIpMgmtAddress || '192.0.2.1',
                    assignmentType: 'UNREACHABLE',
                    macAddress: deviceInfo.hostMac
                }
            );
        })
        .then((response) => {
            this.logger.debug(response);

            const taskId = response.id;

            const getLicenseText = function () {
                return bigIqControl.list(LICENSE_PATH + taskId)
                    .then((taskResponse) => {
                        const status = taskResponse.status;
                        this.logger.verbose('Current licensing task status:', status);
                        if (status === 'FINISHED') {
                            return q(
                                {
                                    success: true,
                                    licenseText: taskResponse.licenseText
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

            return util.tryUntil(this, this.getLicenseTimeout(), getLicenseText)
                .then((licenseTextResponse) => {
                    if (licenseTextResponse.success && licenseTextResponse.licenseText) {
                        this.logger.silly('License text', licenseTextResponse.licenseText);
                        return this.bigIp.onboard.installLicense(licenseTextResponse.licenseText);
                    }

                    return q.reject(new Error(licenseTextResponse.errorMessage));
                })
                .catch((err) => {
                    this.logger.info('Failed to license:', err && err.message ? err.message : err);
                    return q.reject(err);
                });
        });
}

module.exports = BigIq54LicenseProvider;
