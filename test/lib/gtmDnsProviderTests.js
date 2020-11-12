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

    it('bigip init test', (done) => {
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

        gtmDnsProvider.init(providerOptions)
            .then(() => {
                return gtmDnsProvider.update();
            })
            .then(() => {
                assert.strictEqual(functionCalls.bigIp.init[0], 'myHost');
                assert.strictEqual(functionCalls.bigIp.init[1], 'myUser');
                assert.strictEqual(functionCalls.bigIp.init[2], 'myPassword');
                assert.deepEqual(functionCalls.bigIp.init[3], {
                    port: '1234',
                    passwordIsUrl: false,
                    passwordEncrypted: true
                });
            })
            .catch((err) => {
                assert.ok(false, err);
            })
            .finally(() => {
                done();
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

        it('basic test', (done) => {
            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(functionCalls.bigIp.gtm.updateServer[0], 'myServer');
                    assert.deepEqual(functionCalls.bigIp.gtm.updateServer[1], instances);
                    assert.strictEqual(functionCalls.bigIp.gtm.updatePool[0], 'myPool');
                    assert.strictEqual(functionCalls.bigIp.gtm.updatePool[1], 'myServer');
                    assert.strictEqual(functionCalls.bigIp.gtm.updatePool[2], instances);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('data center created test', (done) => {
            icontrolMock.when('list', '/tm/gtm/datacenter', []);

            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/datacenter'),
                        {
                            name: 'myDatacenter'
                        }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('data center not created test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/gtm/datacenter',
                [
                    {
                        name: 'myDatacenter'
                    }
                ]
            );

            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/datacenter'),
                        undefined
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('server created test', (done) => {
            icontrolMock.when('list', '/tm/gtm/server', []);

            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepEqual(
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
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('server created address in use test', (done) => {
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

            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepEqual(
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
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('server not created test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/gtm/server',
                [
                    {
                        name: 'myServer'
                    }
                ]
            );

            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/server'),
                        undefined
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('pool created test', (done) => {
            icontrolMock.when('list', '/tm/gtm/pool/a', []);

            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/pool/a'),
                        {
                            name: 'myPool'
                        }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('pool not created test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/gtm/pool/a',
                [
                    {
                        name: 'myPool'
                    }
                ]
            );

            gtmDnsProvider.init(providerOptions)
                .then(() => {
                    return gtmDnsProvider.update(instances);
                })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/gtm/pool/a'),
                        undefined
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    it('options test', (done) => {
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

        gtmDnsProvider.init(providerOptions)
            .then(() => {
                return gtmDnsProvider.update(instances);
            })
            .then(() => {
                assert.deepEqual(functionCalls.bigIp.gtm.updateServer[2], {
                    datacenter: 'myDatacenter',
                    monitor: 'myVsMonitor'
                });
                assert.deepEqual(functionCalls.bigIp.gtm.updatePool[3], {
                    loadBalancingMode: 'myLoadBalancingMode',
                    monitor: 'myPoolMonitor'
                });
                assert.strictEqual(functionCalls.bigIp.gtm.setPartition[0], 'myPartition');
            })
            .catch((err) => {
                assert.ok(false, err);
            })
            .finally(() => {
                done();
            });
    });
});
