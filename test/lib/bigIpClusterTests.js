/**
 * Copyright 2016-2017 F5 Networks, Inc.
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

var q = require('q');
var BigIp = require('../../../f5-cloud-libs').bigIp;
var util = require('../../../f5-cloud-libs').util;
var icontrolMock = require('../testUtil/icontrolMock');

var localHostname = 'localhostname';
var deviceGroup = 'testDeviceGroup';

var bigIp;

var callInSerial;
var deviceInfo;
var ready;

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

    testAddToTrust: {
        testNotInTrust: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/someOtherDevice']
                              });
            bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/add-to-trust');
                    test.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testAlreadyInTrust: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/someOtherDevice', '/Common/' + localHostname]
                              });
            bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testAddToDeviceGroup: {
        testNotInDeviceGroup: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                   {
                                       name: 'notTheLocalDevice'
                                   }
                              ]
                            );

            bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/~Common~' + deviceGroup + '/devices');
                    test.deepEqual(icontrolMock.lastCall.body, {name: localHostname});
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testAlreadyInDeviceGroup: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                   {
                                       name: localHostname
                                   }
                              ]
                            );

            bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/' + deviceGroup + '/devices');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testAreInTrustGroup: {
        setUp: function(callback) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/device1', '/Common/device2']
                              }
                              );
            callback();
        },

        testNoneInGroup: function(test) {
            var devices = ['device3', 'device4'];
            bigIp.cluster.areInTrustGroup(devices)
                .then(function(devicesInGroup) {
                    test.strictEqual(devicesInGroup.length, 0);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testSomeInGroup: function(test) {
            var devices = ['device1', 'device3'];
            bigIp.cluster.areInTrustGroup(devices)
                .then(function(devicesInGroup) {
                    test.strictEqual(devicesInGroup.length, 1);
                    test.strictEqual(devicesInGroup.indexOf('device1'), 0);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testAllInGroup: function(test) {
            var devices = ['device1', 'device2'];
            bigIp.cluster.areInTrustGroup(devices)
                .then(function(devicesInGroup) {
                    test.strictEqual(devicesInGroup.length, 2);
                    test.strictEqual(devicesInGroup.indexOf('device1'), 0);
                    test.strictEqual(devicesInGroup.indexOf('device2'), 1);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testCreateDeviceGroup: {
        testAlreadyExistsWithDeviceInGroup: function(test) {
            var deviceGroup = 'groupFoo';
            var devices = ['someDevice'];

            icontrolMock.when('list',
                              '/tm/cm/device-group/',
                              [
                                  {
                                      name: deviceGroup
                                  }
                              ]);

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                  {
                                      name: 'someDevice'
                                  }
                              ]
                              );

            bigIp.cluster.createDeviceGroup(deviceGroup, 'sync-only', devices)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/' + deviceGroup + '/devices');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testAlreadyExistsDeviceNotInGroup: function(test) {
            var deviceGroup = 'groupFoo';
            var devices = ['someDevice'];

            icontrolMock.when('list',
                              '/tm/cm/device-group/',
                              [
                                  {
                                      name: deviceGroup
                                  }
                              ]);

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                  {
                                      name: 'someOtherDevice'
                                  }
                              ]
                              );

            bigIp.cluster.createDeviceGroup(deviceGroup, 'sync-only', devices)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/~Common~' + deviceGroup + '/devices');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testDefaults: function(test) {
            var name = 'groupFoo';
            var type = 'sync-failover';
            var devices =['device1', 'device2'];

            bigIp.cluster.createDeviceGroup(name, type, devices)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                    test.strictEqual(icontrolMock.lastCall.body.name, name);
                    test.strictEqual(icontrolMock.lastCall.body.type, type);
                    test.strictEqual(icontrolMock.lastCall.body.devices, devices);
                    test.strictEqual(icontrolMock.lastCall.body.autoSync, 'disabled');
                    test.strictEqual(icontrolMock.lastCall.body.fullLoadOnSync, false);
                    test.strictEqual(icontrolMock.lastCall.body.asmSync, 'disabled');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testFull: function(test) {
            var name = 'groupFoo';
            var type = 'sync-failover';
            var devices =['device1', 'device2'];
            var options = {
                autoSync: true,
                saveOnAutoSync: true,
                networkFailover: true,
                fullLoadOnSync: true,
                asmSync: true
            };

            bigIp.cluster.createDeviceGroup(name, type, devices, options)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                    test.strictEqual(icontrolMock.lastCall.body.name, name);
                    test.strictEqual(icontrolMock.lastCall.body.type, type);
                    test.strictEqual(icontrolMock.lastCall.body.devices, devices);
                    test.strictEqual(icontrolMock.lastCall.body.autoSync, 'enabled');
                    test.strictEqual(icontrolMock.lastCall.body.saveOnAutoSync, true);
                    test.strictEqual(icontrolMock.lastCall.body.fullLoadOnSync, true);
                    test.strictEqual(icontrolMock.lastCall.body.asmSync, 'enabled');
                    test.strictEqual(icontrolMock.lastCall.body.networkFailover, 'enabled');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testSyncOnly: function(test) {
            bigIp.cluster.createDeviceGroup('abc', 'sync-only', [])
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.body.type, 'sync-only');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoName: function(test) {
            bigIp.cluster.createDeviceGroup()
                .then(function() {
                    test.ok(false, 'Should have thrown deviceGroup required');
                })
                .catch(function(err) {
                    test.notEqual(err.message.indexOf('deviceGroup is required'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testBadType: function(test) {
            bigIp.cluster.createDeviceGroup('abc', 'foo')
                .then(function() {
                    test.ok(false, 'Should have thrown bad type');
                })
                .catch(function(err) {
                    test.notEqual(err.message.indexOf('type must be'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoType: function(test) {
            bigIp.cluster.createDeviceGroup('abc')
                .then(function() {
                    test.ok(false, 'Should have thrown no type');
                })
                .catch(function(err) {
                    test.notEqual(err.message.indexOf('type must be'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoDevices: function(test) {
            bigIp.cluster.createDeviceGroup('abc', 'sync-failover', [])
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.body.devices.length, 0);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testConfigSync: {
        testSetConfigSyncIp: function(test) {
            var ip = '1.2.3.4';

            icontrolMock.when('list',
                              '/shared/identified-devices/config/device-info',
                              {
                                  hostname: localHostname
                              });

            bigIp.cluster.configSyncIp(ip)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device/~Common~' + localHostname);
                    test.deepEqual(icontrolMock.lastCall.body, {configsyncIp: ip});
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testSyncBasic: function(test) {
            var deviceGroup = 'someDeviceGroup';

            bigIp.cluster.sync('to-group', deviceGroup)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    test.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    test.strictEqual(icontrolMock.lastCall.body.utilCmdArgs, 'config-sync  to-group ' + deviceGroup);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testSyncForceFullLoadPush: function(test) {
            var deviceGroup = 'someDeviceGroup';

            bigIp.cluster.sync('to-group', deviceGroup, true)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    test.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    test.strictEqual(icontrolMock.lastCall.body.utilCmdArgs, 'config-sync force-full-load-push to-group ' + deviceGroup);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testSyncComplete: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/sync-status',
                              {
                                  entries: {
                                      "https://localhost/mgmt/tm/cm/sync-status/0": {
                                          nestedStats: {
                                              entries: {
                                                  color: {
                                                      description: "green"
                                                  }
                                              }
                                          }
                                      }
                                  }
                              });

            bigIp.cluster.syncComplete()
                .then(function() {
                    test.ok(true);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testSyncNotComplete: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/sync-status',
                              {
                                  entries: {
                                      "https://localhost/mgmt/tm/cm/sync-status/0": {
                                          nestedStats: {
                                              entries: {
                                                  color: {
                                                      description: "red"
                                                  }
                                              }
                                          }
                                      }
                                  }
                              });

            bigIp.cluster.syncComplete(util.NO_RETRY)
                .then(function() {
                    test.ok(false, "syncComplete should have thrown.");
                })
                .catch(function() {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testGetCmSyncStatus: {
        testBasic: function(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    "entries": {
                        "https://localhost/mgmt/tm/cm/sync-status/0": {
                            "nestedStats": {
                                "entries": {
                                    "color": {
                                        "description": "red"
                                    },
                                    "https://localhost/mgmt/tm/cm/syncStatus/0/details": {
                                        "nestedStats": {
                                            "entries": {
                                                "https://localhost/mgmt/tm/cm/syncStatus/0/details/0": {
                                                    "nestedStats": {
                                                        "entries": {
                                                            "details": {
                                                                "description": "iAmDisconnected: disconnected"
                                                            }
                                                        }
                                                    }
                                                },
                                                "https://localhost/mgmt/tm/cm/syncStatus/0/details/1": {
                                                    "nestedStats": {
                                                        "entries": {
                                                            "details": {
                                                                "description": "iAmConnected: connected"
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
                    },
                    "kind": "tm:cm:sync-status:sync-statusstats",
                    "selfLink": "https://localhost/mgmt/tm/cm/sync-status?ver=13.0.0"
                }
            );

            test.expect(4);
            bigIp.cluster.getCmSyncStatus()
                .then(function(response) {
                    test.strictEqual(response.connected.length, 1);
                    test.notStrictEqual(response.connected.indexOf('iAmConnected'), -1);
                    test.strictEqual(response.disconnected.length, 1);
                    test.notStrictEqual(response.disconnected.indexOf('iAmDisconnected'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoEntries: function(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    "entries": {
                        "https://localhost/mgmt/tm/cm/sync-status/0": {
                            "nestedStats": {
                                "entries": {
                                    "color": {
                                        "description": "red"
                                    }
                                }
                            }
                        }
                    },
                    "kind": "tm:cm:sync-status:sync-statusstats",
                    "selfLink": "https://localhost/mgmt/tm/cm/sync-status?ver=13.0.0"
                }
            );

            test.expect(2);
            bigIp.cluster.getCmSyncStatus()
                .then(function(response) {
                    test.strictEqual(response.connected.length,0);
                    test.strictEqual(response.disconnected.length, 0);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testIsInDeviceGroup: {
        testInGroup: function(test) {
            var deviceGroup = 'myDeviceGroup';

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                  {
                                      name: localHostname
                                  }
                              ]
                            );

              bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                    .then(function(isInGroup) {
                        test.ok(isInGroup);
                    })
                    .catch(function(err) {
                        test.ok(false, err.message);
                    })
                    .finally(function() {
                        test.done();
                    });
        },

        testNotInGroup: function(test) {
            var deviceGroup = 'myDeviceGroup';

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                  {
                                      name: 'someOtherDevice'
                                  }
                              ]
                            );

              bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                    .then(function(isInGroup) {
                        test.ok(!isInGroup);
                    })
                    .catch(function(err) {
                        test.ok(false, err.message);
                    })
                    .finally(function() {
                        test.done();
                    });
        }
    },

    testIsInTrustGroup: {
        testInGroup: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/' + localHostname]
                              });

            bigIp.cluster.isInTrustGroup(localHostname)
                .then(function(isInGroup) {
                    test.ok(isInGroup);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNotInGroup: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/notMe']
                              });

            bigIp.cluster.isInTrustGroup(localHostname)
                .then(function(isInGroup) {
                    test.ok(!isInGroup);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testJoinCluster: {
        setUp: function(callback) {
            icontrolMock.reset();
            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        hostname: localHostname
                    }
                ]
            );
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['foo', 'bar']
                }
            );
            icontrolMock.when(
                'create',
                '/tm/cm/add-to-trust',
                {}
            );
            icontrolMock.when(
                'create',
                '/tm/cm/device-group/~Common~myDeviceGroup/devices',
                {}
            );
            icontrolMock.when(
                'create',
                '/tm/cm/add-to-trust',
                {}
            );
            icontrolMock.when(
                'list',
                '/tm/cm/device-group',
                [
                    {
                        name: 'datasync-global-dg'
                    }
                ]
            );
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        "https://localhost/mgmt/tm/cm/sync-status/0": {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'green'
                                    }
                                }
                            }
                        }
                    }
                }
            );
            icontrolMock.when(
                'list',
                '/tm/cm/device/~Common~remoteHost',
                {
                    configsyncIp: '1.2.3.4'
                }
            );

            callInSerial = util.callInSerial;
            deviceInfo = BigIp.prototype.deviceInfo;
            ready = BigIp.prototype.ready;

            // In this test, the code under test creates its own remoteBigIp object
            // so we need to do dependency injection a little differently
            BigIp.prototype.list = function() {
                return icontrolMock.list.apply(icontrolMock, arguments);
            };
            BigIp.prototype.create = function() {
                return icontrolMock.create.apply(icontrolMock, arguments);
            };
            BigIp.prototype.ready = function() {
                return q();
            };

            callback();
        },

        tearDown: function(callback) {
            BigIp.prototype.deviceInfo = deviceInfo;
            BigIp.prototype.ready = ready;
            util.callInSerial = callInSerial;
            callback();
        },

        testMissingParameters: function(test) {
            test.expect(1);
            bigIp.cluster.joinCluster()
                .then(function() {
                    test.ok(false, 'Should have thrown missing parameters');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('are required'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        test121Plus: function(test) {
            var deviceGroup = 'myDeviceGroup';
            BigIp.prototype.deviceInfo = function() {
                return q({
                    hostname: 'remoteHost',
                    managementAddress: '5.6.7.8',
                    version: '12.1.0'
                });
            };
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: localHostname,
                    managementAddress: '5.6.7.8',
                    version: '12.1.0'
                }
            );
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            bigIp.cluster.joinCluster(deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, {syncDelay: 5})
                .then(function() {
                    var syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    test.strictEqual(syncRequest.command, 'run');
                    test.notStrictEqual(syncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    test.notStrictEqual(syncRequest.utilCmdArgs.indexOf(deviceGroup), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testBelow121: function(test) {
            var deviceGroup = 'myDeviceGroup';
            BigIp.prototype.deviceInfo = function() {
                return q({
                    hostname: 'remoteHost',
                    managementAddress: '5.6.7.8',
                    version: '12.0.0'
                });
            };
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: localHostname,
                    managementAddress: '5.6.7.8',
                    version: '12.0.0'
                }
            );
            icontrolMock.when(
                'modify',
                '/tm/cm/device-group/datasync-global-dg/devices/' + localHostname,
                {}
            );

            bigIp.cluster.joinCluster(deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, {syncDelay: 5})
                .then(function() {
                    var syncRequest = icontrolMock.getRequest('modify', '/tm/cm/device-group/datasync-global-dg/devices/' + localHostname);
                    test.deepEqual(syncRequest, {'set-sync-leader': true});
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testRecommendedAction: function(test) {
            var deviceGroup = 'myDeviceGroup';
            var recommendedGroup = 'otherDeviceGroup';

            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        "https://localhost/mgmt/tm/cm/sync-status/0": {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'red'
                                    },
                                    "https://localhost/mgmt/tm/cm/syncStatus/0/details": {
                                        nestedStats: {
                                            entries: {
                                                1: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'Recommended action: to group ' + recommendedGroup
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
                    }
                }
            );

            BigIp.prototype.deviceInfo = function() {
                return q({
                    hostname: 'remoteHost',
                    managementAddress: '5.6.7.8',
                    version: '12.1.0'
                });
            };
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: localHostname,
                    managementAddress: '5.6.7.8',
                    version: '12.1.0'
                }
            );
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            bigIp.cluster.joinCluster(deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, {syncDelay: 5, syncCompDelay: 5})
                .then(function() {
                    test.ok(false, 'Should have been rejected due to our mock.');
                })
                .catch(function() {
                    // promise will be rejected because our final syncComplete never passes because
                    // we mocked it, but check that the last sync request was for the recommendedGroup
                    var syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    var lastSyncRequest;

                    while (syncRequest) {
                        lastSyncRequest = syncRequest;
                        syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    }
                    test.strictEqual(lastSyncRequest.command, 'run');
                    test.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    test.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf(recommendedGroup), -1);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testRemoveFromCluster: {
        setUp: function(callback) {
            icontrolMock.when(
                'list',
                '/tm/cm/device-group',
                [
                    {
                        name: 'myDeviceGroup'
                    }
                ]
            );
            callback();
        },

        testOneDevice: function(test) {
            var device1 = 'device1';
            var device2 = 'device2';
            var deviceGroup = 'myDeviceGroup';

            icontrolMock.when(
                'list',
                '/tm/cm/device-group/' + deviceGroup + '/devices',
                [
                     {
                         name: device1
                     },
                     {
                         name: device2
                     }
                ]
            );

            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/' + device1, '/Common/' + device2]
                }
            );

            icontrolMock.when (
                'create',
                 '/tm/cm/remove-from-trust',
                 {}
             );

            bigIp.cluster.removeFromCluster(device1)
                .then(function() {
                    var modifyFromDeviceGroupRequest = icontrolMock.getRequest('modify', '/tm/cm/device-group/' + deviceGroup);
                    var removeFromTrustRequest = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    test.deepEqual(modifyFromDeviceGroupRequest.devices, [device2]);
                    test.strictEqual(removeFromTrustRequest.deviceName, device1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testTwoDevices: function(test) {
            var device1 = 'device1';
            var device2 = 'device2';
            var deviceGroup = 'myDeviceGroup';

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                   {
                                       name: device1
                                   },
                                   {
                                       name: device2
                                   }
                              ]
                            );
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/' + device1, '/Common/' + device2]
                              });

            icontrolMock.when ('create',
                               '/tm/cm/remove-from-trust',
                               {});

            bigIp.cluster.removeFromCluster([device1, device2])
                .then(function() {
                    var modifyFromDeviceGroupRequest = icontrolMock.getRequest('modify', '/tm/cm/device-group/' + deviceGroup);
                    var removeFromTrustRequest = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    test.deepEqual(modifyFromDeviceGroupRequest.devices, []);
                    test.strictEqual(removeFromTrustRequest.deviceName, device1);
                    removeFromTrustRequest = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    test.strictEqual(removeFromTrustRequest.deviceName, device2);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testRemoveFromDeviceGroup: {
        testInGroup: function(test) {
            var device1 = 'device1';
            var device2 = 'device2';
            var deviceGroup = 'myDeviceGroup';

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                   {
                                       name: device1
                                   },
                                   {
                                       name: device2
                                   }
                              ]
                            );

            bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/' + deviceGroup);
                    test.deepEqual(icontrolMock.lastCall.body,
                                   {
                                       devices: [device2]
                                   }
                    );
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testArrayInGroup: function(test) {
            var device1 = 'device1';
            var device2 = 'device2';
            var keepMe = 'keepMe';
            var deviceGroup = 'myDeviceGroup';

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                   {
                                       name: device1
                                   },
                                   {
                                       name: device2
                                   },
                                   {
                                       name: keepMe
                                   }
                              ]
                            );

            bigIp.cluster.removeFromDeviceGroup(['device1', 'device2'], deviceGroup)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/' + deviceGroup);
                    test.deepEqual(icontrolMock.lastCall.body,
                                   {
                                       devices: [keepMe]
                                   }
                    );
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNotInGroup: function(test) {
            var device1 = 'device1';
            var device2 = 'device2';
            var deviceGroup = 'myDeviceGroup';

            icontrolMock.when('list',
                              '/tm/cm/device-group/' + deviceGroup + '/devices',
                              [
                                   {
                                       name: device2
                                   }
                              ]
                            );

            bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/' + deviceGroup + '/devices');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testRemoveFromTrust: {
        testInTrust: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/someOtherDevice', '/Common/' + localHostname]
                              });

            icontrolMock.when ('create',
                               '/tm/cm/remove-from-trust',
                               {});

            bigIp.cluster.removeFromTrust(localHostname)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/remove-from-trust');
                    test.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testArrayInTrust: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/device1', '/Common/device2', '/Common/someOtherDevice']
                              });

            icontrolMock.when ('create',
                               '/tm/cm/remove-from-trust',
                               {});

            bigIp.cluster.removeFromTrust(['device1', 'device2'])
                .then(function() {
                    var request = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    test.deepEqual(request,
                                   {
                                       command: "run",
                                       name: "Root",
                                       caDevice: true,
                                       deviceName: "device1"
                                   }
                    );
                    request = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    test.deepEqual(request,
                                   {
                                       command: "run",
                                       name: "Root",
                                       caDevice: true,
                                       deviceName: "device2"
                                   }
                    );
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNotInTrust: function(test) {
            icontrolMock.when('list',
                              '/tm/cm/trust-domain/Root',
                              {
                                  caDevices: ['/Common/someOtherDevice']
                              });

            bigIp.cluster.removeFromTrust(localHostname)
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};
