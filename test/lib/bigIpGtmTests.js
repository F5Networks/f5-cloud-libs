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
const sinon = require('sinon');

const icontrolMock = require('../testUtil/icontrolMock');
const authnMock = require('../../../f5-cloud-libs').authn;
const utilMock = require('../../../f5-cloud-libs').util;

const BigIp = require('../../../f5-cloud-libs').bigIp;

describe('bigip gtm tests', () => {
    let bigIp;

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

    beforeEach((done) => {
        bigIp = new BigIp();
        sinon.stub(authnMock, 'authenticate').callsFake((host, user, password) => {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        });

        sinon.stub(utilMock, 'getProduct').resolves('BIG-IP');

        bigIp.ready = () => {
            return q();
        };
        bigIp.init('host', 'user', 'password')
            .then(() => {
                icontrolMock.reset();
                done();
            });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('update server tests', () => {
        it('basic test', () => {
            const virtualServersWithPort = [];
            virtualServers.forEach((virtualServer) => {
                virtualServersWithPort.push({
                    name: virtualServer.name,
                    destination: `${virtualServer.ip}:${port}`
                });
            });

            return bigIp.gtm.updateServer(serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'modify', `/tm/gtm/server/~Common~${serverName}`
                    );
                    assert.deepEqual(request.virtualServers, virtualServersWithPort);
                });
        });
        it('datacenter test', () => {
            const datacenter = 'myDatacenter';
            return bigIp.gtm.updateServer(serverName, virtualServers, { datacenter })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/server/~Common~${serverName}`);
                    assert.strictEqual(request.datacenter, datacenter);
                });
        });
        it('monitor test', () => {
            const monitor = '/myPartition/myMonitor';
            return bigIp.gtm.updateServer(serverName, virtualServers, { monitor })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/server/~Common~${serverName}`);
                    assert.strictEqual(request.monitor, monitor);
                });
        });
        it('partition test', () => {
            const partition = 'myPartition';
            bigIp.gtm.setPartition(partition);
            return bigIp.gtm.updateServer(serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'modify', `/tm/gtm/server/~${partition}~${serverName}`
                    );
                    assert.notStrictEqual(request, undefined);
                });
        });
    });

    describe('update pool tests', () => {
        it('basic test', () => {
            const serverWithVirtualServers = [];
            virtualServers.forEach((virtualServer) => {
                serverWithVirtualServers.push({
                    name: `${serverName}:${virtualServer.name}`
                });
            });

            return bigIp.gtm.updatePool(poolName, serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/pool/a/~Common~${poolName}`);
                    assert.deepEqual(request.members, serverWithVirtualServers);
                });
        });
        it('monitor test', () => {
            const monitor = '/myPartition/myMonitor';
            return bigIp.gtm.updatePool(poolName, serverName, virtualServers, { monitor })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/pool/a/~Common~${poolName}`);
                    assert.strictEqual(request.monitor, monitor);
                });
        });
        it('load balancing mode test', () => {
            const loadBalancingMode = 'myLoadBalancingMode';
            return bigIp.gtm.updatePool(poolName, serverName, virtualServers, { loadBalancingMode })
                .then(() => {
                    const request = icontrolMock.getRequest('modify', `/tm/gtm/pool/a/~Common~${poolName}`);
                    assert.strictEqual(request.loadBalancingMode, loadBalancingMode);
                });
        });
        it('partition test', () => {
            const partition = 'myPartition';
            bigIp.gtm.setPartition(partition);
            return bigIp.gtm.updatePool(poolName, serverName, virtualServers)
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'modify', `/tm/gtm/pool/a/~${partition}~${poolName}`
                    );
                    assert.notStrictEqual(request, undefined);
                });
        });
    });
});
