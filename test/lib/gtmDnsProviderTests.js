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

let BigIp;
let bigIpMock;
let icontrolMock;

let gtmDnsProvider;
let functionCalls;

let instances;
let providerOptions;

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        BigIp = require('../../lib/bigIp');
        icontrolMock = require('../testUtil/icontrolMock');

        bigIpMock = new BigIp();
        bigIpMock.init = function init() {
            functionCalls.bigIp.init = arguments;
            return q();
        };
        bigIpMock.isInitialized = true;

        bigIpMock.ready = () => {
            return q();
        };

        functionCalls = {
            bigIp: {
                gtm: {}
            }
        };

        bigIpMock.icontrol = icontrolMock;

        icontrolMock.reset();

        bigIpMock.ready = () => {
            return q();
        };

        bigIpMock.gtm = {
            updateServer() {
                functionCalls.bigIp.gtm.updateServer = arguments;
            },
            updatePool() {
                functionCalls.bigIp.gtm.updatePool = arguments;
            },
            setPartition() {
                functionCalls.bigIp.gtm.setPartition = arguments;
            }
        };

        gtmDnsProvider = new GtmDnsProvider();
        gtmDnsProvider.bigIp = bigIpMock;

        callback();
    },

    testBigipInit(test) {
        providerOptions = {
            host: 'myHost',
            user: 'myUser',
            password: 'myPassword',
            serverName: 'myServer',
            poolName: 'myPool',
            port: '1234',
            passwordEncrypted: true,
            datacenter: 'foo'
        };

        test.expect(4);
        gtmDnsProvider.init(providerOptions)
            .then(() => {
                return gtmDnsProvider.update();
            })
            .then(() => {
                test.strictEqual(functionCalls.bigIp.init[0], 'myHost');
                test.strictEqual(functionCalls.bigIp.init[1], 'myUser');
                test.strictEqual(functionCalls.bigIp.init[2], 'myPassword');
                test.deepEqual(functionCalls.bigIp.init[3], {
                    port: '1234',
                    passwordIsUrl: false,
                    passwordEncrypted: true
                });
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testUpdateServerAndPool: {
        setUp(callback) {
            instances = {
                1: 'one',
                2: 'two'
            };

            providerOptions = {
                host: 'myHost',
                user: 'myUser',
                password: 'myPassword',
                serverName: 'myServer',
                poolName: 'myPool',
                port: '1234',
                passwordEncrypted: true,
                datacenter: 'myDatacenter'
            };

            callback();
        },

        testBasic(test) {
            test.expect(5);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.strictEqual(functionCalls.bigIp.gtm.updateServer[0], 'myServer');
                    test.deepEqual(functionCalls.bigIp.gtm.updateServer[1], instances);
                    test.strictEqual(functionCalls.bigIp.gtm.updatePool[0], 'myPool');
                    test.strictEqual(functionCalls.bigIp.gtm.updatePool[1], 'myServer');
                    test.strictEqual(functionCalls.bigIp.gtm.updatePool[2], instances);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDatacenterCreated(test) {
            icontrolMock.when('list', '/tm/gtm/datacenter', []);

            test.expect(1);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/datacenter'),
                        {
                            name: 'myDatacenter'
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDatacenterNotCreated(test) {
            icontrolMock.when(
                'list',
                '/tm/gtm/datacenter',
                [
                    {
                        name: 'myDatacenter'
                    }
                ]
            );

            test.expect(1);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/datacenter'),
                        undefined
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testServerCreated(test) {
            icontrolMock.when('list', '/tm/gtm/server', []);

            test.expect(1);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/server'),
                        {
                            name: 'myServer',
                            datacenter: 'myDatacenter',
                            product: 'generic-host',
                            addresses: ['192.0.2.1']
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testServerCreatedAddressInUse(test) {
            icontrolMock.when(
                'list',
                '/tm/gtm/server',
                [
                    {
                        name: 'myOtherServer',
                        addresses: [
                            { name: '192.0.2.1' },
                            { name: '192.0.2.2' }
                        ]
                    },
                    {
                        name: 'myThirdServer',
                        addresses: [
                            { name: '192.0.2.3' }
                        ]
                    }
                ]
            );

            test.expect(1);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/server'),
                        {
                            name: 'myServer',
                            datacenter: 'myDatacenter',
                            product: 'generic-host',
                            addresses: ['192.0.2.4']
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testServerNotCreated(test) {
            icontrolMock.when(
                'list',
                '/tm/gtm/server',
                [
                    {
                        name: 'myServer'
                    }
                ]
            );

            test.expect(1);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/server'),
                        undefined
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPoolCreated(test) {
            icontrolMock.when('list', '/tm/gtm/pool/a', []);

            test.expect(1);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/pool/a'),
                        {
                            name: 'myPool'
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPoolNotCreated(test) {
            icontrolMock.when(
                'list',
                '/tm/gtm/pool/a',
                [
                    {
                        name: 'myPool'
                    }
                ]
            );

            test.expect(1);
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    test.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/pool/a'),
                        undefined
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testOptions(test) {
        instances = {
            1: 'one',
            2: 'two'
        };

        providerOptions = {
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
            .then(() => {
                return gtmDnsProvider.update(instances);
            })
            .then(() => {
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
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    }
};
