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

var authnMock;
var utilMock;
var ipcMock;
var argv;
var network;

var functionsCalled;
var exitMessage;
var exitCode;

module.exports = {
    setUp: function (callback) {
        bigIp = new BigIp();
        testOptions = {
            bigIp: bigIp
        };

        ipcMock = require('../../lib/ipc');

        ipcMock.once = function () {
            var deferred = q.defer();
            functionsCalled.ipc.once = arguments;
            return deferred.promise;
        };

        functionsCalled = {
            ipc: {}
        };

        utilMock = require('../../../f5-cloud-libs').util;
        utilMock.logAndExit = function (message, level, code) {
            exitMessage = message;
            exitCode = code;
        };
        exitCode = undefined;

        network = require('../../scripts/network');
        argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

        authnMock = require('../../../f5-cloud-libs').authn;
        authnMock.authenticate = function (host, user, password) {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        };
        icontrolMock.when(
            'list',
            '/shared/identified-devices/config/device-info',
            {
                product: 'BIG-IP'
            }
        );
        bigIp.ready = function () {
            return q();
        };

        // we have to call init so we can wait till it's done to set icontrol
        bigIp.init('host', 'user', 'password')
            .then(function () {
                bigIp.icontrol = icontrolMock;
                icontrolMock.reset();
                callback();
            });
    },

    tearDown: function (callback) {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach(function (key) {
            delete require.cache[key];
        });
        callback();
    },

    testRequiredOptions: {
        testNoHost: function (test) {
            argv = ['node', 'onboard', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

            test.expect(2);
            network.run(argv, testOptions, function () {
                test.notStrictEqual(exitMessage.indexOf('host'), -1);
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testNoPassword: function (test) {
            argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '--log-level', 'none'];

            test.expect(2);
            network.run(argv, testOptions, function () {
                test.notStrictEqual(exitMessage.indexOf('password'), -1);
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testSingleAndMultiNic: function (test) {
            argv.push('--single-nic', '--multi-nic');

            test.expect(1);
            network.run(argv, testOptions, function () {
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testWaitFor: function (test) {
        argv.push('--wait-for', 'foo');

        ipcMock.once = function () {
            functionsCalled.ipc.once = arguments;
            return q();
        };

        test.expect(1);
        network.run(argv, testOptions, function () {
            test.strictEqual(functionsCalled.ipc.once[0], 'foo');
            test.done();
        });
    },

    testBackground: function (test) {
        var runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = function () {
            runInBackgroundCalled = true;
        };

        argv.push('--background');

        test.expect(1);
        network.run(argv, testOptions, function () {
            test.ok(runInBackgroundCalled);
            test.done();
        });
    },

    testNoUser: function (test) {
        argv = ['node', 'network', '--host', '1.2.3.4', '-p', 'bar', '--log-level', 'none'];

        const randomUser = 'my random user';
        let userCreated;
        let userDeleted;
        utilMock.createRandomUser = function () {
            userCreated = true;
            return q({
                user: randomUser
            });
        }
        utilMock.deleteUser = function (user) {
            userDeleted = user;
        }

        test.expect(2);
        network.run(argv, testOptions, function () {
            test.ok(userCreated);
            test.strictEqual(userDeleted, randomUser);
            test.done();
        });
    },

    testSingleNic: {
        testBasic: function (test) {
            argv.push('--single-nic');
            test.expect(3);
            network.run(argv, testOptions, function () {
                test.deepEqual(
                    icontrolMock.getRequest('modify', '/tm/sys/db/provision.1nic'),
                    { value: 'enable' }
                );
                test.deepEqual(
                    icontrolMock.getRequest('modify', '/tm/sys/db/provision.1nicautoconfig'),
                    { value: 'disable' });
                test.deepEqual(
                    icontrolMock.getRequest('create', '/tm/util/bash'),
                    {
                        command: "run",
                        utilCmdArgs: "-c 'bigstart restart'"
                    }
                );
                test.done();
            });
        }
    },

    testDefaultRoute: {
        testBasic: function (test) {
            argv.push('--default-gw', '1.2.3.4');
            test.expect(1);
            network.run(argv, testOptions, function () {
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

        testLocalOnly: function (test) {
            argv.push('--default-gw', '1.2.3.4', '--local-only');
            test.expect(1);
            network.run(argv, testOptions, function () {
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
        },

        testBadGateway: function (test) {
            argv.push('--default-gw', 'aaa.com');
            icontrolMock.fail(
                'create',
                '/tm/net/route',
                {
                    code: 400,
                    message: 'foo'
                }
            );

            test.expect(1);
            network.run(argv, testOptions, function () {
                var request = icontrolMock.getRequest('create', '/tm/net/route');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testRoute: {
        testBasic: function (test) {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.1.0.0');
            test.expect(1);
            network.run(argv, testOptions, function () {
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

        testCidr: function (test) {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.0.0.0/32');
            test.expect(1);
            network.run(argv, testOptions, function () {
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
        },

        testBadRoute: function (test) {
            argv.push('--route', 'name:routename,gw:1.2.3.4,network:networkname');
            icontrolMock.fail(
                'create',
                '/tm/net/route',
                {
                    code: 400,
                    message: 'foo'
                }
            )
            test.expect(1);
            network.run(argv, testOptions, function () {
                var request = icontrolMock.getRequest('create', '/tm/net/route');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testManagementRoute: function (test) {
        argv.push('--mgmt-route', 'name:foo, gw:1.2.3.4, network:10.1.0.0');
        test.expect(1);
        network.run(argv, testOptions, function () {
            var request = icontrolMock.getRequest('create', '/tm/sys/management-route');
            test.deepEqual(
                request,
                {
                    name: 'foo',
                    gateway: '1.2.3.4',
                    network: '10.1.0.0/24'
                }
            );
            test.done();
        });
    },

    testVlan: {
        testBasic: function (test) {
            argv.push('--vlan', 'name:foo,nic:1.1');
            test.expect(1);
            network.run(argv, testOptions, function () {
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

        testTagMtu: function (test) {
            argv.push('--vlan', 'name:foo,nic:1.1,tag:1040,mtu:600');
            test.expect(1);
            network.run(argv, testOptions, function () {
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

        testBadNicName: function (test) {
            argv.push('--vlan', 'name:vlanname,nic:nicname');
            test.expect(1);
            icontrolMock.fail(
                'create',
                '/tm/net/vlan',
                {
                    code: 400,
                    message: 'foo'
                }
            )

            network.run(argv, testOptions, function () {
                var request = icontrolMock.getRequest('create', '/tm/net/vlan');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testSelfIp: {
            testBasic: function (test) {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar');
                test.expect(1);
                network.run(argv, testOptions, function () {
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

            testCidr: function (test) {
                argv.push('--self-ip', 'name:foo, address:1.2.0.0/16, vlan:bar');
                test.expect(1);
                network.run(argv, testOptions, function () {
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

            testTrafficGroup: {
                testExistingTrafficGroup: function (test) {
                    argv.push('--self-ip', 'name:selfip1, address:1.2.3.4/24, vlan:external, trafficGroup:group1');

                    icontrolMock.when(
                        'list',
                        '/tm/cm/traffic-group',
                        [
                            { name: 'traffic-group-local-only' },
                            { name: 'group1' }

                        ]
                    );

                    test.expect(2);
                    network.run(argv, testOptions, function () {
                        const trafficGroupRequest = icontrolMock.getRequest('create', '/tm/cm/traffic-group');
                        const selfIpRequest = icontrolMock.getRequest('create', '/tm/net/self');
                        test.strictEqual(trafficGroupRequest, undefined);
                        test.deepEqual(
                            selfIpRequest,
                            {
                                address: '1.2.3.4/24',
                                name: 'selfip1',
                                vlan: '/Common/external',
                                allowService: 'default',
                                trafficGroup: 'group1'
                            }
                        );
                        test.done();
                    });
                },

                testNewTrafficGroup: function (test) {
                    argv.push('--self-ip', 'name:selfip1, address:1.2.3.4/24, vlan:external, trafficGroup:group1');

                    icontrolMock.when(
                        'list',
                        '/tm/cm/traffic-group',
                        [
                            { name: 'traffic-group-local-only' }
                        ]
                    );

                    test.expect(3);
                    network.run(argv, testOptions, function () {
                        const selfIpRequest = icontrolMock.getRequest('create', '/tm/net/self');
                        const trafficGroupRequest = icontrolMock.getRequest('create', '/tm/cm/traffic-group');
                        test.deepEqual(
                            selfIpRequest,
                            {
                                address: '1.2.3.4/24',
                                name: 'selfip1',
                                vlan: '/Common/external',
                                allowService: 'default',
                                trafficGroup: 'group1'
                            }
                        );
                        test.strictEqual(trafficGroupRequest.name, 'group1');
                        test.strictEqual(trafficGroupRequest.partition, '/Common');
                        test.done();
                    });
                },
            },
            testPortLockdown: {
                testSpecificSingle: function (test) {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:hello:5678');
                    test.expect(1);
                    network.run(argv, testOptions, function () {
                        var request = icontrolMock.getRequest('create', '/tm/net/self');
                        test.deepEqual(
                            request,
                            {
                                name: 'foo',
                                address: '1.2.3.4/24',
                                vlan: '/Common/bar',
                                allowService: ['hello:5678']
                            }
                        );
                        test.done();
                    });
                },

                testSpecificMultiple: function (test) {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:hello:5678 world:9876');
                    test.expect(1);
                    network.run(argv, testOptions, function () {
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
                },

                testSpecificPlusDefault: function (test) {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:default world:9876');
                    test.expect(1);
                    network.run(argv, testOptions, function () {
                        var request = icontrolMock.getRequest('create', '/tm/net/self');
                        test.deepEqual(
                            request,
                            {
                                name: 'foo',
                                address: '1.2.3.4/24',
                                vlan: '/Common/bar',
                                allowService: ['default', 'world:9876']
                            }
                        );
                        test.done();
                    });
                },

                testGeneral: function (test) {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:all');
                    test.expect(1);
                    network.run(argv, testOptions, function () {
                        var request = icontrolMock.getRequest('create', '/tm/net/self');
                        test.deepEqual(
                            request,
                            {
                                name: 'foo',
                                address: '1.2.3.4/24',
                                vlan: '/Common/bar',
                                allowService: 'all'
                            }
                        );
                        test.done();
                    });
                }
            },

            testMissingVlan: function (test) {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4');

                test.expect(1);
                network.run(argv, testOptions, function () {
                    test.strictEqual(exitCode, 1);
                    test.done();
                });
            }
        }
    },

    testForceReboot: function (test) {
        var strippedArgs;
        var rebootCalled;
        utilMock.saveArgs = function (args, id, argsToStrip) {
            strippedArgs = argsToStrip;
            return q();
        };
        utilMock.reboot = function () {
            rebootCalled = true;
            return q();
        };

        argv.push('--force-reboot');

        test.expect(3);
        network.run(argv, testOptions, function () {
            test.strictEqual(rebootCalled, true);
            test.notStrictEqual(strippedArgs.indexOf('--force-reboot'), -1);
            test.notStrictEqual(strippedArgs.indexOf('--wait-for'), -1);
            test.done();
        });
    }
};
