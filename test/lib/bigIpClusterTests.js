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
var BigIp = require('../../lib/bigIp');
var icontrolMock = require('../testUtil/icontrolMock');

var bigIp = new BigIp('host', 'user', 'password', {icontrol: icontrolMock});
bigIp.ready = function() {
    return q();
};

module.exports = {
    testCreateDeviceGroup: {
        testDefaults: function(test) {
            var name = 'groupFoo';
            var type = 'sync-failover';
            var devices =['device1', 'device2'];

            bigIp.cluster.createDeviceGroup(name, type, devices)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group');
                    test.strictEqual(icontrolMock.lastCall.body.name, name);
                    test.strictEqual(icontrolMock.lastCall.body.type, type);
                    test.strictEqual(icontrolMock.lastCall.body.devices, devices);
                    test.strictEqual(icontrolMock.lastCall.body.autoSync, 'disabled');
                    test.strictEqual(icontrolMock.lastCall.body.fullSync, 'disabled');
                    test.strictEqual(icontrolMock.lastCall.body.asmSync, 'disabled');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                    test.done();
                })
                .finally(function() {
                    test.done();
                });
        },

        testFull: function(test) {
            var name = 'groupFoo';
            var type = 'sync-failover';
            var devices =['device1', 'device2'];
            var autoSync = true;
            var saveOnAutoSync = true;
            var networkFailover = true;
            var fullSync = true;
            var asmSync = true;

            bigIp.cluster.createDeviceGroup(name, type, devices, autoSync, saveOnAutoSync, networkFailover, fullSync, asmSync)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group');
                    test.strictEqual(icontrolMock.lastCall.body.name, name);
                    test.strictEqual(icontrolMock.lastCall.body.type, type);
                    test.strictEqual(icontrolMock.lastCall.body.devices, devices);
                    test.strictEqual(icontrolMock.lastCall.body.autoSync, 'enabled');
                    test.strictEqual(icontrolMock.lastCall.body.fullSync, 'enabled');
                    test.strictEqual(icontrolMock.lastCall.body.asmSync, 'enabled');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                    test.done();
                })
                .finally(function() {
                    test.done();
                });
        },

        testBadType: function(test) {
            bigIp.cluster.createDeviceGroup('abc', 'foo')
                .then(function() {
                    test.ok(false, 'Should have thrown bad type');
                })
                .catch(function(err) {
                    test.notEqual(err.message.indexOf('type must be'), -1);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};