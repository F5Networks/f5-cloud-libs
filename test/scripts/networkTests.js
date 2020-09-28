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
const assert = require('assert');

describe('network tests', () => {
    let bigIp;
    let testOptions;

    let authnMock;
    let cryptoUtilMock;
    let utilMock;
    let ipcMock;
    let argv;
    let network;
    let BigIp;
    let icontrolMock;
    let signals;

    let functionsCalled;
    let exitMessage;
    let exitCode;
    let logErrorMessage;
    let logErrorOptions;

    beforeEach((done) => {
        /* eslint-disable global-require */
        BigIp = require('../../../f5-cloud-libs').bigIp;
        icontrolMock = require('../testUtil/icontrolMock');
        signals = require('../../../f5-cloud-libs').signals;
        ipcMock = require('../../lib/ipc');

        bigIp = new BigIp();
        testOptions = {
            bigIp
        };

        ipcMock.once = function once() {
            const deferred = q.defer();
            functionsCalled.ipc.once = arguments;
            return deferred.promise;
        };

        functionsCalled = {
            ipc: {}
        };

        cryptoUtilMock = require('../../../f5-cloud-libs').cryptoUtil;
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
                done();
            });
    });

    afterEach(() => {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('required options tests', () => {
        it('no host test', (done) => {
            argv = ['node', 'onboard', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

            network.run(argv, testOptions, () => {
                assert.notStrictEqual(exitMessage.indexOf('host'), -1);
                assert.notStrictEqual(logErrorMessage.indexOf('host'), -1);
                assert.strictEqual(logErrorOptions.logLevel, 'none');
                assert.strictEqual(exitCode, 1);
                done();
            });
        });

        it('no password test', (done) => {
            argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '--log-level', 'none'];

            network.run(argv, testOptions, () => {
                assert.notStrictEqual(exitMessage.indexOf('password'), -1);
                assert.notStrictEqual(logErrorMessage.indexOf('password'), -1);
                assert.strictEqual(logErrorOptions.logLevel, 'none');
                assert.strictEqual(exitCode, 1);
                done();
            });
        });

        it('single and multi nic test', (done) => {
            argv.push('--single-nic', '--multi-nic');

            network.run(argv, testOptions, () => {
                assert.strictEqual(exitCode, 1);
                done();
            });
        });
    });

    describe('undefined options tests', () => {
        it('no password test', (done) => {
            const passwordUrl = 'https://password';
            argv = ['node', 'network', '--log-level', 'none', '--password-url', passwordUrl,
                '-u', 'user', '--password', '--host', 'localhost'];

            network.run(argv, testOptions, () => {
                assert.strictEqual(network.options.passwordUrl, passwordUrl);
                assert.strictEqual(network.options.password, undefined);
                done();
            });
        });

        it('no password url test', (done) => {
            const password = 'password';
            argv = ['node', 'network', '--log-level', 'none', '--password-url', '-u', 'user',
                '--password', password, '--host', 'localhost'];

            network.run(argv, testOptions, () => {
                assert.strictEqual(network.options.passwordUrl, undefined);
                assert.strictEqual(network.options.password, password);
                done();
            });
        });
    });

    it('wait for test', (done) => {
        argv.push('--wait-for', 'foo');

        ipcMock.once = function once() {
            functionsCalled.ipc.once = arguments;
            return q();
        };

        network.run(argv, testOptions, () => {
            assert.strictEqual(functionsCalled.ipc.once[0], 'foo');
            done();
        });
    });

    it('background test', (done) => {
        let runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = () => {
            runInBackgroundCalled = true;
        };

        argv.push('--background');

        network.run(argv, testOptions, () => {
            assert.ok(runInBackgroundCalled);
            done();
        });
    });

    it('exception signals error test', (done) => {
        const sentSignals = [];

        cryptoUtilMock.createRandomUser = () => {
            return q.reject('err');
        };

        argv = ['node', 'network', '--host', '1.2.3.4', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.indexOf(signal) > -1) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        network.run(argv, testOptions, () => {
            assert.deepEqual(sentSignals, [signals.NETWORK_RUNNING, signals.CLOUD_LIBS_ERROR]);
            done();
        });
    });

    it('signal done test', (done) => {
        const sentSignals = [];

        argv = ['node', 'network', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.indexOf(signal) > -1) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        network.run(argv, testOptions, () => {
            assert.deepEqual(sentSignals, [signals.NETWORK_RUNNING, signals.NETWORK_DONE]);
            assert.strictEqual(sentSignals.indexOf(signals.CLOUD_LIBS_ERROR), -1);
            done();
        });
    });

    it('no user test', (done) => {
        argv = ['node', 'network', '--host', '1.2.3.4', '-p', 'bar', '--log-level', 'none'];

        const randomUser = 'my random user';
        let userCreated;
        let userDeleted;
        cryptoUtilMock.createRandomUser = () => {
            userCreated = true;
            return q({
                user: randomUser
            });
        };
        utilMock.deleteUser = (user) => {
            userDeleted = user;
        };

        network.run(argv, testOptions, () => {
            assert.ok(userCreated);
            assert.strictEqual(userDeleted, randomUser);
            done();
        });
    });

    describe('single nic tests', () => {
        it('basic test', (done) => {
            argv.push('--single-nic');
            network.run(argv, testOptions, () => {
                assert.deepEqual(
                    icontrolMock.getRequest('modify', '/tm/sys/db/provision.1nic'),
                    { value: 'enable' }
                );
                assert.deepEqual(
                    icontrolMock.getRequest('modify', '/tm/sys/db/provision.1nicautoconfig'),
                    { value: 'disable' }
                );
                assert.deepEqual(
                    icontrolMock.getRequest('create', '/tm/util/bash'),
                    {
                        command: 'run',
                        utilCmdArgs: "-c 'bigstart restart'"
                    }
                );
                done();
            });
        });
    });

    describe('default route tests', () => {
        it('basic test', (done) => {
            argv.push('--default-gw', '1.2.3.4');
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                assert.deepEqual(
                    request,
                    {
                        name: 'default',
                        gw: '1.2.3.4'
                    }
                );
                done();
            });
        });

        it('local only test', (done) => {
            argv.push('--default-gw', '1.2.3.4', '--local-only');
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                assert.deepEqual(
                    request,
                    {
                        name: 'default',
                        gw: '1.2.3.4',
                        partition: 'LOCAL_ONLY',
                        network: 'default'
                    }
                );
                done();
            });
        });

        it('bad gateway test', (done) => {
            argv.push('--default-gw', 'aaa.com');
            icontrolMock.fail(
                'create',
                '/tm/net/route',
                {
                    code: 400,
                    message: 'foo'
                }
            );

            network.run(argv, testOptions, () => {
                // eslint-disable-next-line no-unused-vars
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                assert.strictEqual(exitCode, 1);
                done();
            });
        });
    });

    describe('route tests', () => {
        it('basic test', (done) => {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.1.0.0');
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                assert.deepEqual(
                    request,
                    {
                        name: 'foo',
                        gw: '1.2.3.4',
                        network: '10.1.0.0/24'
                    }
                );
                done();
            });
        });

        it('cidr test', (done) => {
            argv.push('--route', 'name:foo, gw:1.2.3.4, network:10.0.0.0/32');
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                assert.deepEqual(
                    request,
                    {
                        name: 'foo',
                        gw: '1.2.3.4',
                        network: '10.0.0.0/32'
                    }
                );
                done();
            });
        });

        it('bad route test', (done) => {
            argv.push('--route', 'name:routename,gw:1.2.3.4,network:networkname');
            icontrolMock.fail(
                'create',
                '/tm/net/route',
                {
                    code: 400,
                    message: 'foo'
                }
            );
            network.run(argv, testOptions, () => {
                // eslint-disable-next-line no-unused-vars
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                assert.strictEqual(exitCode, 1);
                done();
            });
        });

        it('with interface test', (done) => {
            argv.push('--route', 'name:foo, network:10.1.0.0, interface:int_name');
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/route');
                assert.deepEqual(
                    request,
                    {
                        name: 'foo',
                        interface: 'int_name',
                        network: '10.1.0.0/24'
                    }
                );
                done();
            });
        });
    });

    it('management route test', (done) => {
        argv.push('--mgmt-route', 'name:foo, gw:1.2.3.4, network:10.1.0.0');
        network.run(argv, testOptions, () => {
            const request = icontrolMock.getRequest('create', '/tm/sys/management-route');
            assert.deepEqual(
                request,
                {
                    name: 'foo',
                    gateway: '1.2.3.4',
                    network: '10.1.0.0/24'
                }
            );
            done();
        });
    });

    describe('vlan tests', () => {
        it('basic test', (done) => {
            argv.push('--vlan', 'name:foo,nic:1.1');
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/vlan');
                assert.deepEqual(
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
                done();
            });
        });

        it('tag mtu test', (done) => {
            argv.push('--vlan', 'name:foo,nic:1.1,tag:1040,mtu:600');
            network.run(argv, testOptions, () => {
                const request = icontrolMock.getRequest('create', '/tm/net/vlan');
                assert.deepEqual(
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
                done();
            });
        });

        it('bad nic name test', (done) => {
            argv.push('--vlan', 'name:vlanname,nic:nicname');
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
                assert.strictEqual(exitCode, 1);
                done();
            });
        });

        describe('self ip tests', () => {
            it('basic test', (done) => {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar');
                network.run(argv, testOptions, () => {
                    const request = icontrolMock.getRequest('create', '/tm/net/self');
                    assert.deepEqual(
                        request,
                        {
                            name: 'foo',
                            address: '1.2.3.4/24',
                            vlan: '/Common/bar',
                            allowService: 'default'
                        }
                    );
                    done();
                });
            });

            it('cidr test', (done) => {
                argv.push('--self-ip', 'name:foo, address:1.2.0.0/16, vlan:bar');
                network.run(argv, testOptions, () => {
                    const request = icontrolMock.getRequest('create', '/tm/net/self');
                    assert.deepEqual(
                        request,
                        {
                            name: 'foo',
                            address: '1.2.0.0/16',
                            vlan: '/Common/bar',
                            allowService: 'default'
                        }
                    );
                    done();
                });
            });

            describe('traffic group tests', () => {
                it('existing traffic group test', (done) => {
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

                    network.run(argv, testOptions, () => {
                        const trafficGroupRequest = icontrolMock.getRequest('create', '/tm/cm/traffic-group');
                        const selfIpRequest = icontrolMock.getRequest('create', '/tm/net/self');
                        assert.strictEqual(trafficGroupRequest, undefined);
                        assert.deepEqual(
                            selfIpRequest,
                            {
                                address: '1.2.3.4/24',
                                name: 'selfip1',
                                vlan: '/Common/external',
                                allowService: 'default',
                                trafficGroup: 'group1'
                            }
                        );
                        done();
                    });
                });

                it('new traffic group test', (done) => {
                    argv.push('--self-ip',
                        'name:selfip1, address:1.2.3.4/24, vlan:external, trafficGroup:group1');

                    icontrolMock.when(
                        'list',
                        '/tm/cm/traffic-group',
                        [
                            { name: 'traffic-group-local-only' }
                        ]
                    );

                    network.run(argv, testOptions, () => {
                        const selfIpRequest = icontrolMock.getRequest('create', '/tm/net/self');
                        const trafficGroupRequest = icontrolMock.getRequest('create', '/tm/cm/traffic-group');
                        assert.deepEqual(
                            selfIpRequest,
                            {
                                address: '1.2.3.4/24',
                                name: 'selfip1',
                                vlan: '/Common/external',
                                allowService: 'default',
                                trafficGroup: 'group1'
                            }
                        );
                        assert.strictEqual(trafficGroupRequest.name, 'group1');
                        assert.strictEqual(trafficGroupRequest.partition, '/Common');
                        done();
                    });
                });
            });

            describe('port lockdown tests', () => {
                it('specific single test', (done) => {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:hello:5678');
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
                        assert.deepEqual(
                            request,
                            {
                                name: 'foo',
                                address: '1.2.3.4/24',
                                vlan: '/Common/bar',
                                allowService: ['hello:5678']
                            }
                        );
                        done();
                    });
                });

                it('specific multiple test', (done) => {
                    argv.push('--self-ip',
                        'name:foo, address:1.2.3.4, vlan:bar, allow:hello:5678 world:9876');
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
                        assert.deepEqual(
                            request,
                            {
                                name: 'foo',
                                address: '1.2.3.4/24',
                                vlan: '/Common/bar',
                                allowService: ['hello:5678', 'world:9876']
                            }
                        );
                        done();
                    });
                });

                it('specific plus default test', (done) => {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:default world:9876');
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
                        assert.deepEqual(
                            request,
                            {
                                name: 'foo',
                                address: '1.2.3.4/24',
                                vlan: '/Common/bar',
                                allowService: ['default', 'world:9876']
                            }
                        );
                        done();
                    });
                });

                it('general test', (done) => {
                    argv.push('--self-ip', 'name:foo, address:1.2.3.4, vlan:bar, allow:all');
                    network.run(argv, testOptions, () => {
                        const request = icontrolMock.getRequest('create', '/tm/net/self');
                        assert.deepEqual(
                            request,
                            {
                                name: 'foo',
                                address: '1.2.3.4/24',
                                vlan: '/Common/bar',
                                allowService: 'all'
                            }
                        );
                        done();
                    });
                });
            });

            it('missing vlan test', (done) => {
                argv.push('--self-ip', 'name:foo, address:1.2.3.4');

                network.run(argv, testOptions, () => {
                    assert.strictEqual(exitCode, 1);
                    done();
                });
            });
        });
    });

    describe('discovery address tests', () => {
        beforeEach(() => {
            bigIp.isBigIq = () => {
                return true;
            };
            bigIp.isBigIp = () => {
                return false;
            };
        });

        it('discovery address set test', (done) => {
            argv.push('--discovery-address', '1.2.3.4');

            network.run(argv, testOptions, () => {
                assert.deepEqual(
                    icontrolMock.getRequest('replace', '/shared/identified-devices/config/discovery'),
                    { discoveryAddress: '1.2.3.4' }
                );
                done();
            });
        });

        it('mgmt discovery address test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/sys/management-ip',
                [
                    {
                        name: '10.0.0.204/24'
                    }
                ]
            );

            network.run(argv, testOptions, () => {
                assert.deepEqual(
                    icontrolMock.getRequest('replace', '/shared/identified-devices/config/discovery'),
                    { discoveryAddress: '10.0.0.204' }
                );
                done();
            });
        });
    });

    it('force reboot test', (done) => {
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

        network.run(argv, testOptions, () => {
            assert.strictEqual(rebootCalled, true);
            assert.notStrictEqual(strippedArgs.indexOf('--force-reboot'), -1);
            assert.notStrictEqual(strippedArgs.indexOf('--wait-for'), -1);
            done();
        });
    });
});
