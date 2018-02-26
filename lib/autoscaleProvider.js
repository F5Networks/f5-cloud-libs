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
const Logger = require('./logger');
const BigIq = require('./bigIq');

const MAX_STORED_INSTANCE_AGE = 60000 * 60 * 24; // 1 day

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
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function AutoscaleProvider(options) {
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
        Object.keys(options.clOptions).forEach((option) => {
            this.clOptions[option] = options.clOptions[option];
        });
    }

    // Holder for supported features. If an implementation supports an features,
    // set them to true in this map
    this.features = {};

    if (logger) {
        this.logger = logger;
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        this.loggerOptions = loggerOptions;
    }
}

// Public constants...
// optional features that a provider can support...

// ability to message other instances in the scale set
AutoscaleProvider.FEATURE_MESSAGING = 'FEATURE_MESSAGING';
// supports stroing/retrieving public/private keys
AutoscaleProvider.FEATURE_ENCRYPTION = 'FEATURE_ENCRYPTION';
// password is the same for all members of a cluster
AutoscaleProvider.FEATURE_SHARED_PASSWORD = 'FEATURE_SHARED_PASSWORD';

// messages that can be sent if FEATURE_MESSAGING is supported...

// add an instance to the cluster
AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER = 'ADD_TO_CLUSTER';
// a sync has been completed, you may need to update your password
AutoscaleProvider.MESSAGE_SYNC_COMPLETE = 'SYNC_COMPLETE';

// For use in getMasterStatus...
AutoscaleProvider.STATUS_OK = 'OK';
AutoscaleProvider.STATUS_NOT_EXTERNAL = 'NOT_EXTERNAL';
AutoscaleProvider.STATUS_NOT_IN_CLOUD_LIST = 'NOT_IN_CLOUD_LIST';
AutoscaleProvider.STATUS_VERSION_NOT_UP_TO_DATE = 'VERSION_NOT_UP_TO_DATE';
AutoscaleProvider.STATUS_UNKNOWN = 'UNKNOWN';

/**
 * Initialize class
 *
 * Override for implementation specific initialization needs (read info
 * from cloud provider, read database, etc.). Called at the start of
 * processing.
 *
 * @param {Object}  providerOptions     - Provider specific options.
 * @param {Object}  [options]           - Options for this instance.
 * @param {Boolean} [options.autoscale] - Whether or not this instance will be used for autoscaling.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
AutoscaleProvider.prototype.init = function init(providerOptions, options) {
    this.logger.debug('No override for AutoscaleProvider.init', providerOptions, options);
    return q();
};

/**
 * BIG-IP is now ready and providers can run BIG-IP functions
 * if necessary
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
AutoscaleProvider.prototype.bigIpReady = function bigIpReady() {
    this.logger.debug('No override for AutoscaleProvider.bigIpReady');
    return q();
};

/**
 * Gets data from a provider specific URI
 *
 * Override for implementations that wish to allow retrieval of data from a
 * provider specific URI (for example, an ARN to an S3 bucket).
 *
 * @abstract
 *
 * @param {String} uri - The cloud-specific URI of the resource.
 *
 * @returns {Promise} A promise which will be resolved with the data from the URI
 *                    or rejected if an error occurs.
 */
AutoscaleProvider.prototype.getDataFromUri = function getDataFromUri(uri) {
    throw new Error('Unimplemented abstract method AutoscaleProvider.getDataFromUri', uri);
};

/**
 * Gets the instance ID of this instance
 *
 * @abstract
 *
 * @returns {Promise} A promise which will be resolved with the instance ID of this instance
 *                    or rejected if an error occurs;
 */
AutoscaleProvider.prototype.getInstanceId = function getInstanceId() {
    throw new Error('Unimplemented abstract method AutoscaleProvider.getInstanceId');
};

