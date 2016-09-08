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
var util = require('./util');

var DEVICE_GROUP_PATH = '/tm/cm/device-group/';

/**
 * Provides clustering functionality to a base BigIp object
 * @class
 *
 * @param {Object} bigIpCore  - Base BigIp object.
 * @param {Object} [testOpts] - Options used during testing.
 */
function BigIpCluster(bigIpCore, testOpts) {
    this.core = bigIpCore;
    this.testOpts = testOpts || {};
}

/**
 * Adds a device to the trust group.
 *
 * @param {String}  hostname                       - Hostname to add.
 * @param {String}  remoteHost                     - IP address of remote host to add
 * @param {String}  remoteUser                     - Admin user name on remote host
 * @param {String}  remotePassword                 - Admin user password on remote host
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToTrust = function(hostname, remoteHost, remoteUser, remotePassword, retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                // Check to see if host is in the trust domain already
                return this.core.list('/tm/cm/trust-domain/~Common~Root', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var containsHost = function(hosts) {
                    var i;
                    for (i = 0; i < hosts.length; ++i) {
                        if (hosts[i].indexOf(hostname) !== -1) {
                            return true;
                        }
                    }
                };

                if (containsHost(response.caDevices)) {
                    return;
                }
                else {
                    return this.core.create(
                       '/tm/cm/add-to-trust',
                       {
                            command: 'run',
                            name: 'Root',
                            caDevice: true,
                            device: remoteHost,
                            deviceName: hostname,
                            username: remoteUser,
                            password: remotePassword
                       },
                       undefined,
                       util.NO_RETRY);
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Adds this device to a device group on another device.
 *
 * Assumes that the device group on the remote device is already
 * created or in the process of being created.
 *
 * @param {String}  remoteHost                     - IP address of remote host.
 * @param {String}  remoteUser                     - Admin user on remote host.
 * @param {String}  remotePassword                 - Password for remote admin user.
 * @param {String}  deviceGroup                    - Name of the remote device group to join.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToDeviceGroup = function(hostname, deviceGroup, retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                // Check to see if host is already in the device group
                return this.core.list(DEVICE_GROUP_PATH + '~Common~' + deviceGroup + '/devices', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var containsHost = function(devices) {
                    var i;
                    for (i = 0; i < devices.length; ++i) {
                        if (devices[i].name.indexOf(hostname) !== -1) {
                            return true;
                        }
                    }
                };

                if (response.length === 0 || !containsHost(response)) {
                    return this.core.create(
                        DEVICE_GROUP_PATH + '~Common~' + deviceGroup + '/devices',
                        {
                            name: hostname
                        },
                        undefined,
                        util.NO_RETRY
                    );
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Creates a device group
 *
 * @param {String}   name                           - Name for device group.
 * @param {String}   type                           - Type of device group. Must be 'sync-only' || 'sync-failover'.
 * @param {String[]} [devices]                      - Array of device names to add to the group.
 * @param {Object}   [options]                      - Object containg device group options.
 * @param {Boolean}  [options.autoSync]             - Whether or not to autoSync. Default false.
 * @param {Boolean}  [options.saveOnAutoSync]       - If autoSync is eanbled, whether or not to save on
                                                      autoSync. Default false.
 * @param {Boolean}  [options.networkFailover]      - Whether or not to use network fail-over. Default false.
 * @param {Boolean}  [options.fullLoadOnSync]       - Whether or not to do a full sync. Default false.
 * @param {Boolean}  [options.asmSync]              - Whether or not do to ASM sync. Default false.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.createDeviceGroup = function(name, type, devices, options, retryOptions) {

    if (!name) {
        return q.reject(new Error("name is required"));
    }

    if (type !== 'sync-only' && type !== 'sync-failover') {
        return q.reject(new Error("type must be 'sync-only' or 'sync-failover'"));
    }

    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                var groupSettings = {
                    name: name,
                    type: type,
                    devices: devices || []
                };

                options = options || {};

                groupSettings.autoSync = options.autoSync ? 'enabled' : 'disabled';
                groupSettings.fullLoadOnSync = options.fullLoadOnSync ? true : false;
                groupSettings.asmSync = options.asmSync ? 'enabled' : 'disabled';

                if (groupSettings.autoSync === 'enabled') {
                    groupSettings.saveOnAutoSync = options.saveOnAutoSync ? true : false;
                }

                if (type === 'sync-failover') {
                    groupSettings.networkFailover = options.networkFailover ? 'enabled' : 'disabled';
                }

                return this.core.create(DEVICE_GROUP_PATH, groupSettings, undefined, util.NO_RETRY);
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Sets the config sync ip
 *
 * @param {String}   configSyncIp                   - The IP address to use for config sync.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.configSyncIp = function(configSyncIp, retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.deviceInfo(util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                return this.core.modify(
                    '/tm/cm/device/~Common~' + response.hostname,
                    {
                        configsyncIp: configSyncIp
                    }
                );
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Syncs to/from device group
 *
 * @param {String}   direction                      - 'to-group' || 'from-group'
 * @param {String}   deviceGroup                    - Name of the device group to sync.
 * @param {Boolean}  [forceFullLoadPush]            - Whether or not to use the force-full-load-push option. Default false.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.sync = function(direction, deviceGroup, forceFullLoadPush, retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.create(
                       '/tm/cm',
                       {
                           command: "run",
                           utilCmdArgs: ["config-sync", forceFullLoadPush ? 'force-full-load-push' : '', direction, deviceGroup].join(" ")
                       },
                       undefined,
                       util.NO_RETRY
                );
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Checks sync status to see if it is complete
 *
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved if sync is complete,
 *                    or rejected if not or on error.
 */
BigIpCluster.prototype.syncComplete = function(retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        var deferred = q.defer();
        this.core.ready()
            .then(function() {
                return this.core.list('/tm/cm/sync-status', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                if (response.entries["https://localhost/mgmt/tm/cm/sync-status/0"].nestedStats.entries.color.description === 'green') {
                    deferred.resolve();
                }
                else {
                    deferred.reject();
                }
            })
            .catch(function(err) {
                deferred.reject(err);
            })
            .done();

        return deferred.promise;
    };

    return util.tryUntil(this, retryOptions, func);
};

module.exports = BigIpCluster;
