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

const  q = require('q');

var BigIp = require('../../../f5-cloud-libs').bigIp;
var icontrolMock = require('../testUtil/icontrolMock');

var bigIp;

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
    setUp: function(callback) {
        bigIp = new BigIp();
        bigIp.init('host', 'user', 'passowrd')
            .then(function() {
                bigIp.icontrol = icontrolMock;
                bigIp.ready = function() {
                    return q();
                };

                icontrolMock.reset();
                callback();
            });
    },

    testUpdateServer: {
        testBasic: function(test) {
            const virtualServersWithPort = [];
            virtualServers.forEach(function(virtualServer) {
                virtualServersWithPort.push({
                    name: virtualServer.name,
                    destination: virtualServer.ip + ':' + port,
                });
            });

            bigIp.gtm.updateServer(serverName, virtualServers)
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/server/~Common~' + serverName);
                    test.deepEqual(request.virtualServers, virtualServersWithPort);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testDataCenter: function(test) {
            const datacenter = 'myDatacenter';
            bigIp.gtm.updateServer(serverName, virtualServers, {datacenter: datacenter})
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/server/~Common~' + serverName);
                    test.strictEqual(request.datacenter, datacenter);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testMonitor: function(test) {
            const monitor = '/myPartition/myMonitor';
            bigIp.gtm.updateServer(serverName, virtualServers, {monitor: monitor})
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/server/~Common~' + serverName);
                    test.strictEqual(request.monitor, monitor);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPartiton: function(test) {
            const partition = 'myPartition';
            bigIp.gtm.setPartition(partition);
            bigIp.gtm.updateServer(serverName, virtualServers)
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/server/~' + partition + '~' + serverName);
                    test.notStrictEqual(request, undefined);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testUpdatePool: {
        testBasic: function(test) {
            const serverWithVirtualServers = [];
            virtualServers.forEach(function(virtualServer) {
                serverWithVirtualServers.push({
                    name: serverName + ':' + virtualServer.name
                });
            });

            bigIp.gtm.updatePool(poolName, serverName, virtualServers)
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/pool/a/~Common~' + poolName);
                    test.deepEqual(request.members, serverWithVirtualServers);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testMonitor: function(test) {
            const monitor = '/myPartition/myMonitor';
            bigIp.gtm.updatePool(poolName, serverName, virtualServers, {monitor: monitor})
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/pool/a/~Common~' + poolName);
                    test.strictEqual(request.monitor, monitor);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLoadBalancingMode: function(test) {
            const loadBalancingMode = 'myLoadBalancingMode';
            bigIp.gtm.updatePool(poolName, serverName, virtualServers, {loadBalancingMode: loadBalancingMode})
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/pool/a/~Common~' + poolName);
                    test.strictEqual(request.loadBalancingMode, loadBalancingMode);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPartiton: function(test) {
            const partition = 'myPartition';
            bigIp.gtm.setPartition(partition);
            bigIp.gtm.updatePool(poolName, serverName, virtualServers)
                .then(function() {
                    var request = icontrolMock.getRequest('modify', '/tm/gtm/pool/a/~' + partition + '~' + poolName);
                    test.notStrictEqual(request, undefined);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};