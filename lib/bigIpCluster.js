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
 * @param {String} remoteHost     - IP address of remote host.
 * @param {String} remoteUser     - Admin user on remote host.
 * @param {String} remotePassword - Password for remote admin user.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToRemoteTrust = function(remoteHost, remoteUser, remotePassword) {
    var BigIp = require('./bigIp');
    var remoteBigIp = new BigIp(remoteHost, remoteUser, remotePassword, this.testOpts);
    var remoteHostname;
    return remoteBigIp.ready()
        .then(function() {
            // Get the local host name
            return this.core.deviceInfo();
        }.bind(this))
        .then(function(response) {
            remoteHostname = response.hostname;

            // Check to see if we're in the remote trust domain already
            return remoteBigIp.list('/tm/cm/trust-domain/~Common~Root');
        })
        .then(function(response) {
            var containsLocalHost = function(hosts) {
                return hosts.findIndex(function(element) {
                    return element.indexOf(remoteHostname) !== -1;
                }) >= 0 ? true : false;
            };

            if (containsLocalHost(response.caDevices)) {
                return q();
            }
            else {
                return remoteBigIp.create(
                   '/tm/cm/add-to-trust',
                   {
                        command: 'run',
                        name: 'Root',
                        caDevice: true,
                        device: this.core.host,
                        deviceName: remoteHostname,
                        username: this.core.user,
                        password: this.core.password
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
BigIpCluster.prototype.addToRemoteDeviceGroup = function(remoteHost, remoteUser, remotePassword, deviceGroup) {
    var BigIp = require('./bigIp');
    var remoteBigIp = new BigIp(remoteHost, remoteUser, remotePassword, this.testOpts);
    var localHostname;

    return this.core.ready()
        .then(function() {
            // Get the local host name
            return this.core.deviceInfo();
        }.bind(this))
        .then(function(response) {
            localHostname = response.hostname;
            return remoteBigIp.ready();
        }.bind(this))
        .then(function() {
            // Wait for a while for the remote device group to be created. Might still be provisioning the remote as well...
            var checkRemoteDeviceGroup = function(remoteHost, remoteUser, remotePassword, deviceGroup) {
                return remoteBigIp.list(DEVICE_GROUP_PATH + deviceGroup);
            };

            return util.tryUntil(this, 60, 10000, checkRemoteDeviceGroup, [remoteHost, remoteUser, remotePassword, deviceGroup]);
        }.bind(this))
        .then(function() {
            // Check to see if we're already in the remote group
            return remoteBigIp.list(DEVICE_GROUP_PATH + '~Common~' + deviceGroup + '/devices');
        }.bind(this))
        .then(function(response) {
            var containsLocalHost = function(devices) {
                return devices.findIndex(function(element) {
                    return element.name.indexOf(localHostname) !== -1;
                }) >= 0 ? true : false;
            };

            if (response.length === 0 || !containsLocalHost(response)) {
                return remoteBigIp.create(
                    DEVICE_GROUP_PATH + '~Common~' + deviceGroup + '/devices',
                    {
                        name: localHostname
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

module.exports = BigIpCluster;
