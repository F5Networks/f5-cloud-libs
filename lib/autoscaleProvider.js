/**
 * Copyright 2016 F5 Networks, Inc.
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
var Logger = require('./logger');

/**
 * Constructor.
 * @class
 *
 * @param {Ojbect} [options] - Options for the instance
 * @param {Logger} [options.logger] - Logger to use. Default no logging.
 */
function AutoscaleProvider(options) {
    options = options || {};
    this.logger = options.logger || Logger.getLogger({logLevel: 'none'});
}

/**
 * Initialize class
 *
 * Override for implementation specific initialization needs (read info
 * from cloud provider, read database, etc.). Called at the start of
 * processing.
 *
 * @param {Object} providerOptions - Provider specific options.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
AutoscaleProvider.prototype.init = function(providerOptions) {
    this.logger.debug("No override for AutoscaleProvider.init", providerOptions);
    return q();
};

/**
 * Gets the instance ID of this instance
 *
 * @returns {String} The instance ID of this instance
 */
AutoscaleProvider.prototype.getInstanceId = function() {
    throw new Error("Unimplemented abstract method AutoscaleProvider.getInstanceId");
};

/**
 * Gets info for each instance
 *
 * Info is retrieval is cloud specific. Likely either from the cloud infrastructure
 * itself, stored info that we have in a database, or both.
 *
 * @returns {Object} Dictionary of instance info keyed by instance ID. Instance info is
 *                   {
 *                       isMaster: <Boolean>,
 *                       hostname: <String>,
 *                       mgmtIp: <String>,
 *                       privateIp: <String>
 *                   }
 */
AutoscaleProvider.prototype.getInstances = function() {
    throw new Error("Unimplemented abstract method AutoscaleProvider.getInstances");
};

/**
 * Elects a new master instance from the available instances
 *
 * @param {Object} instances - Dictionary of instances as returned by getInstances
 *
 * @returns {String} Instance ID of the elected master
 */
AutoscaleProvider.prototype.electMaster = function(instances) {
    throw new Error("Unimplemented abstract method AutoscaleProvider.electMaster", instances);
};

/**
 * Determines if a given instanceId is a valid master
 *
 * In some cloud environments, the master may change unexpectedly.
 * Override this method if implementing such a cloud provider.
 *
 * @param {String} instanceId - Instance ID to validate as a valid master.
 *
 * @returns {Boolean} Wether or not the given instanceId is a valid master
 */
AutoscaleProvider.prototype.isValidMaster = function(instanceId) {
    this.logger.debug("No override for AutoscaleProvider.isValidMaster", instanceId);
    return q(true);
};

/**
 * Saves instance info
 *
 * Override for cloud implementations which store instance information.
 *
 * @param {Object} Instance information as returned by getInstances
 */
AutoscaleProvider.prototype.putInstance = function(instance) {
    this.logger.debug("No override for AutoscaleProvider.putInstance", instance);
    return q();
};

/**
 * Turns on instance protection for the given instance ID
 *
 * Override for cloud provicers that support instance protection from scale in.
 *
 * @param {String} [instanceId] - Instance ID of instnace to protect. Default instance ID of self.
 */
AutoscaleProvider.prototype.setInstanceProtection = function(instanceId) {
    this.logger.debug("No override for AutoscaleProvider.setInstanceProtection", instanceId);
    return q();
};

/**
 * Turns off instance protection for the given instance ID
 *
 * Override for cloud provicers that support instance protection from scale in.
 *
 * @param {String} [instanceId] - Instance ID of instnace to un-protect. Default instance ID of self.
 */
AutoscaleProvider.prototype.unsetInstanceProtection = function(instanceId) {
    this.logger.debug("No override for AutoscaleProvider.unsetInstanceProtection", instanceId);
    return q();
};

module.exports = AutoscaleProvider;