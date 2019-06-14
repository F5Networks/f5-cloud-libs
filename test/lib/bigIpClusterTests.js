/**
 * Copyright 2016-2018 F5 Networks, Inc.
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
const util = require('../../../f5-cloud-libs').util;
const icontrolMock = require('../testUtil/icontrolMock');

const localHostname = 'localhostname';
const deviceGroup = 'testDeviceGroup';

let authnMock;
let utilMock;
let BigIp;
let bigIp;

let utilCallInSerial;
let bigIpList;
let bigIpCreate;
let bigIpReady;
let bigIpDeviceInfo;

// Our tests cause too many event listeners. Turn off the check.
process.setMaxListeners(0);

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        utilMock = require('../../../f5-cloud-libs').util;
        BigIp = require('../../../f5-cloud-libs').bigIp;
        bigIp = new BigIp();
        utilMock.getProduct = function getProduct() {
            return q('BIG-IP');
        };
        authnMock = require('../../../f5-cloud-libs').authn;
        authnMock.authenticate = function authenticate(host, user, password) {
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
        bigIp.ready = function ready() {
            return q();
        };
        bigIp.init('host', 'user', 'passowrd')
            .then(() => {
                icontrolMock.reset();
                callback();
            });
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },

    testAddToTrust: {
        testNotInTrust(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice']
                }
            );

            test.expect(3);
            bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/add-to-trust');
                    test.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAlreadyInTrust(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice', `/Common/${localHostname}`]

                }
            );

            test.expect(2);
            bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testAddToDeviceGroup: {
        testNotInDeviceGroup(test) {
            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'notTheLocalDevice'
                    }
                ]
            );

            test.expect(3);
            bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/~Common~${deviceGroup}/devices`
                    );
                    test.deepEqual(icontrolMock.lastCall.body, { name: localHostname });
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAlreadyInDeviceGroup(test) {
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
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: localHostname
                    }
                ]
            );

            test.expect(2);
            bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}/devices`
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testAreInTrustGroup: {
        setUp(callback) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/device1', '/Common/device2']
                }
            );
            callback();
        },

        testNoneInGroup(test) {
            const devices = ['device3', 'device4'];

            test.expect(1);
            bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    test.strictEqual(devicesInGroup.length, 0);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSomeInGroup(test) {
            const devices = ['device1', 'device3'];

            test.expect(2);
            bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    test.strictEqual(devicesInGroup.length, 1);
                    test.strictEqual(devicesInGroup.indexOf('device1'), 0);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAllInGroup(test) {
            const devices = ['device1', 'device2'];

            test.expect(3);
            bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    test.strictEqual(devicesInGroup.length, 2);
                    test.strictEqual(devicesInGroup.indexOf('device1'), 0);
                    test.strictEqual(devicesInGroup.indexOf('device2'), 1);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testCreateDeviceGroup: {
        testAlreadyExistsWithDeviceInGroup(test) {
            const devices = ['someDevice'];

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
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'someDevice'
                    }
                ]
            );

            test.expect(2);
            bigIp.cluster.createDeviceGroup(deviceGroup, 'sync-only', devices)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}/devices`
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAlreadyExistsDeviceNotInGroup(test) {
            const devices = ['someDevice'];

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
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'someOtherDevice'
                    }
                ]
            );

            test.expect(2);
            bigIp.cluster.createDeviceGroup(deviceGroup, 'sync-only', devices)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/~Common~${deviceGroup}/devices`
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDefaults(test) {
            const name = 'groupFoo';
            const type = 'sync-failover';
            const devices = ['device1', 'device2'];

            test.expect(10);
            bigIp.cluster.createDeviceGroup(name, type, devices)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                    test.strictEqual(icontrolMock.lastCall.body.name, name);
                    test.strictEqual(icontrolMock.lastCall.body.type, type);
                    test.strictEqual(icontrolMock.lastCall.body.devices.length, devices.length);
                    devices.forEach((device) => {
                        test.notStrictEqual(icontrolMock.lastCall.body.devices.indexOf(device), -1);
                    });
                    test.strictEqual(icontrolMock.lastCall.body.autoSync, 'disabled');
                    test.strictEqual(icontrolMock.lastCall.body.fullLoadOnSync, false);
                    test.strictEqual(icontrolMock.lastCall.body.asmSync, 'disabled');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFull(test) {
            const name = 'groupFoo';
            const type = 'sync-failover';
            const devices = ['device1', 'device2'];
            const options = {
                autoSync: true,
                saveOnAutoSync: true,
                networkFailover: true,
                fullLoadOnSync: true,
                asmSync: true
            };

            test.expect(12);
            bigIp.cluster.createDeviceGroup(name, type, devices, options)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                    test.strictEqual(icontrolMock.lastCall.body.name, name);
                    test.strictEqual(icontrolMock.lastCall.body.type, type);
                    test.strictEqual(icontrolMock.lastCall.body.devices.length, devices.length);
                    devices.forEach((device) => {
                        test.notStrictEqual(icontrolMock.lastCall.body.devices.indexOf(device), -1);
                    });
                    test.strictEqual(icontrolMock.lastCall.body.autoSync, 'enabled');
                    test.strictEqual(icontrolMock.lastCall.body.saveOnAutoSync, true);
                    test.strictEqual(icontrolMock.lastCall.body.fullLoadOnSync, true);
                    test.strictEqual(icontrolMock.lastCall.body.asmSync, 'enabled');
                    test.strictEqual(icontrolMock.lastCall.body.networkFailover, 'enabled');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSyncOnly(test) {
            test.expect(1);
            bigIp.cluster.createDeviceGroup('abc', 'sync-only', [])
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.body.type, 'sync-only');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSingleDevice(test) {
            const name = 'groupFoo';
            const type = 'sync-failover';
            const device = 'device1';

            test.expect(1);
            bigIp.cluster.createDeviceGroup(name, type, device)
                .then(() => {
                    test.deepEqual(icontrolMock.lastCall.body.devices, [device]);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoName(test) {
            test.expect(1);
            bigIp.cluster.createDeviceGroup()
                .then(() => {
                    test.ok(false, 'Should have thrown deviceGroup required');
                })
                .catch((err) => {
                    test.notEqual(err.message.indexOf('deviceGroup is required'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadType(test) {
            test.expect(1);
            bigIp.cluster.createDeviceGroup('abc', 'foo')
                .then(() => {
                    test.ok(false, 'Should have thrown bad type');
                })
                .catch((err) => {
                    test.notEqual(err.message.indexOf('type must be'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoType(test) {
            test.expect(1);
            bigIp.cluster.createDeviceGroup('abc')
                .then(() => {
                    test.ok(false, 'Should have thrown no type');
                })
                .catch((err) => {
                    test.notEqual(err.message.indexOf('type must be'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoDevices(test) {
            test.expect(1);
            bigIp.cluster.createDeviceGroup('abc', 'sync-failover', [])
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.body.devices.length, 0);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testUpdateSettings(test) {
            const type = 'sync-failover';
            const devices = ['someDevice'];
            const options = {
                autoSync: true,
                saveOnAutoSync: true,
                networkFailover: true,
                fullLoadOnSync: true,
                asmSync: true
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
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'someDevice'
                    }
                ]
            );

            test.expect(1);
            bigIp.cluster.createDeviceGroup(deviceGroup, type, devices, options)
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`),
                        {
                            autoSync: 'enabled',
                            fullLoadOnSync: true,
                            asmSync: 'enabled',
                            saveOnAutoSync: true,
                            networkFailover: 'enabled'
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },
    },

    testDeleteDeviceGroup: {
        testDeviceGroupDoesntExist(test) {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'def' }]);

            test.expect(2);
            bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDeviceGroupExists(test) {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'abc' }]);

            test.expect(2);
            bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'delete');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/abc');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDevicesRemoved(test) {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'abc' }]);

            test.expect(1);
            bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/cm/device-group/abc'), { devices: [] }
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testConfigSync: {
        testSetConfigSyncIp(test) {
            const ip = '1.2.3.4';

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: localHostname
                }
            );

            test.expect(3);
            bigIp.cluster.configSyncIp(ip)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device/~Common~${localHostname}`);
                    test.deepEqual(icontrolMock.lastCall.body, { configsyncIp: ip });
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSyncBasic(test) {
            test.expect(4);
            bigIp.cluster.sync('to-group', deviceGroup)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    test.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    test.strictEqual(
                        icontrolMock.lastCall.body.utilCmdArgs, `config-sync  to-group ${deviceGroup}`
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSyncForceFullLoadPush(test) {
            test.expect(4);
            bigIp.cluster.sync('to-group', deviceGroup, true)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    test.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    test.strictEqual(
                        icontrolMock.lastCall.body.utilCmdArgs,
                        `config-sync force-full-load-push to-group ${deviceGroup}`
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSyncComplete(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
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

            test.expect(1);
            bigIp.cluster.syncComplete()
                .then(() => {
                    test.ok(true);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSyncNotComplete(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'red'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            test.expect(1);
            bigIp.cluster.syncComplete(util.NO_RETRY)
                .then(() => {
                    test.ok(false, 'syncComplete should have thrown.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSyncCompleteConnectedDevices(test) {
            const recommendedGroup = 'device_trust_group';

            /* eslint-disable max-len */
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'red'
                                    },
                                    'https://localhost/mgmt/tm/cm/syncStatus/0/details': {
                                        nestedStats: {
                                            entries: {
                                                0: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'device1: connected'
                                                            }
                                                        }
                                                    }
                                                },
                                                1: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'device2: connected'
                                                            }
                                                        }
                                                    }
                                                },
                                                2: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'badHost: disconnected'
                                                            }
                                                        }
                                                    }
                                                },
                                                3: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: `Recommended action: to group ${recommendedGroup}`
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
            /* eslint-enable max-len */

            test.expect(1);
            bigIp.cluster.syncComplete(util.NO_RETRY, { connectedDevices: ['device1', 'device2'] })
                .then(() => {
                    test.ok(true);
                })
                .catch(() => {
                    test.ok(false, 'Should have been resolved due to connectedDevices.');
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGetCmSyncStatus: {
        testBasic(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'red'
                                    },
                                    'https://localhost/mgmt/tm/cm/syncStatus/0/details': {
                                        nestedStats: {
                                            entries: {
                                                'https://localhost/mgmt/tm/cm/syncStatus/0/details/0': {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'iAmDisconnected: disconnected'
                                                            }
                                                        }
                                                    }
                                                },
                                                'https://localhost/mgmt/tm/cm/syncStatus/0/details/1': {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'iAmConnected: connected'
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
                    kind: 'tm:cm:sync-status:sync-statusstats',
                    selfLink: 'https://localhost/mgmt/tm/cm/sync-status?ver=13.0.0'
                }
            );

            test.expect(4);
            bigIp.cluster.getCmSyncStatus()
                .then((response) => {
                    test.strictEqual(response.connected.length, 1);
                    test.notStrictEqual(response.connected.indexOf('iAmConnected'), -1);
                    test.strictEqual(response.disconnected.length, 1);
                    test.notStrictEqual(response.disconnected.indexOf('iAmDisconnected'), -1);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoEntries(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'red'
                                    }
                                }
                            }
                        }
                    },
                    kind: 'tm:cm:sync-status:sync-statusstats',
                    selfLink: 'https://localhost/mgmt/tm/cm/sync-status?ver=13.0.0'
                }
            );

            test.expect(2);
            bigIp.cluster.getCmSyncStatus()
                .then((response) => {
                    test.strictEqual(response.connected.length, 0);
                    test.strictEqual(response.disconnected.length, 0);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testIsInDeviceGroup: {
        testGroupDoesNotExist(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/device-group/',
                [
                    {
                        name: 'foo'
                    }
                ]
            );

            test.expect(1);
            bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    test.strictEqual(isInGroup, false);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testInGroup(test) {
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
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: localHostname
                    }
                ]
            );

            test.expect(1);
            bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    test.ok(isInGroup);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotInGroup(test) {
            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'someOtherDevice'
                    }
                ]
            );

            test.expect(1);
            bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    test.ok(!isInGroup);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testIsInTrustGroup: {
        testInGroup(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: [`/Common/${localHostname}`]
                }
            );

            test.expect(1);
            bigIp.cluster.isInTrustGroup(localHostname)
                .then((isInGroup) => {
                    test.ok(isInGroup);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotInGroup(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/notMe']
                }
            );

            test.expect(1);
            bigIp.cluster.isInTrustGroup(localHostname)
                .then((isInGroup) => {
                    test.ok(!isInGroup);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testJoinCluster: {
        setUp(callback) {
            icontrolMock.reset();
            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        hostname: localHostname,
                        selfDevice: 'true'
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
                '/tm/cm/device-group/',
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
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
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

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: localHostname,
                    managementAddress: '5.6.7.8',
                    version: '12.1.0'
                }
            );

            utilCallInSerial = util.callInSerial;
            bigIpList = BigIp.prototype.list;
            bigIpCreate = BigIp.prototype.create;
            bigIpReady = BigIp.prototype.ready;
            bigIpDeviceInfo = BigIp.prototype.deviceInfo;

            // In this test, the code under test creates its own remoteBigIp object
            // so we need to do dependency injection a little differently
            /* eslint-disable prefer-spread, prefer-rest-params */
            BigIp.prototype.list = function list() {
                return icontrolMock.list.apply(icontrolMock, arguments);
            };
            BigIp.prototype.create = function create() {
                return icontrolMock.create.apply(icontrolMock, arguments);
            };
            /* eslint-enable prefer-spread, prefer-rest-params */
            BigIp.prototype.ready = function ready() {
                return q();
            };
            BigIp.prototype.deviceInfo = function deviceInfo() {
                return q({
                    hostname: 'remoteHost',
                    managementAddress: '5.6.7.8',
                    version: '12.1.0'
                });
            };

            callback();
        },

        tearDown(callback) {
            BigIp.prototype.list = bigIpList;
            BigIp.prototype.create = bigIpCreate;
            BigIp.prototype.ready = bigIpReady;
            BigIp.prototype.deviceInfo = bigIpDeviceInfo;
            util.callInSerial = utilCallInSerial;
            callback();
        },

        testMissingParameters(test) {
            test.expect(1);
            test.throws(() => {
                bigIp.cluster.joinCluster();
            });
            test.done();
        },

        testBasic(test) {
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            test.expect(3);
            bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    test.strictEqual(syncRequest.command, 'run');
                    test.notStrictEqual(syncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    test.notStrictEqual(syncRequest.utilCmdArgs.indexOf(deviceGroup), -1);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBelow121(test) {
            BigIp.prototype.deviceInfo = function deviceInfo() {
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
                `/tm/cm/device-group/datasync-global-dg/devices/${localHostname}`,
                {}
            );

            test.expect(1);
            bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const syncRequest =
                        icontrolMock.getRequest(
                            'modify', `/tm/cm/device-group/datasync-global-dg/devices/${localHostname}`
                        );
                    test.deepEqual(syncRequest, { 'set-sync-leader': true });
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMultipleDevices(test) {
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        hostname: 'foo',
                        selfDevice: 'false'
                    },
                    {
                        hostname: localHostname,
                        selfDevice: 'true'
                    }
                ]
            );

            test.expect(1);
            bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const addToTrustRequest = icontrolMock.getRequest('create', '/tm/cm/add-to-trust');
                    test.strictEqual(addToTrustRequest.deviceName, localHostname);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRecommendedAction(test) {
            const recommendedGroup = 'otherDeviceGroup';

            /* eslint-disable max-len */
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'red'
                                    },
                                    'https://localhost/mgmt/tm/cm/syncStatus/0/details': {
                                        nestedStats: {
                                            entries: {
                                                1: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: `Recommended action: to group ${recommendedGroup}`
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
            /* eslint-enable max-len */

            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            test.expect(3);
            bigIp.cluster.joinCluster(
                deviceGroup,
                'remoteHost',
                'remoteUser',
                'remotePassword',
                false,
                { syncDelay: 5, syncCompDelay: 5 }
            )
                .then(() => {
                    test.ok(false, 'Should have been rejected due to our mock.');
                })
                .catch(() => {
                    // promise will be rejected because our final syncComplete never passes because
                    // we mocked it, but check that the last sync request was for the recommendedGroup
                    let syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    let lastSyncRequest;

                    while (syncRequest) {
                        lastSyncRequest = syncRequest;
                        syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    }
                    test.strictEqual(lastSyncRequest.command, 'run');
                    test.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    test.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf(recommendedGroup), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testLocal(test) {
            const remoteIp = '1.2.3.4';
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            test.expect(1);
            bigIp.cluster.joinCluster(
                deviceGroup,
                remoteIp,
                'remoteUser',
                'remotePassword',
                true,
                { syncDelay: 5 }
            )
                .then(() => {
                    const addToTrustRequest = icontrolMock.getRequest('create', '/tm/cm/add-to-trust');
                    test.strictEqual(addToTrustRequest.device, remoteIp);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testLocalAlreadyInGroup(test) {
            const remoteIp = '1.2.3.4';
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            const isInDeviceGroup = bigIp.cluster.isInDeviceGroup;
            bigIp.cluster.isInDeviceGroup = () => {
                return q(true);
            };

            test.expect(1);
            bigIp.cluster.joinCluster(
                deviceGroup,
                remoteIp,
                'remoteUser',
                'remotePassword',
                true,
                { syncDelay: 5 }
            )
                .then((response) => {
                    test.strictEqual(response, false);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    bigIp.cluster.isInDeviceGroup = isInDeviceGroup;
                    test.done();
                });
        },

        testRemote(test) {
            const remoteIp = '1.2.3.4';
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            test.expect(1);
            bigIp.cluster.joinCluster(
                deviceGroup,
                remoteIp,
                'remoteUser',
                'remotePassword',
                false,
                { syncDelay: 5 }
            )
                .then(() => {
                    const addToTrustRequest = icontrolMock.getRequest('create', '/tm/cm/add-to-trust');
                    test.strictEqual(addToTrustRequest.device, '5.6.7.8');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSyncCompDevices(test) {
            const recommendedGroup = 'device_trust_group';

            /* eslint-disable max-len */
            icontrolMock.when(
                'list',
                '/tm/cm/sync-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/sync-status/0': {
                            nestedStats: {
                                entries: {
                                    color: {
                                        description: 'red'
                                    },
                                    'https://localhost/mgmt/tm/cm/syncStatus/0/details': {
                                        nestedStats: {
                                            entries: {
                                                0: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'device1: connected'
                                                            }
                                                        }
                                                    }
                                                },
                                                1: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'device2: connected'
                                                            }
                                                        }
                                                    }
                                                },
                                                2: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: 'badHost: disconnected'
                                                            }
                                                        }
                                                    }
                                                },
                                                3: {
                                                    nestedStats: {
                                                        entries: {
                                                            details: {
                                                                description: `Recommended action: to group ${recommendedGroup}`
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
            /* eslint-enable max-len */

            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            test.expect(3);
            bigIp.cluster.joinCluster(
                deviceGroup,
                'remoteHost',
                'remoteUser',
                'remotePassword',
                false,
                { syncDelay: 5, syncCompDelay: 5, syncCompDevices: ['device1'] }
            )
                .catch(() => {
                    test.ok(false, 'Should have been resolved due to syncCompDevices.');
                })
                .finally(() => {
                    // check that the last sync request was for the recommendedGroup
                    let syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    let lastSyncRequest;

                    while (syncRequest) {
                        lastSyncRequest = syncRequest;
                        syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    }
                    test.strictEqual(lastSyncRequest.command, 'run');
                    test.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    test.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf(recommendedGroup), -1);
                    test.done();
                });
        }
    },

    testRemoveFromCluster: {
        setUp(callback) {
            icontrolMock.when(
                'list',
                '/tm/cm/device-group/',
                [
                    {
                        name: deviceGroup
                    }
                ]
            );
            callback();
        },

        testOneDevice(test) {
            const device1 = 'device1';
            const device2 = 'device2';

            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
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
                    caDevices: [`/Common/${device1}`, `/Common/${device2}`]
                }
            );

            icontrolMock.when(
                'create',
                '/tm/cm/remove-from-trust',
                {}
            );

            test.expect(2);
            bigIp.cluster.removeFromCluster(device1)
                .then(() => {
                    const modifyFromDeviceGroupRequest =
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`);
                    const removeFromTrustRequest =
                        icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    test.deepEqual(modifyFromDeviceGroupRequest.devices, [device2]);
                    test.strictEqual(removeFromTrustRequest.deviceName, device1);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testTwoDevices(test) {
            const device1 = 'device1';
            const device2 = 'device2';

            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
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
                    caDevices: [`/Common/${device1}`, `/Common/${device2}`]
                }
            );

            icontrolMock.when(
                'create',
                '/tm/cm/remove-from-trust',
                {}
            );

            test.expect(3);
            bigIp.cluster.removeFromCluster([device1, device2])
                .then(() => {
                    const modifyFromDeviceGroupRequest =
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`);
                    let removeFromTrustRequest =
                        icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    test.deepEqual(modifyFromDeviceGroupRequest.devices, []);
                    test.strictEqual(removeFromTrustRequest.deviceName, device1);
                    removeFromTrustRequest = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    test.strictEqual(removeFromTrustRequest.deviceName, device2);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRemoveFromDeviceGroup: {
        testInGroup(test) {
            const device1 = 'device1';
            const device2 = 'device2';

            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: device1
                    },
                    {
                        name: device2
                    }
                ]
            );

            test.expect(3);
            bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}`);
                    test.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            devices: [device2]
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testArrayInGroup(test) {
            const device1 = 'device1';
            const device2 = 'device2';
            const keepMe = 'keepMe';

            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
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

            test.expect(3);
            bigIp.cluster.removeFromDeviceGroup(['device1', 'device2'], deviceGroup)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}`);
                    test.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            devices: [keepMe]
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotInGroup(test) {
            const device1 = 'device1';
            const device2 = 'device2';

            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: device2
                    }
                ]
            );

            test.expect(2);
            bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}/devices`
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRemoveAllFromDeviceGroup: {
        testBasic(test) {
            test.expect(3);
            bigIp.cluster.removeAllFromDeviceGroup('abc')
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, ('modify'));
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/abc');
                    test.deepEqual(icontrolMock.lastCall.body, { devices: [] });
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDeviceTrustGroup(test) {
            test.expect(1);
            bigIp.cluster.removeAllFromDeviceGroup('device_trust_group')
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, '');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRemoveFromTrust: {
        testInTrust(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice', `/Common/${localHostname}`]
                }
            );

            icontrolMock.when(
                'create',
                '/tm/cm/remove-from-trust',
                {}
            );

            test.expect(3);
            bigIp.cluster.removeFromTrust(localHostname)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/remove-from-trust');
                    test.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testArrayInTrust(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/device1', '/Common/device2', '/Common/someOtherDevice']
                }
            );

            icontrolMock.when(
                'create',
                '/tm/cm/remove-from-trust',
                {}
            );

            test.expect(2);
            bigIp.cluster.removeFromTrust(['device1', 'device2'])
                .then(() => {
                    let request = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    test.deepEqual(
                        request,
                        {
                            command: 'run',
                            name: 'Root',
                            caDevice: true,
                            deviceName: 'device1'
                        }
                    );
                    request = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    test.deepEqual(
                        request,
                        {
                            command: 'run',
                            name: 'Root',
                            caDevice: true,
                            deviceName: 'device2'
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotInTrust(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice']
                }
            );

            test.expect(2);
            bigIp.cluster.removeFromTrust(localHostname)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testResetTrust: {
        testBelowV13(test) {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '12.1.0'
                }
            );

            test.expect(2);
            bigIp.cluster.resetTrust()
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'delete');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testV13Above(test) {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '13.0.0'
                }
            );

            test.expect(2);
            bigIp.cluster.resetTrust()
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'delete');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
