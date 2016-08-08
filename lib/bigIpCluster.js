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

/**
 * Provides onboarding functionality to a base BigIp objectn
 *
 * @param {Object} bigIpCore - Base BigIp object.
 */
function BigIpCluster(bigIpCore) {
    this.core = bigIpCore;
}

BigIpCluster.prototype.addToTrust = function() {

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

            return this.core.create('/tm/cm/device-group', groupSettings);
        }.bind(this));
};

module.exports = BigIpCluster;
