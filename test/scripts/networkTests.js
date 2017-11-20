/**
 * Copyright 2017 F5 Networks, Inc.
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
var BigIp = require('../../../f5-cloud-libs').bigIp;
var icontrolMock = require('../testUtil/icontrolMock');
var bigIp;
var testOptions;

var ipc;
var argv;
var network;

// Don't let network exit - we need the nodeunit process to run to completion
process.exit = function() {};

module.exports = {
    setUp: function(callback) {
        bigIp = new BigIp();
        testOptions = {
            bigIp: bigIp
        };

        ipc = require('../../lib/ipc');

        // Just resolve right away, otherwise these tests never exit
        ipc.once = function() {
            var deferred = q.defer();
            deferred.resolve();
            return deferred.promise;
        };

        network = require('../../scripts/network');
        argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

        // we have to call init so we can wait till it's done to set icontrol
        bigIp.init('host', 'user', 'password')
            .then(function() {
                bigIp.icontrol = icontrolMock;
                bigIp.ready = function() {
                    return q();
                };
                icontrolMock.reset();
                callback();
            });
    },

    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });
        callback();
    },

    testDefaultRoute: {
        testBasic: function(test) {
            argv.push('--default-gw', '1.2.3.4');
            network.run(argv, testOptions, function() {
                var request = icontrolMock.getRequest('create', '/tm/net/route');
                test.deepEqual(
                    request,
                    {
                        name: 'default',
                        gw: '1.2.3.4'
                    }
                );
                test.done();
            });
        },

        testLocalOnly: function(test) {
            argv.push('--default-gw', '1.2.3.4', '--local-only');
            network.run(argv, testOptions, function() {
                var request = icontrolMock.getRequest('create', '/tm/net/route');
                test.deepEqual(
                    request,
                    {
                        name: 'default',
                        gw: '1.2.3.4',
                        partition: 'LOCAL_ONLY',
                        network: 'default'
                    }
                );
                test.done();
            });
        }
    },

    testRoute: {
        testBasic: function(test) {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.1.0.0');
            network.run(argv, testOptions, function() {
                var request = icontrolMock.getRequest('create', '/tm/net/route');
                test.deepEqual(
                    request,
                    {
                        name: 'foo',
                        gw: '1.2.3.4',
                        network: '10.1.0.0/24'
                    }
                );
                test.done();
            });
        },

        testCidr: function(test) {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.0.0.0/32');
            network.run(argv, testOptions, function() {
                var request = icontrolMock.getRequest('create', '/tm/net/route');
                test.deepEqual(
                    request,
                    {
                        name: 'foo',
                        gw: '1.2.3.4',
                        network: '10.0.0.0/32'
                    }
                );
                test.done();
            });
        }
    },

    testVlan: {
        testBasic: function(test) {
            argv.push('--vlan', 'name:foo,nic:1.1');
            network.run(argv, testOptions, function() {
                var request = icontrolMock.getRequest('create', '/tm/net/vlan');
                test.deepEqual(
                    request,
                    {
                        name: 'foo',
                        interfaces: [
                            {
                                name: '1.1',
                                tagged: false
                            }
                        ]
                    }
                );
                test.done();
            });
        },

        testTagMtu: function(test) {
            argv.push('--vlan', 'name:foo,nic:1.1,tag:1040,mtu:600');
            network.run(argv, testOptions, function() {
                var request = icontrolMock.getRequest('create', '/tm/net/vlan');
                test.deepEqual(
                    request,
                    {
                        name: 'foo',
                        interfaces: [
                            {
                                name: '1.1',
                                tagged: true
                            }
                        ],
                        tag: '1040',
                        mtu: '600'
                    }
                );
                test.done();
            });
        },

        testSelfIp: {
            testBasic: function(test) {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar');
                network.run(argv, testOptions, function() {
                    var request = icontrolMock.getRequest('create', '/tm/net/self');
                    test.deepEqual(
                        request,
                        {
                            name: 'foo',
                            address: '1.2.3.4/24',
                            vlan: '/Common/bar',
                            allowService: 'default'
                        }
                    );
                    test.done();
                });
            },

            testCidr: function(test) {
                argv.push('--self-ip', 'name:foo, address:1.2.0.0/16, vlan:bar');
                network.run(argv, testOptions, function() {
                    var request = icontrolMock.getRequest('create', '/tm/net/self');
                    test.deepEqual(
                        request,
                        {
                            name: 'foo',
                            address: '1.2.0.0/16',
                            vlan: '/Common/bar',
                            allowService: 'default'
                        }
                    );
                    test.done();
                });
            },

            testPortLockdown: function(test) {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:hello:5678 world:9876');
                network.run(argv, testOptions, function() {
                    var request = icontrolMock.getRequest('create', '/tm/net/self');
                    test.deepEqual(
                        request,
                        {
                            name: 'foo',
                            address: '1.2.3.4/24',
                            vlan: '/Common/bar',
                            allowService: ['hello:5678', 'world:9876']
                        }
                    );
                    test.done();
                });
            }
        }
    }
};
