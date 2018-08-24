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

const BigIp = require('../../../f5-cloud-libs').bigIp;
const icontrolMock = require('../testUtil/icontrolMock');

let bigIp;
let authnMock;
let utilMock;

const serverName = 'myServer';
const poolName = 'myPool';
const virtualServers = [
    {
        name: 'vs1',
        ip: '1.2.3.4',
        port: 8080
    },
    {
        name: 'vs2',
        ip: '4.5.6.7',
        port: 8080
    }
];

const port = '8080';

// Our tests cause too many event listeners. Turn off the check.
process.setMaxListeners(0);

module.exports = {
    setUp(callback) {
        bigIp = new BigIp();
        /* eslint-disable global-require */
        authnMock = require('../../../f5-cloud-libs').authn;
        /* eslint-enable global-require */
        authnMock.authenticate = (host, user, password) => {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        };

        /* eslint-disable global-require */
        utilMock = require('../../../f5-cloud-libs').util;
        /* eslint-enable global-require */
        utilMock.getProduct = () => {
            return q('BIG-IP');
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
        bigIp.init('host', 'user', 'passowrd')
            .then(() => {
                icontrolMock.reset();
                callback();
            });
    },

    testUpdateServer: {
        testBasic(test) {
            const virtualServersWithPort = [];
            virtualServers.forEach((virtualServer) => {
                virtualServersWithPort.push({
                    name: virtualServer.name,
                    destination: `${virtualServer.ip}:${port}`
                });
            });

            bigIp.gtm.updateServer(serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'modify', `/tm/gtm/server/~Common~${serverName}`
                    );
                    test.deepEqual(request.virtualServers, virtualServersWithPort);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDataCenter(test) {
            const datacenter = 'myDatacenter';
            bigIp.gtm.updateServer(serverName, virtualServers, { datacenter })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/server/~Common~${serverName}`);
                    test.strictEqual(request.datacenter, datacenter);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMonitor(test) {
            const monitor = '/myPartition/myMonitor';
            bigIp.gtm.updateServer(serverName, virtualServers, { monitor })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/server/~Common~${serverName}`);
                    test.strictEqual(request.monitor, monitor);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPartiton(test) {
            const partition = 'myPartition';
            bigIp.gtm.setPartition(partition);
            bigIp.gtm.updateServer(serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'modify', `/tm/gtm/server/~${partition}~${serverName}`
                    );
                    test.notStrictEqual(request, undefined);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testUpdatePool: {
        testBasic(test) {
            const serverWithVirtualServers = [];
            virtualServers.forEach((virtualServer) => {
                serverWithVirtualServers.push({
                    name: `${serverName}:${virtualServer.name}`
                });
            });

            bigIp.gtm.updatePool(poolName, serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/pool/a/~Common~${poolName}`);
                    test.deepEqual(request.members, serverWithVirtualServers);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMonitor(test) {
            const monitor = '/myPartition/myMonitor';
            bigIp.gtm.updatePool(poolName, serverName, virtualServers, { monitor })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/pool/a/~Common~${poolName}`);
                    test.strictEqual(request.monitor, monitor);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testLoadBalancingMode(test) {
            const loadBalancingMode = 'myLoadBalancingMode';
            bigIp.gtm.updatePool(poolName, serverName, virtualServers, { loadBalancingMode })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/pool/a/~Common~${poolName}`);
                    test.strictEqual(request.loadBalancingMode, loadBalancingMode);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPartiton(test) {
            const partition = 'myPartition';
            bigIp.gtm.setPartition(partition);
            bigIp.gtm.updatePool(poolName, serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'modify', `/tm/gtm/pool/a/~${partition}~${poolName}`
                    );
                    test.notStrictEqual(request, undefined);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
