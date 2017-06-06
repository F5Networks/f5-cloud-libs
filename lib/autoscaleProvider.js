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
var Logger = require('./logger');

/**
 * Constructor.
 * @class
 * @classdesc
 * Abstract cloud provider implementation.
 *
 * This class should be inherited from to implement cloud-provider
 * specific implementations. Any method in this class that throws
 * must be overridded. Methods that do not throw may be optionally
 * overridden.
 *
 * @param {Ojbect} [options]               - Options for the instance.
 * @param {Object} [options.clOptions]     - Command line options if called from a script.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
 */
function AutoscaleProvider(options) {
    options = options || {};
    this.clOptions = options.clOptions || {};

    if (options.logger) {
        this.logger = options.logger;
    }
    else {
        options.loggerOptions = options.loggerOptions || {logLevel: 'none'};
        options.loggerOptions.module = module;
        this.logger = Logger.getLogger(options.loggerOptions);
        this.loggerOptions = options.loggerOptions;
    }
}

/**
 * Initialize class
 *
 * Override for implementation specific initialization needs (read info
 * from cloud provider, read database, etc.). Called at the start of
 * processing.
 *
 * @param {Object} providerOptions      - Provider specific options.
 * @param {Object}  [options]           - Options for this instance.
 * @param {Boolean} [options.autoscale] - Whether or not this instance will be used for autoscaling.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
AutoscaleProvider.prototype.init = function(providerOptions, options) {
    this.logger.debug("No override for AutoscaleProvider.init", providerOptions, options);
    return q();
};

/**
 * Gets the instance ID of this instance
 *
 * @abstract
 *
 * @returns {Promise} A promise which will be resolved with the instance ID of this instance
 *                    or rejected if an error occurs;
 */
AutoscaleProvider.prototype.getInstanceId = function() {
    throw new Error("Unimplemented abstract method AutoscaleProvider.getInstanceId");
};

/**
 * Gets info for each instance
 *
 * Retrieval is cloud specific. Likely either from the cloud infrastructure
 * itself, stored info that we have in a database, or both.
 *
 * @abstract
 *
 * @returns {Promise} A promise which will be resolved with a dictionary of instances
 *                    keyed by instance ID. Each instance value should be:
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
 * Searches for NICs that have a given tag.
 *
 * @param {Object} tag - Tag to search for. Tag is of the format:
 *
 *                 {
 *                     key: optional key
 *                     value: value to search for
 *                 }
 *
 * @returns {Promise} A promise which will be resolved with an array of instances.
 *                    Each instance value should be:
 *
 *                   {
 *                       id: NIC ID,
 *                       ip: {
 *                           public: public IP (or first public IP on the NIC),
 *                           private: private IP (or first private IP on the NIC)
 *                       }
 *                   }
 */
AutoscaleProvider.prototype.getNicsByTag = function(tag) {
    this.logger.debug("No override for AutoscaleProvider.getNicsByTag", tag);
    return q();
};

/**
 * Searches for VMs that have a given tag.
 *
 * @param {Object} tag - Tag to search for. Tag is of the format:
 *
 *                 {
 *                     key: optional key
 *                     value: value to search for
 *                 }
 *
 * @returns {Promise} A promise which will be resolved with an array of instances.
 *                    Each instance value should be:
 *
 *                   {
 *                       id: instance ID,
 *                       ip: {
 *                           public: public IP (or first public IP on the first NIC),
 *                           private: private IP (or first private IP on the first NIC)
 *                       }
 *                   }
 */
AutoscaleProvider.prototype.getVmsByTag = function(tag) {
    this.logger.debug("No override for AutoscaleProvider.getVmsByTag", tag);
    return q();
};

/**
 * Elects a new master instance from the available instances
 *
 * @abstract
 *
 * @param {Object} instances - Dictionary of instances as returned by getInstances
 *
 * @returns {Promise} A promise which will be resolved with the instance ID of the
 *                    elected master.
 */
AutoscaleProvider.prototype.electMaster = function(instances) {
    throw new Error("Unimplemented abstract method AutoscaleProvider.electMaster", instances);
};

/**
 * Called to retrieve master instance credentials
 *
 * When joining a cluster we need the username and password for the
 * master instance.
 *
 * Management IP and port are passed in so that credentials can be
 * validated desired.
 *
 * @abstract
 *
 * @param {String} mgmtIp - Management IP of master
 * @param {String} port - Managemtn port of master
 *
 * @returns {Promise} A promise which will be resolved with:
 *                    {
 *                        username: <admin_user>,
 *                        password: <admin_password>
 *                    }
 */
AutoscaleProvider.prototype.getMasterCredentials = function(mgmtIp, mgmtPort) {
    throw new Error("Unimplemented abstract method AutoscaleProvider.getMasterCredentials", mgmtIp, mgmtPort);
};

/**
 * Called to store master credentials
 *
 * When joining a cluster we need the username and password for the
 * master instance. This method is called to tell us that we are
 * the master and we should store our credentials if we need to store
 * them for later retrieval in getMasterCredentials.
 *
 * @returns {Promise} A promise which will be resolved when the operation
 *                    is complete
 */
AutoscaleProvider.prototype.putMasterCredentials = function() {
    this.logger.debug("No override for AutoscaleProvider.putMasterCredentials");
    return q();
};

/**
 * Determines if a given instanceId is a valid master
 *
 * In some cloud environments, the master may change unexpectedly.
 * Override this method if implementing such a cloud provider.
 *
 * @param {String} instanceId - Instance ID to validate as a valid master.
 *
 * @returns {Promise} A promise which will be resolved with a boolean indicating
 *                    wether or not the given instanceId is a valid master.
 */
AutoscaleProvider.prototype.isValidMaster = function(instanceId) {
    this.logger.debug("No override for AutoscaleProvider.isValidMaster", instanceId);
    return q(true);
};

/**
 * Called when a master has been elected
 *
 * In some cloud environments, information about the master needs to be
 * stored in persistent storage. Override this method if implementing
 * such a cloud provider.
 *
 * @param {String} masterId - Instance ID that was elected master.
 *
 * @returns {Promise} A promise which will be resolved when processing is complete.
 */
AutoscaleProvider.prototype.masterElected = function(masterId) {
    this.logger.debug("No override for AutoscaleProvider.masterElected", masterId);
    return q();
};

/**
 * Called to get check for and retrieve a stored UCS file
 *
 * Provider implementations can optionally store a UCS to be
 * used to restore a master instance to a last known good state
 *
 * @returns {Promise} A promise which will be resolved with a Buffer containing
 *                    the UCS data if it is present, resolved with undefined if not
 *                    found, or rejected if an error occurs.
 */
 AutoscaleProvider.prototype.getStoredUcs = function() {
     this.logger.debug("No override for AutoscaleProvider.putMasterCredentials");
     return q();
 };

/**
 * Saves instance info
 *
 * Override for cloud implementations which store instance information.
 *
 * @param {Object} Instance information as returned by getInstances.
 *
 * @returns {Promise} A promise which will be resolved with instance info.
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
 *
 * @returns {Promise} A promise which will be resolved when processing is complete.
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
 *
 * @returns {Promise} A promise which will be resolved when processing is complete.
 */
AutoscaleProvider.prototype.unsetInstanceProtection = function(instanceId) {
    this.logger.debug("No override for AutoscaleProvider.unsetInstanceProtection", instanceId);
    return q();
};

module.exports = AutoscaleProvider;
