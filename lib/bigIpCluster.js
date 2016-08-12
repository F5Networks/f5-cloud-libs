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

var DEVICE_GROUP_PATH = '/tm/cm/device-group/';

/**
 * Provides onboarding functionality to a base BigIp objectn
 *
 * @param {Object} bigIpCore  - Base BigIp object.
 * @param {Object} [testOpts] - Options used during testing.
 */
function BigIpCluster(bigIpCore, testOpts) {
    this.core = bigIpCore;
    this.testOpts = testOpts || {};
}

/**
 * Adds this device to the trust group on another device.
 *
 * @param {String} hostname       - Hostname to add.
 * @param {String} remoteHost     - IP address of remote host to add
 * @param {String} remoteUser     - Admin user name on remote host
 * @param {String} remotePassword - Admin user password on remote host
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToTrust = function(hostname, remoteHost, remoteUser, remotePassword) {
    return this.core.ready()
        .then(function() {
            // Check to see if host is in the trust domain already
            return this.core.list('/tm/cm/trust-domain/~Common~Root');
        }.bind(this))
        .then(function(response) {
            var containsHost = function(hosts) {
                return hosts.findIndex(function(element) {
                    return element.indexOf(hostname) !== -1;
                }) >= 0 ? true : false;
            };

            if (containsHost(response.caDevices)) {
                return q();
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
                   });
            }
        }.bind(this));
};

/**
 * Adds this device to a device group on another device.
 *
 * Assumes that the device group on the remote device is already
 * created or in the process of being created.
 *
 * @param {String} remoteHost     - IP address of remote host.
 * @param {String} remoteUser     - Admin user on remote host.
 * @param {String} remotePassword - Password for remote admin user.
 * @param {String} deviceGroup    - Name of the remote device group to join.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToDeviceGroup = function(hostname, deviceGroup) {
    return this.core.ready()
        .then(function() {
            // Check to see if host is already in the device group
            return this.core.list(DEVICE_GROUP_PATH + '~Common~' + deviceGroup + '/devices');
        }.bind(this))
        .then(function(response) {
            var containsHost = function(devices) {
                return devices.findIndex(function(element) {
                    return element.name.indexOf(hostname) !== -1;
                }) >= 0 ? true : false;
            };

            if (response.length === 0 || !containsHost(response)) {
                return this.core.create(
                    DEVICE_GROUP_PATH + '~Common~' + deviceGroup + '/devices',
                    {
                        name: hostname
                    }
                );
            }
            else {
                return q();
            }
        }.bind(this));
};

/**
 * Creates a device group
 *
 * @param {String}   name                      - Name for device group.
 * @param {String}   type                      - Type of device group. Must be 'sync-only' || 'sync-failover'.
 * @param {String[]} [devices]                 - Array of device names to add to the group.
 * @param {Object}   [options]                 - Object containg device group options.
 * @param {Boolean}  [options.autoSync]        - Whether or not to autoSync. Default false.
 * @param {Boolean}  [options.saveOnAutoSync]  - If autoSync is eanbled, whether or not to save on
                                                 autoSync. Default false.
 * @param {Boolean}  [options.networkFailover] - Whether or not to use network fail-over. Default false.
 * @param {Boolean}  [options.fullLoadOnSync]  - Whether or not to do a full sync. Default false.
 * @param {Boolean}  [options.asmSync]         - Whether or not do to ASM sync. Default false.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.createDeviceGroup = function(name, type, devices, options) {

    if (!name) {
        return q.reject(new Error("name is required"));
    }

    if (type !== 'sync-only' && type !== 'sync-failover') {
        return q.reject(new Error("type must be 'sync-only' or 'sync-failover'"));
    }

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

            return this.core.create(DEVICE_GROUP_PATH, groupSettings);
        }.bind(this));
};

/**
 * Sets the config sync ip
 *
 * @param {String} configSyncIp - The IP address to use for config sync.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.configSyncIp = function(configSyncIp) {
    return this.core.ready()
        .then(function() {
            return this.core.deviceInfo();
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

/**
 * Syncs to/from device group
 *
 * @param {String}   direction          - 'to-group' || 'from-group'
 * @param {String}   deviceGroup        - Name of the device group to sync.
 * @param {Boolean} [forceFullLoadPush] - Whether or not to use the force-full-load-push option. Default false.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.sync = function(direction, deviceGroup, forceFullLoadPush) {
    return this.core.ready()
        .then(function() {
            return this.core.create(
                   '/tm/cm',
                   {
                       command: "run",
                       utilCmdArgs: ["config-sync", forceFullLoadPush ? 'force-full-load-push' : '', direction, deviceGroup].join(" ")
                   }
            );
        }.bind(this));
};

/**
 * Checks sync status to see if it is complete
 *
 * @returns {Promise} A promise which is resolved if sync is complete,
 *                    or rejected if not or on error.
 */
BigIpCluster.prototype.syncComplete = function() {
    var deferred = q.defer();

    this.core.ready()
        .then(function() {
            return this.core.list('/tm/cm/sync-status');
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

module.exports = BigIpCluster;
