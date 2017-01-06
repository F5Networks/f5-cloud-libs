/**
 * Copyright 2016 F5 Networks, Inc.
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

var util = require('util');
var q = require('q');
var autoscale = require('../../scripts/autoscale');
var BigIp = require('../../lib/bigIp');
var AutoscaleProvider = require('../../lib/autoscaleProvider');
var icontrolMock = require('../testUtil/icontrolMock');
var deviceGroup = 'testDeviceGroup';
var argv;
var providerMock;
var bigIpMock;
var testOptions;
var instances;
var instanceId;

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);

bigIpMock = new BigIp('localhost', 'admin', 'admin');
bigIpMock.icontrol = icontrolMock;

instanceId = "two";
instances = {
    "one": {
        isMaster: false,
        hostname: 'host1',
        privateIp: '1.2.3.4'
    },
    "two": {
        isMaster: true,
        hostname: 'host2',
        privateIp: '5.6.7.8'
    }
};

util.inherits(ProviderMock, AutoscaleProvider);
function ProviderMock() {
    ProviderMock.super_.call(this);
    this.functionCalls = {};
}

ProviderMock.prototype.init = function() {
    this.functionCalls.init = true;
    return q();
};

ProviderMock.prototype.getInstances = function() {
    this.functionCalls.getInstances = true;
    return q();
};

ProviderMock.prototype.getInstanceId = function() {
    this.functionCalls.getInstanceId = true;
    return instanceId;
};

ProviderMock.prototype.isValidMaster = function() {
    this.functionCalls.isValidMaster = true;
    return q(true);
};

ProviderMock.prototype.electMaster = function() {
    this.functionCalls.electMaster = true;
    return q();
};

ProviderMock.prototype.instancesRemoved = function(instances) {
    this.functionCalls.instancesRemoved = instances;
    return q();
};

module.exports = {
    setUp: function(callback) {
        argv = ['node', 'autoscale', '--device-group', deviceGroup, '--cloud', 'aws', '--log-level', 'none'];
        providerMock = new ProviderMock();

        providerMock.getInstances = function() {
            this.functionCalls.getInstances = true;
            return q(instances);
        };

        icontrolMock.reset();

        testOptions = {
            bigIp: bigIpMock,
            provider: providerMock
        };

        callback();
    },

    commonTests: {
        setUp: function(callback) {
            callback();
        },

        testInitCalled: function(test) {
            autoscale.run(argv, testOptions, function() {
                test.ok(providerMock.functionCalls.init, "init not called");
                test.done();
            });
        },

        testGetInstancesCalled: function(test) {
            autoscale.run(argv, testOptions, function() {
                test.ok(providerMock.functionCalls.getInstances, "getInstances not called");
                test.done();
            });
        },

        testIsValidMasterNotCalledWhenNoInstances: function(test) {
            providerMock.getInstances = function() {
                return q();
            };
            autoscale.run(argv, testOptions, function() {
                test.ifError(providerMock.functionCalls.isValidMaster);
                test.done();
            });
        },

        testIsValidMasterCalledWithInstances: function(test) {
            autoscale.run(argv, testOptions, function() {
                test.ok(providerMock.functionCalls.isValidMaster);
                test.done();
            });
        },

        testElectMasterCalledWithInvalidMaster: function(test) {
            providerMock.isValidMaster = function() {
                return q(false);
            };
            autoscale.run(argv, testOptions, function() {
                test.ok(providerMock.functionCalls.electMaster);
                test.done();
            });
        },

        testElectNotCalledWithValidMaster: function(test) {
            providerMock.isValidMaster = function() {
                return q(true);
            };
            autoscale.run(argv, testOptions, function() {
                test.ifError(providerMock.functionCalls.electMaster);
                test.done();
            });
        }
    },

    updateTests: {
        setUp: function(callback) {
            argv.push('--cluster-action', 'update');
            callback();
        },

        testDisconnected: function(test) {
            var entries = {
                "https://localhost/mgmt/tm/cm/sync-status/0": {
                    nestedStats: {
                        entries: {
                            "https://localhost/mgmt/tm/cm/syncStatus/0/details": {
                                nestedStats: {
                                    entries: {
                                        detail1: {
                                            nestedStats: {
                                                entries: {
                                                    details: {
                                                        description: "host1: disconnected"
                                                    }
                                                }
                                            }
                                        },
                                        detail2: {
                                            nestedStats: {
                                                entries: {
                                                    details: {
                                                        description: "host2: connected"
                                                    }
                                                }
                                            }
                                        },
                                        detail3: {
                                            nestedStats: {
                                                entries: {
                                                    details: {
                                                        description: "host3: disconnected"
                                                    }
                                                }
                                            }
                                        },
                                        detail4: {
                                            nestedStats: {
                                                entries: {
                                                    details: {
                                                        description: "host4: disconnected"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: entries
                }
            );

            icontrolMock.when(
                'list',
                '/tm/cm/device-group/' + deviceGroup + '/devices',
                [
                    {
                        name: 'host1'
                    },
                    {
                        name: 'host2'
                    },
                    {
                        name: 'host3'
                    },
                    {
                        name: 'host4'
                    }
                ]
            );

            // We expect that host3 and host4 will be removed. host1 will not because the cloud provider
            // says it is still in the list of known instances
            autoscale.run(argv, testOptions, function() {
                var removeFromGroupCall = icontrolMock.getRequest('modify', '/tm/cm/device-group/' + deviceGroup);
                test.strictEqual(removeFromGroupCall.devices.length, 2);
                test.notStrictEqual(removeFromGroupCall.devices.indexOf('host1'), -1);
                test.notStrictEqual(removeFromGroupCall.devices.indexOf('host2'), -1);
                test.done();
            });
        }
    },

    joinTests: {
        setUp: function(callback) {
            argv.push('--cluster-action', 'join');
            callback();
        },

        testConfigSyncCalled: function(test) {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: 'host2'
                }
            );

            autoscale.run(argv, testOptions, function() {
                var configSyncCall = icontrolMock.getRequest(
                    'modify',
                    '/tm/cm/device/~Common~host2'
                );
                test.strictEqual(configSyncCall.configsyncIp, instances[instanceId].privateIp);
                test.done();
            });
        },

        testCreateGroupWhenMaster: function(test) {
            autoscale.run(argv, testOptions, function() {
                var createGroupCall = icontrolMock.getRequest(
                    'create',
                    '/tm/cm/device-group/'
                );
                test.strictEqual(createGroupCall.name, deviceGroup);
                test.done();
            });
        }
    }
};
