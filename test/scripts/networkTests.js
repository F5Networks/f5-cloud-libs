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

const q = require('q');
const BigIp = require('../../../f5-cloud-libs').bigIp;
const icontrolMock = require('../testUtil/icontrolMock');
const signals = require('../../../f5-cloud-libs').signals;

let bigIp;
let testOptions;

let authnMock;
let utilMock;
let ipcMock;
let argv;
let network;

let functionsCalled;
let exitMessage;
let exitCode;
let logErrorMessage;
let logErrorOptions;

module.exports = {
    setUp(callback) {
        bigIp = new BigIp();
        testOptions = {
            bigIp
        };

        /* eslint-disable global-require */
        ipcMock = require('../../lib/ipc');

        ipcMock.once = function once(...args) {
            const deferred = q.defer();
            functionsCalled.ipc.once = args;
            return deferred.promise;
        };

        functionsCalled = {
            ipc: {}
        };

        utilMock = require('../../../f5-cloud-libs').util;
        utilMock.logAndExit = (message, level, code) => {
            exitMessage = message;
            exitCode = code;
        };
        utilMock.logError = (message, options) => {
            logErrorMessage = message;
            logErrorOptions = options;
        };
        utilMock.getProductString = function getProductString() {
            return q('BIG-IP');
        };
        exitCode = undefined;

        network = require('../../scripts/network');
        argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

        authnMock = require('../../../f5-cloud-libs').authn;
        authnMock.authenticate = (host, user, password) => {
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
        bigIp.ready = () => {
            return q();
        };

        // we have to call init so we can wait till it's done to set icontrol
        bigIp.init('host', 'user', 'password')
            .then(() => {
                bigIp.icontrol = icontrolMock;
                icontrolMock.reset();
                callback();
            });
    },

    tearDown(callback) {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },

    testRequiredOptions: {
        testNoHost(test) {
            argv = ['node', 'onboard', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

            test.expect(4);
            network.run(argv, testOptions, () => {
                test.notStrictEqual(exitMessage.indexOf('host'), -1);
                test.notStrictEqual(logErrorMessage.indexOf('host'), -1);
                test.strictEqual(logErrorOptions.logLevel, 'none');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testNoPassword(test) {
            argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '--log-level', 'none'];

            test.expect(4);
            network.run(argv, testOptions, () => {
                test.notStrictEqual(exitMessage.indexOf('password'), -1);
                test.notStrictEqual(logErrorMessage.indexOf('password'), -1);
                test.strictEqual(logErrorOptions.logLevel, 'none');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testSingleAndMultiNic(test) {
            argv.push('--single-nic', '--multi-nic');

            test.expect(1);
            network.run(argv, testOptions, () => {
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testUndefinedOptions: {
        testNoPassword(test) {
            const passwordUrl = 'https://password';
            argv = ['node', 'network', '--log-level', 'none', '--password-url', passwordUrl,
                '-u', 'user', '--password', '--host', 'localhost'];

            network.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(network.options.passwordUrl, passwordUrl);
                test.strictEqual(network.options.password, undefined);
                test.done();
            });
        },

        testNoPasswordUrl(test) {
            const password = 'password';
            argv = ['node', 'network', '--log-level', 'none', '--password-url', '-u', 'user',
                '--password', password, '--host', 'localhost'];

            network.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(network.options.passwordUrl, undefined);
                test.strictEqual(network.options.password, password);
                test.done();
            });
        }
    },

    testWaitFor(test) {
        argv.push('--wait-for', 'foo');

        ipcMock.once = function once(...args) {
            functionsCalled.ipc.once = args;
            return q();
        };

        test.expect(1);
        network.run(argv, testOptions, () => {
            test.strictEqual(functionsCalled.ipc.once[0], 'foo');
            test.done();
        });
    },

    testBackground(test) {
        let runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = () => {
            runInBackgroundCalled = true;
        };

        argv.push('--background');

        test.expect(1);
        network.run(argv, testOptions, () => {
            test.ok(runInBackgroundCalled);
            test.done();
        });
    },

    testExceptionSignalsError(test) {
        const sentSignals = [];

        utilMock.createRandomUser = () => {
            return q.reject('err');
        };

        argv = ['node', 'network', '--host', '1.2.3.4', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.includes(signal)) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        test.expect(1);
        network.run(argv, testOptions, () => {
            test.deepEqual(sentSignals, [signals.NETWORK_RUNNING, signals.CLOUD_LIBS_ERROR]);
            test.done();
        });
    },

    testSignalDone(test) {
        const sentSignals = [];

        argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.includes(signal)) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        test.expect(2);
        network.run(argv, testOptions, () => {
            test.deepEqual(sentSignals, [signals.NETWORK_RUNNING, signals.NETWORK_DONE]);
            test.ok(!sentSignals.includes(signals.CLOUD_LIBS_ERROR), 'Done should not include error');
            test.done();
        });
    },

    testNoUser(test) {
        argv = ['node', 'network', '--host', '1.2.3.4', '-p', 'bar', '--log-level', 'none'];

        const randomUser = 'my random user';
        let userCreated;
        let userDeleted;
        utilMock.createRandomUser = () => {
            userCreated = true;
            return q({
                user: randomUser
            });
        };
        utilMock.deleteUser = (user) => {
            userDeleted = user;
        };

        test.expect(2);
        network.run(argv, testOptions, () => {
            test.ok(userCreated);
            test.strictEqual(userDeleted, randomUser);
            test.done();
        });
    },

    testSingleNic: {
        testBasic(test) {
            argv.push('--single-nic');
            test.expect(3);
            network.run(argv, testOptions, () => {
                test.deepEqual(
                    icontrolMock.getRequest('modify', '/tm/sys/db/provision.1nic'),
                    { value: 'enable' }
                );
                test.deepEqual(
                    icontrolMock.getRequest('modify', '/tm/sys/db/provision.1nicautoconfig'),
                    { value: 'disable' }
                );
                test.deepEqual(
                    icontrolMock.getRequest('create', '/tm/util/bash'),
                    {
                        command: 'run',
                        utilCmdArgs: "-c 'bigstart restart'"
                    }
                );
                test.done();
            });
        }
    },

    testDefaultRoute: {
        testBasic(test) {
            argv.push('--default-gw', '1.2.3.4');
            test.expect(1);
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
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

        testLocalOnly(test) {
            argv.push('--default-gw', '1.2.3.4', '--local-only');
            test.expect(1);
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
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

        testBadGateway(test) {
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
            network.run(argv, testOptions, () => {
                // eslint-disable-next-line no-unused-vars
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testRoute: {
        testBasic(test) {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.1.0.0');
            test.expect(1);
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
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

        testCidr(test) {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.0.0.0/32');
            test.expect(1);
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
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

        testBadRoute(test) {
            argv.push('--route', 'name:routename,gw:1.2.3.4,network:networkname');
            icontrolMock.fail(
                'create',
                '/tm/net/route',
                {
                    code: 400,
                    message: 'foo'
                }
            );
            test.expect(1);
            network.run(argv, testOptions, () => {
                // eslint-disable-next-line no-unused-vars
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testManagementRoute(test) {
        argv.push('--mgmt-route', 'name:foo, gw:1.2.3.4, network:10.1.0.0');
        test.expect(1);
        network.run(argv, testOptions, () => {
            const request = icontrolMock.getRequest('create', '/tm/sys/management-route');
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
        testBasic(test) {
            argv.push('--vlan', 'name:foo,nic:1.1');
            test.expect(1);
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/vlan');
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

        testTagMtu(test) {
            argv.push('--vlan', 'name:foo,nic:1.1,tag:1040,mtu:600');
            test.expect(1);
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/vlan');
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

        testBadNicName(test) {
            argv.push('--vlan', 'name:vlanname,nic:nicname');
            test.expect(1);
            icontrolMock.fail(
                'create',
                '/tm/net/vlan',
                {
                    code: 400,
                    message: 'foo'
                }
            );

            network.run(argv, testOptions, () => {
                // eslint-disable-next-line no-unused-vars
                const request = icontrolMock.getRequest('create', '/tm/net/vlan');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testSelfIp: {
            testBasic(test) {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar');
                test.expect(1);
                network.run(argv, testOptions, () => {
                    const request = icontrolMock.getRequest('create', '/tm/net/self');
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

            testCidr(test) {
                argv.push('--self-ip', 'name:foo, address:1.2.0.0/16, vlan:bar');
                test.expect(1);
                network.run(argv, testOptions, () => {
                    const request = icontrolMock.getRequest('create', '/tm/net/self');
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
                testExistingTrafficGroup(test) {
                    argv.push('--self-ip',
                        'name:selfip1, address:1.2.3.4/24, vlan:external, trafficGroup:group1');

                    icontrolMock.when(
                        'list',
                        '/tm/cm/traffic-group',
                        [
                            { name: 'traffic-group-local-only' },
                            { name: 'group1' }

                        ]
                    );

                    test.expect(2);
                    network.run(argv, testOptions, () => {
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

                testNewTrafficGroup(test) {
                    argv.push('--self-ip',
                        'name:selfip1, address:1.2.3.4/24, vlan:external, trafficGroup:group1');

                    icontrolMock.when(
                        'list',
                        '/tm/cm/traffic-group',
                        [
                            { name: 'traffic-group-local-only' }
                        ]
                    );

                    test.expect(3);
                    network.run(argv, testOptions, () => {
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
                testSpecificSingle(test) {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:hello:5678');
                    test.expect(1);
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
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

                testSpecificMultiple(test) {
                    argv.push('--self-ip',
                        'name:foo, address:1.2.3.4, vlan:bar, allow:hello:5678 world:9876');
                    test.expect(1);
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
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

                testSpecificPlusDefault(test) {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:default world:9876');
                    test.expect(1);
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
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

                testGeneral(test) {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:all');
                    test.expect(1);
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
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

            testMissingVlan(test) {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4');

                test.expect(1);
                network.run(argv, testOptions, () => {
                    test.strictEqual(exitCode, 1);
                    test.done();
                });
            }
        }
    },

    testForceReboot(test) {
        let strippedArgs;
        let rebootCalled;
        utilMock.saveArgs = (args, id, argsToStrip) => {
            strippedArgs = argsToStrip;
            return q();
        };
        utilMock.reboot = () => {
            rebootCalled = true;
            return q();
        };

        argv.push('--force-reboot');

        test.expect(3);
        network.run(argv, testOptions, () => {
            test.strictEqual(rebootCalled, true);
            test.notStrictEqual(strippedArgs.indexOf('--force-reboot'), -1);
            test.notStrictEqual(strippedArgs.indexOf('--wait-for'), -1);
            test.done();
        });
    }
};
