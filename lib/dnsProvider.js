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
const Logger = require('./logger');

/**
 * Constructor.
 * @class
 * @classdesc
 * Abstract DNS provider implementation.
 *
 * This class should be inherited from to implement DNS
 * specific implementations. Any method in this class that throws
 * must be overridded. Methods that do not throw may be optionally
 * overridden.
 *
 * @param {Ojbect} [options]               - Options for the instance.
 * @param {Object} [options.clOptions]     - Command line options if called from a script.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function DnsProvider(options) {
    const logger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;

    this.options = {};
    if (options) {
        Object.keys(options).forEach((option) => {
            this.options[option] = options[option];
        });
    }

    this.clOptions = {};
    if (options && options.clOptions) {
        Object.keys(this.options.clOptions).forEach((option) => {
            this.clOptions[option] = options.clOptions[option];
        });
    }

    if (logger) {
        this.logger = logger;
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        this.loggerOptions = loggerOptions;
    }
}

/**
 * Initialize class
 *
 * Override for implementation specific initialization needs (read info
 * from cloud provider, read database, etc.). Called at the start of
 * processing.
 *
 * @param {Object}  providerOptions     - Provider specific options.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
DnsProvider.prototype.init = function init(providerOptions) {
    this.logger.debug('No override for DnsProvider.init', providerOptions);
    return q();
};

/**
 * Updates DNS records with the given instances
 *
 * @abstract
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
DnsProvider.prototype.update = function update(instances) {
    throw new Error('Unimplemented abstract method DnsProvider.update', instances);
};

module.exports = DnsProvider;