/**
 * Gets info for each instance
 *
 * Retrieval is cloud specific. Likely either from the cloud infrastructure
 * itself, stored info that we have in a database, or both.
 *
 * @abstract
 *
 * @param {Object} [options] - Optional parameters
 * @param {String} [options.externalTag] - Also look for instances with this
 *                                         tag (outside of the autoscale group/set)
 *
 * @returns {Promise} A promise which will be resolved with a dictionary of instances
 *                    keyed by instance ID. Each instance value should be:
 *
 *                   {
 *                       isMaster: <Boolean>,
 *                       hostname: <String>,
 *                       mgmtIp: <String>,
 *                       privateIp: <String>,
 *                       publicIp: <String>,
 *                       providerVisible: <Boolean> (does the cloud provider know about this instance),
 *                       external: <Boolean> (true if this instance is external to the autoscale group/set)
 *                   }
 */
AutoscaleProvider.prototype.getInstances = function getInstances(options) {
    throw new Error('Unimplemented abstract method AutoscaleProvider.getInstances', options);
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
AutoscaleProvider.prototype.getNicsByTag = function getNicsByTag(tag) {
    this.logger.debug('No override for AutoscaleProvider.getNicsByTag', tag);
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
AutoscaleProvider.prototype.getVmsByTag = function getVmsByTag(tag) {
    this.logger.debug('No override for AutoscaleProvider.getVmsByTag', tag);
    return q();
};

/**
 * Elects a new master instance from the available instances
 *
 * @abstract
 *
 * @param {Object} instances - Dictionary of instances as returned by getInstances.
 *
 * @returns {Promise} A promise which will be resolved with the instance ID of the
 *                    elected master.
 */
AutoscaleProvider.prototype.electMaster = function electMaster(instances) {
    throw new Error('Unimplemented abstract method AutoscaleProvider.electMaster', instances);
};

/**
 * Called to retrieve master instance credentials
 *
 * Must be implemented if FEATURE_MESSAGING is not supported.
 *
 * If FEATURE_MESSAGING is not supported, when joining a cluster we need the
 * username and password for the master instance.
 *
 * If FEATURE_MESSAGING is supported, the master will be sent a message to
 * add an instance.
 *
 * Management IP and port are passed in so that credentials can be
 * validated desired.
 *
 * @abstract
 *
 * @param {String} mgmtIp - Management IP of master.
 * @param {String} port - Management port of master.
 *
 * @returns {Promise} A promise which will be resolved with:
 *
 *                    {
 *                        username: <admin_user>,
 *                        password: <admin_password>
 *                    }
 */
AutoscaleProvider.prototype.getMasterCredentials = function getMasterCredentials(mgmtIp, mgmtPort) {
    if (!this.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
        throw new Error(
            'Unimplemented abstract method AutoscaleProvider.getMasterCredentials',
            mgmtIp,
            mgmtPort
        );
    } else {
        this.logger.debug('No override for AutoscaleProvider.getMasterCredentials');
        return q(true);
    }
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
AutoscaleProvider.prototype.putMasterCredentials = function putMasterCredentials() {
    this.logger.debug('No override for AutoscaleProvider.putMasterCredentials');
    return q();
};

/**
 * Gets info on what this instance thinks the master status is
 *
 * Info is retrieval is cloud specific. Likely either from the cloud infrastructure
 * itself, stored info that we have in a database, or both.
 *
 * @returns {Promise} A promise which will be resolved with a dictionary of master
 *                    status:
 *
 *                    {
 *                        "instanceId": masterInstanceId
 *                        "status": AutoscaleProvider.STATUS_*
 *                        "lastUpdate": Date,
 *                        "lastStatusChange": Date
 *                    }
 *
 */
AutoscaleProvider.prototype.getMasterStatus = function getMasterStatus() {
    this.logger.debug('No override for AutoscaleProvider.getMasterStatus');
    return q();
};

/**
 * Gets the public key for an instanceId.
 *
 * @param {String} instanceId - Instance ID to validate as a valid master.
 *
 * @returns {Promise} A promise which will be resolved when the operation
 *                    is complete
 */
AutoscaleProvider.prototype.getPublicKey = function getPublicKey(instanceId) {
    if (this.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
        throw new Error('Unimplemented abstract method AutoscaleProvider.getPublicKey', instanceId);
    } else {
        this.logger.debug('No override for AutoscaleProvider.getPublicKey');
        return q(true);
    }
};

/**
 * Determines if the provider supports a feature.
 *
 * @param {String} feature - Feature to check for
 *
 * @returns {Boolean} Whether or not the provider supports the feature
 */
AutoscaleProvider.prototype.hasFeature = function hasFeature(feature) {
    return !!this.features[feature];
};

/**
 * Stores the public key for an instanceId.
 *
 * The public key should later be able to retrieved given the instanceId.
 * Must be implemented if provider supports FEATURE_ENCRYPTION.
 *
 * @param {String} instanceId - Instance ID to validate as a valid master.
 * @param {String} publicKey - The public key
 *
 * @returns {Promise} A promise which will be resolved when the operation
 *                    is complete
 */
AutoscaleProvider.prototype.putPublicKey = function putPublicKey(instanceId, publicKey) {
    if (this.hasFeature(AutoscaleProvider.FEATURE_ENCRYPTION)) {
        throw new Error(
            'Unimplemented abstract method AutoscaleProvider.putPublicKey',
            instanceId,
            publicKey
        );
    } else {
        this.logger.debug('No override for AutoscaleProvider.putPublicKey');
        return q(true);
    }
};

/**
 * Determines if a given instanceId is a valid master
 *
 * In some cloud environments, the master may change unexpectedly.
 * Override this method if implementing such a cloud provider.
 *
 * @param {String} instanceId - Instance ID to validate as a valid master.
 * @param {Object} instances - Dictionary of instances as returned by getInstances.
 *
 * @returns {Promise} A promise which will be resolved with a boolean indicating
 *                    wether or not the given instanceId is a valid master.
 */
AutoscaleProvider.prototype.isValidMaster = function isValidMaster(instanceId, instances) {
    this.logger.debug('No override for AutoscaleProvider.isValidMaster', instanceId, instances);
    return q(true);
};

/**
 * Called when a master has been elected
 *
 * In some cloud environments, information about the master needs to be
 * stored in persistent storage. Override this method if implementing
 * such a cloud provider.
 *
 * @param {String} instancId - Instance ID that was elected master.
 * @param {Object} instances - Dictionary of instances as returned by getInstances.
 *
 * @returns {Promise} A promise which will be resolved when processing is complete.
 */
AutoscaleProvider.prototype.masterElected = function masterElected(instanceId, instances) {
    this.logger.debug('No override for AutoscaleProvider.masterElected', instanceId, instances);
    return q();
};

/**
 * Indicates that an instance that was master is now invalid
 *
 * Override for cloud providers that need to take some action when a master
 * becomes invalid.
 *
 * @param {String} instanceId - Instance ID of instnace that is no longer a valid
 *                              master.
 * @param {Object} instances  - Dictionary of instances as returned by getInstances.
 *
 * @returns {Promise} A promise which will be resolved when processing is complete.
 */
AutoscaleProvider.prototype.masterInvalidated = function masterInvalidated(instanceId, instances) {
    this.logger.debug('No override for AutoscaleProvider.masterInvalidated', instanceId, instances);
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
AutoscaleProvider.prototype.getStoredUcs = function getStoredUcs() {
    this.logger.debug('No override for AutoscaleProvider.putMasterCredentials');
    return q();
};

/**
 * Saves instance info
 *
 * Override for cloud implementations which store instance information.
 *
 * @param {String} instanceId - ID of instance
 * @param {Object} instance   - Instance information as returned by getInstances.
 *
 * @returns {Promise} A promise which will be resolved with instance info.
 */
AutoscaleProvider.prototype.putInstance = function putInstance(instanceId, instance) {
    this.logger.debug('No override for AutoscaleProvider.putInstance', instance);
    return q();
};

/**
 * Sends a message to other instances in the scale set
 *
 * Must be implemented if FEATURE_MESSAGING is supported
 *
 * @abstract
 *
 * @param {String} actionId                 - Action id of message to send
 * @param {Object} [options]                - Optional parameters
 * @param {String} [options.toInstanceId]   - Instance ID that message is for
 * @param {String} [options.fromInstanceId] - Instance ID that message is from
 * @param {Object} [options.data]           - Message specific data
 *
 * @returns {Promise} A promise which will be resolved when the message
 *                    has been sent or rejected if an error occurs
 */
AutoscaleProvider.prototype.sendMessage = function sendMessage(actionId, data) {
    if (this.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
        throw new Error('Unimplemented abstract method AutoscaleProvider.sendMessage', actionId, data);
    } else {
        this.logger.debug('No override for AutoscaleProvider.sendMessage');
        return q(true);
    }
};

/**
 * Revokes licenses for instances licensed from BIG-IQ
 *
 * @param {Object[]} instances        - Instances for which to revoke licenses. Instances
 *                                      should be as returned by getInstances
 * @param {Object}   [options]        - Original command line options
 * @param {Object}   [options.bigIp]  - Base {@link BigIp} object.
 *
 * @returns {Promise} A promise which will be resolved when processing is complete.
 */
AutoscaleProvider.prototype.revokeLicenses = function revokeLicenses(instances, options) {
    const promises = [];

    if (instances.length > 0) {
        if (!this.clOptions.licensePool) {
            this.logger.debug('Can only revoke licenses retrieved from BIG-IQ. Ignoring.');
            return q.resolve();
        }

        // this.bigIq can be set for testing
        const bigIq = this.bigIq || new BigIq(this.options);

        return bigIq.init(
            this.clOptions.bigIqHost,
            this.clOptions.bigIqUser,
            this.clOptions.bigIqPassword || this.clOptions.bigIqPasswordUri,
            {
                passwordIsUri: typeof this.clOptions.bigIqPasswordUri !== 'undefined',
                bigIp: options.bigIp
            }
        )
            .then(() => {
                instances.forEach((instance) => {
                    promises.push(bigIq.revokeLicense(this.clOptions.licensePoolName, instance.hostname));
                });
                return q.all(promises);
            });
    }

    return q();
};

/**
 * Gets messages from other instances in the scale set
 *
 * @param {String[]} actions               - Array of actions to get. Other messages will be ignored.
 *                                           Default (empty or undefined) is all actions.
 * @param {Object}  [options]              - Optional parameters
 * @param {String}  [options.toInstanceId] - toInstanceId of messsages we are interested in
 *
 * @returns {Promise} A promise which will be resolved when the messages
 *                    have been received and processed. Promise should be
 *                    resolved with an array of messages of the form
 *
 *                    {
 *                        action: message action id,
 *                        toInstanceId: instanceId,
 *                        fromInstanceId: instanceId,
 *                        data: message specific data used in sendMessage,
 *                        completionHandler: optional completionHandler to call wnen done processing
 *                        {
 *                            this: this arg for callback context,
 *                            callback: function to call,
 *                            data: data to send to function
 *                        }
 *                    }
 */
AutoscaleProvider.prototype.getMessages = function getMessages(actions, options) {
    if (this.hasFeature(AutoscaleProvider.FEATURE_MESSAGING)) {
        throw new Error('Unimplemented abstract method AutoscaleProvider.getMessages', actions, options);
    } else {
        this.logger.debug('No override for AutoscaleProvider.getMessages');
        return q(true);
    }
};

/**
 * Informs the provider that a sync has completed in case the
 * password needs to be updated
 *
 * When a sync is complete, the user and password will exist on
 * the synced to device.
 *
 * @param {String} fromUser     - User that was synced from
 * @param {String} fromPassword - Password that was synced from
 *
 * @returns {Promise} A promise which will be resolved when the messages
 *                    have been received and processed
 */
// eslint-disable-next-line no-unused-vars
AutoscaleProvider.prototype.syncComplete = function syncComplete(fromUser, fromPassword) {
    this.logger.debug('No override for AutoscaleProvider.syncComplete', fromUser);
    return q(true);
};

/**
 * Determines whether a stored instance is so old it should not be considered
 *
 * @param {Object} instance - Instance data
 *
 * @returns {Boolean} Whether or not the instance is expired
 */
AutoscaleProvider.prototype.isInstanceExpired = function isInstanceExpired(instance) {
    let isExpired = false;

    const lastUpdate = instance.lastUpdate || new Date();
    const age = new Date() - new Date(lastUpdate);

    if (age > MAX_STORED_INSTANCE_AGE) {
        isExpired = true;
    }

    return isExpired;
};

module.exports = AutoscaleProvider;
