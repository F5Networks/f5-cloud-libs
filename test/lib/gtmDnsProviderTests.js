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
const assert = require('assert');
const GtmDnsProvider = require('../../../f5-cloud-libs').gtmDnsProvider;

describe('gtm dns provider tests', () => {
    let BigIp;
    let bigIpMock;
    let icontrolMock;

    let gtmDnsProvider;
    let functionCalls;

    let instances;
    let providerOptions;

    beforeEach(() => {
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
    });

    it('bigip init test', () => {
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

        return gtmDnsProvider.init(providerOptions)
            .then(() => {
                return gtmDnsProvider.update();
            })
            .then(() => {
                assert.strictEqual(functionCalls.bigIp.init[0], 'myHost');
                assert.strictEqual(functionCalls.bigIp.init[1], 'myUser');
                assert.strictEqual(functionCalls.bigIp.init[2], 'myPassword');
                assert.deepStrictEqual(functionCalls.bigIp.init[3], {
                    port: '1234',
                    passwordIsUrl: false,
                    passwordEncrypted: true
                });
            });
    });

    describe('update server and pool tests', () => {
        beforeEach(() => {
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
        });

        it('basic test', () => {
            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(functionCalls.bigIp.gtm.updateServer[0], 'myServer');
                    assert.deepStrictEqual(functionCalls.bigIp.gtm.updateServer[1], instances);
                    assert.strictEqual(functionCalls.bigIp.gtm.updatePool[0], 'myPool');
                    assert.strictEqual(functionCalls.bigIp.gtm.updatePool[1], 'myServer');
                    assert.strictEqual(functionCalls.bigIp.gtm.updatePool[2], instances);
                });
        });

        it('data center created test', () => {
            icontrolMock.when('list', '/tm/gtm/datacenter', []);

            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/datacenter'),
                        {
                            name: 'myDatacenter'
                        }
                    );
                });
        });

        it('data center not created test', () => {
            icontrolMock.when(
                'list',
                '/tm/gtm/datacenter',
                [
                    {
                        name: 'myDatacenter'
                    }
                ]
            );

            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/datacenter'),
                        undefined
                    );
                });
        });

        it('server created test', () => {
            icontrolMock.when('list', '/tm/gtm/server', []);

            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/server'),
                        {
                            name: 'myServer',
                            datacenter: 'myDatacenter',
                            product: 'generic-host',
                            addresses: ['192.0.2.1']
                        }
                    );
                });
        });

        it('server created address in use test', () => {
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

            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/server'),
                        {
                            name: 'myServer',
                            datacenter: 'myDatacenter',
                            product: 'generic-host',
                            addresses: ['192.0.2.4']
                        }
                    );
                });
        });

        it('server not created test', () => {
            icontrolMock.when(
                'list',
                '/tm/gtm/server',
                [
                    {
                        name: 'myServer'
                    }
                ]
            );

            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/server'),
                        undefined
                    );
                });
        });

        it('pool created test', () => {
            icontrolMock.when('list', '/tm/gtm/pool/a', []);

            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/pool/a'),
                        {
                            name: 'myPool'
                        }
                    );
                });
        });

        it('pool not created test', () => {
            icontrolMock.when(
                'list',
                '/tm/gtm/pool/a',
                [
                    {
                        name: 'myPool'
                    }
                ]
            );

            return gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/pool/a'),
                        undefined
                    );
                });
        });
    });

    it('options test', () => {
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

        return gtmDnsProvider.init(providerOptions)
            .then(() => {
                return gtmDnsProvider.update(instances);
            })
            .then(() => {
                assert.deepStrictEqual(functionCalls.bigIp.gtm.updateServer[2], {
                    datacenter: 'myDatacenter',
                    monitor: 'myVsMonitor'
                });
                assert.deepStrictEqual(functionCalls.bigIp.gtm.updatePool[3], {
                    loadBalancingMode: 'myLoadBalancingMode',
                    monitor: 'myPoolMonitor'
                });
                assert.strictEqual(functionCalls.bigIp.gtm.setPartition[0], 'myPartition');
            });
    });
});
