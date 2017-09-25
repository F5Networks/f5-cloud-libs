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
var BigIq5_2LicenseProvider = require('./bigIq5_2LicenseProvider');
var bigIq5_2LicenseProvider;

const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';

/**
 * Provides ability to get licenses from BIG-IQ 5.3 (and compatible versions).
 *
 * @class
 * @classdesc
 * Provides ability to get licenses from BIG-IQ 5.3+
 *
 * @param {Object} bigIp                   - Base {@link BigIp} object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
*/
function BigIq5_3LicenseProvider(bigIp, options) {
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

    this.bigIp = bigIp;

    // Use this for backwards compatible APIs
    bigIq5_2LicenseProvider = new BigIq5_2LicenseProvider(bigIp, options);
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
BigIq5_3LicenseProvider.prototype.getUnmanagedDeviceLicense = function(bigIqControl, poolName, bigIpMgmtAddress, bigIpMgmtPort) {
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
BigIq5_3LicenseProvider.prototype.revoke = function(bigIqControl, poolName, bigIpHostname) {
    return bigIq5_2LicenseProvider.revoke(bigIqControl, poolName, bigIpHostname);
};

var licenseFromPool = function(bigIqControl, poolName, bigIpMgmtAddress, bigIpMgmtPort) {
    return bigIqControl.create(
        LICENSE_PATH,
        {
            command: "assign",
            licensePoolName: poolName,
            address: bigIpMgmtAddress,
            port: bigIpMgmtPort,
            user: this.bigIp.user,
            password: this.bigIp.password
        })
        .then(function(response) {
            this.logger.debug(response);

            var taskId = response.id;

            var isLicensed = function() {
                return bigIqControl.list(LICENSE_PATH + taskId)
                    .then(function(response) {
                        var status = response.status;
                        this.logger.verbose('Current licensing task status:', status);
                        if (status === 'FINISHED') {
                            return q(
                                {
                                    success: true
                                }
                            );
                        }
                        else if (status === 'FAILED') {
                            return q(
                                {
                                    success: false,
                                    errorMessage: response.errorMessage
                                }
                            );
                        }
                        else {
                            return q.reject();
                        }
                    }.bind(this));
            };

            return util.tryUntil(this, {maxRetries: 40, retryIntervalMs: 5000}, isLicensed)
                .then(function(response) {
                    if (response.success) {
                        this.logger.info("Successfully licensed");
                        return q();
                    }
                    else {
                        this.logger.info("Licensing failed", response.errorMessage);

                        // If we run into the race condition of 2 BIG-IPs trying to license at the
                        // same time, try a different license
                        if (response.errorMessage.indexOf('already been granted to a BIG-IP') !== -1) {
                            this.logger.debug('Got a license that is already in use. Retrying.');
                            return licenseFromPool.call(this, bigIqControl, poolName, bigIpMgmtAddress, bigIpMgmtPort);
                        }
                        else {
                            return q.reject(new Error(response.errorMessage));
                        }
                    }
                }.bind(this))
                .catch(function(err) {
                    this.logger.info("Failed to license", err);
                    return q.reject(new Error('Giving up on licensing via BIG-IQ.'));
                }.bind(this));

        }.bind(this));
};

module.exports = BigIq5_3LicenseProvider;
