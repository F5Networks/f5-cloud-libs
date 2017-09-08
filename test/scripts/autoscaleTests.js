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

var deviceGroup = 'testDeviceGroup';
var util = require('util');
var q = require('q');
var AutoscaleProvider = require('../../lib/autoscaleProvider');
var autoscale;
var fsMock;
var childProcessMock;
var BigIp;
var cryptoUtilMock;
var icontrolMock;
var ipcMock;
var argv;
var providerMock;
var bigIpMock;
var testOptions;
var instances;
var instanceId;

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);
process.setMaxListeners(0);

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
    return q(instances);
};

ProviderMock.prototype.getInstanceId = function() {
    this.functionCalls.getInstanceId = true;
    return q(instanceId);
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

ProviderMock.prototype.getStoredUcs = function() {
    return q();
};

ProviderMock.prototype.putPublicKey = function() {
    return q();
};

// Don't let autoscale exit - we need the nodeunit process to run to completion
process.exit = function() {};

module.exports = {
    setUp: function(callback) {
        argv = ['node', 'autoscale', '--password', 'foobar', '--device-group', deviceGroup, '--cloud', 'aws', '--log-level', 'none'];

        instanceId = "two";
        instances = {
            "one": {
                isMaster: false,
                hostname: 'host1',
                privateIp: '1.2.3.4',
                providerVisible: true
            },
            "two": {
                isMaster: true,
                hostname: 'host2',
                privateIp: '5.6.7.8',
                providerVisible: true
            }
        };

        fsMock = require('fs');
        childProcessMock = require('child_process');
        BigIp = require('../../lib/bigIp');
        icontrolMock = require('../testUtil/icontrolMock');
        cryptoUtilMock = require('../../lib/cryptoUtil');
        ipcMock = require('../../lib/ipc');

        providerMock = new ProviderMock();

        // Just resolve right away, otherwise these tests never exit
        ipcMock.once = function() {
            var deferred = q.defer();
            deferred.resolve();
            return deferred;
        };

        bigIpMock = new BigIp();
        bigIpMock.init('localhost', 'admin', 'admin')
            .then(function() {
                bigIpMock.icontrol = icontrolMock;

                icontrolMock.reset();

                testOptions = {
                    bigIp: bigIpMock,
                    provider: providerMock
                };

                callback();
            });

        cryptoUtilMock = {
            generateKeyPair: function() {
                return q();
            }
        };

        autoscale  = require('../../scripts/autoscale');
    },

    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });
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

            fsMock.writeFile = function(path, Data, cb) {
                cb();
            };

            fsMock.unlinkSync = function() {};

            childProcessMock.execFile = function(file, args, cb) {
                cb();
            };

            bigIpMock.loadUcs = function() {
                return q();
            };

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
                '/tm/cm/device-group/',
                [
                    {
                        name: deviceGroup
                    }
                ]
            );

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

            argv.push('--host', 'host', '--user', 'user', '--password', 'password');

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

            fsMock.writeFile = function(path, Data, cb) {
                cb();
            };

            fsMock.unlinkSync = function() {};

            childProcessMock.execFile = function(file, args, cb) {
                cb();
            };

            bigIpMock.loadUcs = function() {
                return q();
            };

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
