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
const GtmDnsProvider = require('../../../f5-cloud-libs').gtmDnsProvider;

const bigIpMock = {
    init: function() {
        functionCalls.bigIp.init = arguments;
        return q();
    },
    ready: function() {
        return q();
    },
    gtm: {
        updateServer: function() {
            functionCalls.bigIp.gtm.updateServer = arguments;
        },
        updatePool: function() {
            functionCalls.bigIp.gtm.updatePool = arguments;
        },
        setPartition: function() {
            functionCalls.bigIp.gtm.setPartition = arguments;
        }
    }
};

var gtmDnsProvider;
var functionCalls;

module.exports = {
    setUp: function(callback) {
        functionCalls = {
            bigIp: {
                gtm: {}
            }
        };

        gtmDnsProvider = new GtmDnsProvider();
        gtmDnsProvider.bigIp = bigIpMock;
        callback();
    },

    testBigipInit: function(test) {
        var providerOptions = {
            host: 'myHost',
            user: 'myUser',
            password: 'myPassword',
            serverName: 'myServer',
            poolName: 'myPool',
            port: '1234',
            passwordEncrypted: true
        };

        test.expect(4);
        gtmDnsProvider.init(providerOptions)
            .then(function() {
                return gtmDnsProvider.update();
            })
            .then(function() {
                test.strictEqual(functionCalls.bigIp.init[0], 'myHost');
                test.strictEqual(functionCalls.bigIp.init[1], 'myUser');
                test.strictEqual(functionCalls.bigIp.init[2], 'myPassword');
                test.deepEqual(functionCalls.bigIp.init[3], {
                    port: '1234',
                    passwordIsUrl: false,
                    passwordEncrypted: true
                });
            })
            .catch(function(err) {
                test.ok(false, err);
            })
            .finally(function() {
                test.done();
            });
    },

    testUpdateServerAndPool: function(test) {
        var instances = {
            1: 'one',
            2: 'two'
        };

        var providerOptions = {
            host: 'myHost',
            user: 'myUser',
            password: 'myPassword',
            serverName: 'myServer',
            poolName: 'myPool',
            port: '1234',
            passwordEncrypted: true
        };

        test.expect(5);
        gtmDnsProvider.init(providerOptions)
            .then(function() {
                return gtmDnsProvider.update(instances);
            })
            .then(function() {
                test.strictEqual(functionCalls.bigIp.gtm.updateServer[0], 'myServer');
                test.deepEqual(functionCalls.bigIp.gtm.updateServer[1], instances);
                test.strictEqual(functionCalls.bigIp.gtm.updatePool[0], 'myPool');
                test.strictEqual(functionCalls.bigIp.gtm.updatePool[1], 'myServer');
                test.strictEqual(functionCalls.bigIp.gtm.updatePool[2], instances);
            })
            .catch(function(err) {
                test.ok(false, err);
            })
            .finally(function() {
                test.done();
            });
    },

    testOptions: function(test) {
        var instances = {
            1: 'one',
            2: 'two'
        };

        var providerOptions = {
            host: 'myHost',
            user: 'myUser',
            password: 'myPassword',
            serverName: 'myServer',
            poolName: 'myPool',
            datacenter: 'myDatacenter',
            vsMonitor: 'myVsMonitor',
            poolMonitor: 'myPoolMonitor',
            loadBalancingMode: 'myLoadBalancingMode',
            partition: 'myPartition'
        };

        test.expect(3);
        gtmDnsProvider.init(providerOptions)
            .then(function() {
                return gtmDnsProvider.update(instances);
            })
            .then(function() {
                test.deepEqual(functionCalls.bigIp.gtm.updateServer[2], {
                    datacenter: 'myDatacenter',
                    monitor: 'myVsMonitor'
                });
                test.deepEqual(functionCalls.bigIp.gtm.updatePool[3], {
                    loadBalancingMode: 'myLoadBalancingMode',
                    monitor: 'myPoolMonitor'
                });
                test.strictEqual(functionCalls.bigIp.gtm.setPartition[0], 'myPartition');
            })
            .catch(function(err) {
                test.ok(false, err);
            })
            .finally(function() {
                test.done();
            });
    }
};