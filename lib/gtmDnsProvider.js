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

const assert = require('assert');
const q = require('q');
const util = require('util');
const BigIp = require('./bigIp');
const DnsProvider = require('./dnsProvider');

util.inherits(GtmDnsProvider, DnsProvider);

/**
 * Constructor.
 * @class
 *
 * @param {Ojbect} [options]               - Options for the instance.
 * @param {Object} [options.clOptions]     - Command line options if called from a script.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function GtmDnsProvider(options) {
    const logger = options ? options.logger : undefined;
    const loggerOptions = options ? options.loggerOptions : undefined;

    GtmDnsProvider.super_.call(this, options);
    this.bigIp = new BigIp({
        logger,
        loggerOptions
    });
}

/**
 * Initialize class
 *
 * Override for implementation specific initialization needs (read info
 * from cloud provider, read database, etc.). Called at the start of
 * processing.
 *
 * @param {Object} providerOptions                     - Provider specific options.
 * @param {String} providerOptions.host                - BIG-IP GTM management IP or hostname
 *                                                       to which to send commands.
 * @param {String} providerOptions.user                - BIG-IP GTM admin user name.
 * @param {String} providerOptions.port                - BIG-IP GTM management SSL port to connect to.
 *                                                       Default 443.
 * @param {String} providerOptions.password            - BIG-IP GTM admin user password.
 *                                                       Use this or passwordUrl.
 * @param {String} providerOptions.passwordUrl         - URL (file, http(s)) to location that contains
 *                                                       BIG-IP GTM admin user password. Use this or password.
 * @param {String} [providerOptions.passwordEncrypted] - Indicates that the BIG-IP GTM password is encrypted
 *                                                       (either with encryptDataToFile or generatePassword).
 * @param {String} providerOptions.serverName          - GSLB server name.
 * @param {String} providerOptions.poolName            - GSLB pool name.
 * @param {String} [providerOptions.datacenter]        - GSLB data center.
 * @param {String} [providerOptions.vsMonitor]         - Full path to monitor for the virtual server.
 *                                                       Default is existing monitor.
 * @param {String} [providerOptions.poolMonitor]       - Full path to monitor for the pool.
 *                                                       Default is existing monitor.
 * @param {String} [providerOptions.loadBalancingMode] - Load balancing mode for the pool.
 *                                                       Default is existing load balancing mode.
 * @param {String} [providerOptions.partition]         - Partition of pool and server. Default is Common.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
GtmDnsProvider.prototype.init = function init(providerOptions) {
    assert.equal(typeof providerOptions, 'object', 'providerOptions is required');
    assert.equal(typeof providerOptions.serverName, 'string', 'providerOptions.serverName is required');
    assert.equal(typeof providerOptions.poolName, 'string', 'providerOptions.poolName is required');

    this.providerOptions = providerOptions;
    return q();
};

/**
 * Updates DNS records with the given instances
 *
 * @param {Object} instances - Array of instances, each having the form
 *
 *     {
 *         name: name for instance,
 *         ip: ip address,
 *         port: port
 *     }
 *
 * @returns {Promise} A promise which will be resolved with the instance ID of the
 *                    elected master.
 */
GtmDnsProvider.prototype.update = function update(instances) {
    this.logger.info('Initializing BIG-IP.');
    return this.bigIp.init(
        this.providerOptions.host,
        this.providerOptions.user,
        this.providerOptions.password || this.providerOptions.passwordUrl,
        {
            port: this.providerOptions.port,
            passwordIsUrl: typeof this.providerOptions.passwordUrl !== 'undefined',
            passwordEncrypted: this.providerOptions.passwordEncrypted
        }
    )
        .then(() => {
            return this.bigIp.ready();
        })
        .then(() => {
            const options = {
                datacenter: this.providerOptions.datacenter,
                monitor: this.providerOptions.vsMonitor
            };

            if (this.providerOptions.partition) {
                this.bigIp.gtm.setPartition(this.providerOptions.partition);
            }

            return this.bigIp.gtm.updateServer(this.providerOptions.serverName, instances, options);
        })
        .then(() => {
            const options = {
                monitor: this.providerOptions.poolMonitor,
                loadBalancingMode: this.providerOptions.loadBalancingMode
            };
            return this.bigIp.gtm.updatePool(
                this.providerOptions.poolName,
                this.providerOptions.serverName,
                instances,
                options
            );
        });
};

module.exports = GtmDnsProvider;
