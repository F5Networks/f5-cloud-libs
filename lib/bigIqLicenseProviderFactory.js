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

const util = require('./util');
const BigIq50LicenseProvider = require('./bigIq50LicenseProvider');
const BigIq52LicenseProvider = require('./bigIq52LicenseProvider');
const BigIq53LicenseProvider = require('./bigIq53LicenseProvider');
const BigIq54LicenseProvider = require('./bigIq54LicenseProvider');

module.exports = {
    /**
     * Creates a BIG-IQ license provider for the given version
     *
     * @param {String} bigIqVersion            - Version of BIG-IQ.
     * @param {Object} {BigIp}                 - See {@link BigIp}.
     * @param {Ojbect} [options]               - Options for the instance.
     * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
     * @param {Object} [options.loggerOptions] - Options for the logger.
     *                                           See {@link module:logger.getLogger} for details.
     */
    getLicenseProvider(bigIqVersion, bigIp, options) {
        if (util.versionCompare(bigIqVersion, '5.0.0') < 0) {
            throw new Error('Licensing via BIG-IQ is only supported on BIG-IQ versions 5.0.x and greater');
        }

        if (util.versionCompare(bigIqVersion, '5.0.0') >= 0
            && util.versionCompare(bigIqVersion, '5.2.0') < 0) {
            return new BigIq50LicenseProvider(bigIp, options);
        } else if (util.versionCompare(bigIqVersion, '5.2.0') >= 0
            && util.versionCompare(bigIqVersion, '5.3.0') < 0) {
            return new BigIq52LicenseProvider(bigIp, options);
        } else if (util.versionCompare(bigIqVersion, '5.3.0') >= 0
            && util.versionCompare(bigIqVersion, '5.4.0') < 0) {
            return new BigIq53LicenseProvider(bigIp, options);
        }
        return new BigIq54LicenseProvider(bigIp, options);
    }
};
