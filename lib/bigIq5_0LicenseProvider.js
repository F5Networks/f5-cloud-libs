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

/**
 * Provides ability to get licenses from BIG-IQ 5.0 (and compatible versions).
 *
 * @class
 * @classdesc
 * Provides ability to get licenses from BIG-IQ 5.0 and 5.1
 *
 * @param {Object} bigIpCore               - Base BigIp object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
*/
function BigIq5_0LicenseProvider(bigIpCore, options) {
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
BigIq5_0LicenseProvider.prototype.getUnmanagedDeviceLicense = function(bigIqControl, poolName, bigIpMgmtAddress, bigIpMgmtPort) {
    var poolUuid;

    this.logger.debug('Getting BIG-IP license pool UUID.');
    return bigIqControl.list('/cm/shared/licensing/pools/?$select=uuid,name')
        .then(function(response) {
            this.logger.debug(response);

            var i;

            if (Array.isArray(response)) {
                for (i = 0; i < response.length; ++i) {
                    if (response[i].name === poolName) {
                        poolUuid = response[i].uuid;
                        break;
                    }
                }

                if (poolUuid) {
                    this.logger.debug('Got pool UUID:', poolUuid);

                    this.logger.debug('Requesting license from BIG-IQ license pool.');
                    return bigIqControl.create(
                        '/cm/shared/licensing/pools/' + poolUuid + '/members',
                        {
                            deviceAddress: bigIpMgmtAddress + ':' + bigIpMgmtPort,
                            username: this.core.user,
                            password: this.core.password
                        }
                    );
                }
                else {
                    return q.reject(new Error('No license pool found with name: ' + poolName));
                }
            }
            else {
                return q.reject(new Error ('Error getting license pools: ' + response));
            }
        }.bind(this))
        .then(function(response) {
            this.logger.debug(response);

            var state;
            var licenseUuid;

            var isLicensed = function() {
                var deferred = q.defer();

                bigIqControl.list(
                    '/cm/shared/licensing/pools/' + poolUuid + '/members/' + licenseUuid
                )
                .then(function(response) {
                    var state;
                    state = response.state;
                    this.logger.verbose('Current licensing state:', state);
                    if (state === 'LICENSED') {
                        deferred.resolve();
                    }
                    else {
                        deferred.reject();
                    }
                }.bind(this));

                return deferred.promise;
            };

            if (response) {
                state = response.state;
                licenseUuid = response.uuid;
                this.logger.verbose('Current licensing state:', state);
                this.logger.debug('License UUID:', licenseUuid);

                if (state === 'LICENSED') {
                    return q();
                }
                else {
                    this.logger.verbose('Waiting to be LICENSED.');
                    util.tryUntil(this, {maxRetries: 40, retryIntervalMs: 5000}, isLicensed)
                        .then(function() {
                            return q();
                        })
                        .catch(function() {
                            return q.reject(new Error('Giving up on licensing via BIG-IQ.'));
                        });
                }
            }
        }.bind(this));
};

module.exports = BigIq5_0LicenseProvider;
