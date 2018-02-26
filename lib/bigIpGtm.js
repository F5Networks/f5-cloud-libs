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
const util = require('./util');
const Logger = require('./logger');

/**
 * GTM constructor
 *
 * @class
 * @classdesc
 * Provides GTM functionality to a base BigIp object
 *
 * @param {Object} bigIpCore               - Base BigIp object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function BigIpGtm(bigIpCore, options) {
    const logger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;

    if (logger) {
        this.logger = logger;
        util.setLogger(logger);
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        util.setLoggerOptions(loggerOptions);
    }

    this.core = bigIpCore;
    this.partition = 'Common';
}

/**
 * Updates a GTM server
 * @param {String}   serverName      - Name of the server to update
 * @param {Object[]} virtualSservers - Array of virtual servers to set for the server
 *
 *     {
 *         name: <name>
 *         ip: <ip_address>
 *         port: <port>
 *     }
 * @param {Object}   [options]             - Optional parameters
 * @param {String}   [options.datacenter]  - Datacenter for server
 * @param {String}   [options.monitor]     - Full path to monitor for server
 *
 * @returns {Promise} A promise which is resolved if succssful or rejected if
 *                    an error occurs
 */
BigIpGtm.prototype.updateServer = function updateServer(serverName, virtualServers, options) {
    const servers = [];
    const payload = {};

    assert.equal(typeof serverName, 'string', 'serverName must be a string');
    assert.equal(Array.isArray(virtualServers), true, 'virtualServers must be an array');

    const datacenter = options ? options.datacenter : undefined;
    const monitor = options ? options.monitor : undefined;

    virtualServers.forEach((virtualServer) => {
        servers.push({
            name: virtualServer.name,
            destination: `${virtualServer.ip}:${virtualServer.port}`
        });
    });
    payload.virtualServers = servers;

    if (datacenter) {
        payload.datacenter = datacenter;
    }

    if (monitor) {
        payload.monitor = monitor;
    }

    return this.core.modify(`/tm/gtm/server/~${this.partition}~${serverName}`, payload);
};

/**
 * Updates the A record for a GTM pool with the list of virtual servers
 *
 * @param {String}   poolName                    - Name of pool to update
 * @param {String}   serverName                  - Name of the server to update
 * @param {Object[]} virtualSservers             - Array of virtual servers to set for the pool
 *
 *     {
 *         name: <name>
 *     }
 * @param {Object}   [options]                   - Optional parameters
 * @param {String}   [options.monitor]           - Full path to monitor for pool
 * @param {String}   [options.loadBalancingMode] - Load balancing mode for pool
 *
 * @returns {Promise} A promise which is resolved if succssful or rejected if
 *                    an error occurs
 */
BigIpGtm.prototype.updatePool = function updatePool(poolName, serverName, virtualServers, options) {
    const members = [];
    const payload = {};

    assert.equal(typeof poolName, 'string', 'poolName must be a string');
    assert.equal(typeof serverName, 'string', 'serverName must be a string');
    assert.equal(Array.isArray(virtualServers), true, 'virtualServers must be an array');

    const monitor = options ? options.monitor : undefined;
    const loadBalancingMode = options ? options.loadBalancingMode : undefined;

    virtualServers.forEach((virtualServer) => {
        members.push({
            name: `${serverName}:${virtualServer.name}`
        });
    });
    payload.members = members;

    if (monitor) {
        payload.monitor = monitor;
    }

    if (loadBalancingMode) {
        payload.loadBalancingMode = loadBalancingMode;
    }

    return this.core.modify(`/tm/gtm/pool/a/~${this.partition}~${poolName}`, payload);
};

/**
 * Sets the partition to use for future requests on this instance
 *
 * @param {String} partition - The partition to use
 */
BigIpGtm.prototype.setPartition = function setPartition(partition) {
    this.partition = partition;
};

module.exports = BigIpGtm;
