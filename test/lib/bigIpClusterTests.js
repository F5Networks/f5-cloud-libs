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
const assert = require('assert');
const util = require('../../../f5-cloud-libs').util;

describe('bigip cluster tests', () => {
    const localHostname = 'localhostname';
    const deviceGroup = 'testDeviceGroup';

    let authnMock;
    let utilMock;
    let BigIp;
    let bigIp;
    let icontrolMock;

    let utilCallInSerial;
    let bigIpList;
    let bigIpCreate;
    let bigIpReady;
    let bigIpDeviceInfo;

    // Our tests cause too many event listeners. Turn off the check.
    process.setMaxListeners(0);

    beforeEach(() => {
        /* eslint-disable global-require */
        icontrolMock = require('../testUtil/icontrolMock');
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
            });
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('add to trust test', () => {
        it('not in trust test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice']
                }
            );

            return bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/add-to-trust');
                    assert.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                });
        });

        it('already in trust test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice', `/Common/${localHostname}`]

                }
            );

            return bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                });
        });
    });

    describe('add to device group test', () => {
        it('not in device group test', () => {
            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'notTheLocalDevice'
                    }
                ]
            );

            return bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/~Common~${deviceGroup}/devices`
                    );
                    assert.deepEqual(icontrolMock.lastCall.body, { name: localHostname });
                });
        });

        it('already in device group test', () => {
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

            return bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}/devices`
                    );
                });
        });
    });

    describe('are in trust group test', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/device1', '/Common/device2']
                }
            );
        });

        it('none in group test', () => {
            const devices = ['device3', 'device4'];

            return bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    assert.strictEqual(devicesInGroup.length, 0);
                });
        });

        it('some in group test', () => {
            const devices = ['device1', 'device3'];

            return bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    assert.strictEqual(devicesInGroup.length, 1);
                    assert.strictEqual(devicesInGroup.indexOf('device1'), 0);
                });
        });

        it('all in group test', () => {
            const devices = ['device1', 'device2'];

            return bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    assert.strictEqual(devicesInGroup.length, 2);
                    assert.strictEqual(devicesInGroup.indexOf('device1'), 0);
                    assert.strictEqual(devicesInGroup.indexOf('device2'), 1);
                });
        });
    });

    describe('create trust group test', () => {
        it('already exists with device in group test', (done) => {
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

            bigIp.cluster.createDeviceGroup(deviceGroup, 'sync-only', devices)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}/devices`
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('already exists device not in group test', () => {
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

            return bigIp.cluster.createDeviceGroup(deviceGroup, 'sync-only', devices)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/~Common~${deviceGroup}/devices`
                    );
                });
        });

        it('defaults test', () => {
            const name = 'groupFoo';
            const type = 'sync-failover';
            const devices = ['device1', 'device2'];

            return bigIp.cluster.createDeviceGroup(name, type, devices)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                    assert.strictEqual(icontrolMock.lastCall.body.name, name);
                    assert.strictEqual(icontrolMock.lastCall.body.type, type);
                    assert.strictEqual(icontrolMock.lastCall.body.devices.length, devices.length);
                    devices.forEach((device) => {
                        assert.notStrictEqual(icontrolMock.lastCall.body.devices.indexOf(device), -1);
                    });
                    assert.strictEqual(icontrolMock.lastCall.body.autoSync, 'disabled');
                    assert.strictEqual(icontrolMock.lastCall.body.fullLoadOnSync, false);
                    assert.strictEqual(icontrolMock.lastCall.body.asmSync, 'disabled');
                });
        });

        it('full test', () => {
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

            return bigIp.cluster.createDeviceGroup(name, type, devices, options)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                    assert.strictEqual(icontrolMock.lastCall.body.name, name);
                    assert.strictEqual(icontrolMock.lastCall.body.type, type);
                    assert.strictEqual(icontrolMock.lastCall.body.devices.length, devices.length);
                    devices.forEach((device) => {
                        assert.notStrictEqual(icontrolMock.lastCall.body.devices.indexOf(device), -1);
                    });
                    assert.strictEqual(icontrolMock.lastCall.body.autoSync, 'enabled');
                    assert.strictEqual(icontrolMock.lastCall.body.saveOnAutoSync, true);
                    assert.strictEqual(icontrolMock.lastCall.body.fullLoadOnSync, true);
                    assert.strictEqual(icontrolMock.lastCall.body.asmSync, 'enabled');
                    assert.strictEqual(icontrolMock.lastCall.body.networkFailover, 'enabled');
                });
        });

        it('sync only test', () => {
            return bigIp.cluster.createDeviceGroup('abc', 'sync-only', [])
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.type, 'sync-only');
                });
        });

        it('single device test', () => {
            const name = 'groupFoo';
            const type = 'sync-failover';
            const device = 'device1';

            return bigIp.cluster.createDeviceGroup(name, type, device)
                .then(() => {
                    assert.deepEqual(icontrolMock.lastCall.body.devices, [device]);
                });
        });

        it('no name test', () => {
            return bigIp.cluster.createDeviceGroup()
                .then(() => {
                    assert.ok(false, 'Should have thrown deviceGroup required');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('deviceGroup is required'), -1);
                });
        });

        it('bad type test', () => {
            return bigIp.cluster.createDeviceGroup('abc', 'foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown bad type');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('type must be'), -1);
                });
        });

        it('no type test', () => {
            return bigIp.cluster.createDeviceGroup('abc')
                .then(() => {
                    assert.ok(false, 'Should have thrown no type');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('type must be'), -1);
                });
        });

        it('no devices test', () => {
            return bigIp.cluster.createDeviceGroup('abc', 'sync-failover', [])
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.devices.length, 0);
                });
        });

        it('update settings test', () => {
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

            return bigIp.cluster.createDeviceGroup(deviceGroup, type, devices, options)
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`),
                        {
                            autoSync: 'enabled',
                            fullLoadOnSync: true,
                            asmSync: 'enabled',
                            saveOnAutoSync: true,
                            networkFailover: 'enabled'
                        }
                    );
                });
        });
    });

    describe('delete device group test', () => {
        it('device group doesnt exist test', () => {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'def' }]);

            return bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                });
        });

        it('device group exists test', () => {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'abc' }]);

            return bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/abc');
                });
        });

        it('devices removed test', () => {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'abc' }]);

            return bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/cm/device-group/abc'), { devices: [] }
                    );
                });
        });
    });

    describe('config sync test', () => {
        it('set config sync ip test', () => {
            const ip = '1.2.3.4';

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: localHostname
                }
            );

            return bigIp.cluster.configSyncIp(ip)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device/~Common~${localHostname}`);
                    assert.deepEqual(icontrolMock.lastCall.body, { configsyncIp: ip });
                });
        });

        it('sync basic test', () => {
            return bigIp.cluster.sync('to-group', deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    assert.strictEqual(
                        icontrolMock.lastCall.body.utilCmdArgs, `config-sync  to-group ${deviceGroup}`
                    );
                });
        });

        it('sync force full load push test', () => {
            return bigIp.cluster.sync('to-group', deviceGroup, true)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    assert.strictEqual(
                        icontrolMock.lastCall.body.utilCmdArgs,
                        `config-sync force-full-load-push to-group ${deviceGroup}`
                    );
                });
        });

        it('sync complete test', () => {
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

            return bigIp.cluster.syncComplete()
                .then(() => {
                    assert.ok(true);
                });
        });

        it('sync not complete test', () => {
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

            return bigIp.cluster.syncComplete(util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'syncComplete should have thrown.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('sync complete connected devices test', () => {
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

            return bigIp.cluster.syncComplete(util.NO_RETRY, { connectedDevices: ['device1', 'device2'] })
                .then(() => {
                    assert.ok(true);
                });
        });
    });

    describe('get cm sync status test', () => {
        it('basic test', () => {
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

            return bigIp.cluster.getCmSyncStatus()
                .then((response) => {
                    assert.strictEqual(response.connected.length, 1);
                    assert.notStrictEqual(response.connected.indexOf('iAmConnected'), -1);
                    assert.strictEqual(response.disconnected.length, 1);
                    assert.notStrictEqual(response.disconnected.indexOf('iAmDisconnected'), -1);
                });
        });

        it('no entries test', () => {
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

            return bigIp.cluster.getCmSyncStatus()
                .then((response) => {
                    assert.strictEqual(response.connected.length, 0);
                    assert.strictEqual(response.disconnected.length, 0);
                });
        });
    });

    describe('is in device group test', () => {
        it('group does not exist test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/device-group/',
                [
                    {
                        name: 'foo'
                    }
                ]
            );

            return bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    assert.strictEqual(isInGroup, false);
                });
        });

        it('in group test', () => {
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

            return bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    assert.ok(isInGroup);
                });
        });

        it('not in group test', () => {
            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'someOtherDevice'
                    }
                ]
            );

            return bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    assert.ok(!isInGroup);
                });
        });
    });

    describe('in is trust group test', () => {
        it('in group test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: [`/Common/${localHostname}`]
                }
            );

            return bigIp.cluster.isInTrustGroup(localHostname)
                .then((isInGroup) => {
                    assert.ok(isInGroup);
                });
        });

        it('not in group test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/notMe']
                }
            );

            return bigIp.cluster.isInTrustGroup(localHostname)
                .then((isInGroup) => {
                    assert.ok(!isInGroup);
                });
        });
    });

    describe('join cluster test', () => {
        beforeEach(() => {
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
        });

        afterEach(() => {
            BigIp.prototype.list = bigIpList;
            BigIp.prototype.create = bigIpCreate;
            BigIp.prototype.ready = bigIpReady;
            BigIp.prototype.deviceInfo = bigIpDeviceInfo;
            util.callInSerial = utilCallInSerial;
        });

        it('missing parameters test', () => {
            assert.throws(() => {
                bigIp.cluster.joinCluster();
            });
        });

        it('basic test', () => {
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            return bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    assert.strictEqual(syncRequest.command, 'run');
                    assert.notStrictEqual(syncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    assert.notStrictEqual(syncRequest.utilCmdArgs.indexOf(deviceGroup), -1);
                });
        });

        it('below 121 test', () => {
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

            return bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const syncRequest =
                        icontrolMock.getRequest(
                            'modify', `/tm/cm/device-group/datasync-global-dg/devices/${localHostname}`
                        );
                    assert.deepEqual(syncRequest, { 'set-sync-leader': true });
                });
        });

        it('multiple devices test', () => {
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

            return bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const addToTrustRequest = icontrolMock.getRequest('create', '/tm/cm/add-to-trust');
                    assert.strictEqual(addToTrustRequest.deviceName, localHostname);
                });
        });

        it('recommended action test', () => {
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

            return bigIp.cluster.joinCluster(
                deviceGroup,
                'remoteHost',
                'remoteUser',
                'remotePassword',
                false,
                { syncDelay: 5, syncCompDelay: 5 }
            )
                .then(() => {
                    assert.ok(false, 'Should have been rejected due to our mock.');
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
                    assert.strictEqual(lastSyncRequest.command, 'run');
                    assert.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    assert.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf(recommendedGroup), -1);
                });
        });

        it('local test', () => {
            const remoteIp = '1.2.3.4';
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            return bigIp.cluster.joinCluster(
                deviceGroup,
                remoteIp,
                'remoteUser',
                'remotePassword',
                true,
                { syncDelay: 5 }
            )
                .then(() => {
                    const addToTrustRequest = icontrolMock.getRequest('create', '/tm/cm/add-to-trust');
                    assert.strictEqual(addToTrustRequest.device, remoteIp);
                });
        });

        it('local already in group test', () => {
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

            return bigIp.cluster.joinCluster(
                deviceGroup,
                remoteIp,
                'remoteUser',
                'remotePassword',
                true,
                { syncDelay: 5 }
            )
                .then((response) => {
                    assert.strictEqual(response, false);
                })
                .finally(() => {
                    bigIp.cluster.isInDeviceGroup = isInDeviceGroup;
                });
        });

        it('remote test', () => {
            const remoteIp = '1.2.3.4';
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            return bigIp.cluster.joinCluster(
                deviceGroup,
                remoteIp,
                'remoteUser',
                'remotePassword',
                false,
                { syncDelay: 5 }
            )
                .then(() => {
                    const addToTrustRequest = icontrolMock.getRequest('create', '/tm/cm/add-to-trust');
                    assert.strictEqual(addToTrustRequest.device, '5.6.7.8');
                })
                .catch((err) => {
                    assert.ok(false, err);
                });
        });

        it('sync comp devices test', () => {
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

            return bigIp.cluster.joinCluster(
                deviceGroup,
                'remoteHost',
                'remoteUser',
                'remotePassword',
                false,
                { syncDelay: 5, syncCompDelay: 5, syncCompDevices: ['device1'] }
            )
                .then(() => {
                    // check that the last sync request was for the recommendedGroup
                    let syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    let lastSyncRequest;

                    while (syncRequest) {
                        lastSyncRequest = syncRequest;
                        syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    }
                    assert.strictEqual(lastSyncRequest.command, 'run');
                    assert.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    assert.notStrictEqual(lastSyncRequest.utilCmdArgs.indexOf(recommendedGroup), -1);
                });
        });
    });

    describe('remove from cluster test', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                '/tm/cm/device-group/',
                [
                    {
                        name: deviceGroup
                    }
                ]
            );
        });

        it('one device test', () => {
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

            return bigIp.cluster.removeFromCluster(device1)
                .then(() => {
                    const modifyFromDeviceGroupRequest =
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`);
                    const removeFromTrustRequest =
                        icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    assert.deepEqual(modifyFromDeviceGroupRequest.devices, [device2]);
                    assert.strictEqual(removeFromTrustRequest.deviceName, device1);
                });
        });

        it('two devices test', () => {
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

            return bigIp.cluster.removeFromCluster([device1, device2])
                .then(() => {
                    const modifyFromDeviceGroupRequest =
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`);
                    let removeFromTrustRequest =
                        icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    assert.deepEqual(modifyFromDeviceGroupRequest.devices, []);
                    assert.strictEqual(removeFromTrustRequest.deviceName, device1);
                    removeFromTrustRequest = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    assert.strictEqual(removeFromTrustRequest.deviceName, device2);
                });
        });
    });

    describe('remove from device group test', () => {
        it('in group test', () => {
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

            return bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}`);
                    assert.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            devices: [device2]
                        }
                    );
                });
        });

        it('array in group test', () => {
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

            return bigIp.cluster.removeFromDeviceGroup(['device1', 'device2'], deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}`);
                    assert.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            devices: [keepMe]
                        }
                    );
                });
        });

        it('not in group test', () => {
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

            return bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}/devices`
                    );
                });
        });

        it('validate skip asm groups test', () => {
            const device1 = 'device1';

            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: device1
                    }
                ]
            );

            return bigIp.cluster.removeFromDeviceGroup(device1, 'datasync-foo-dg')
                .then(() => {
                    assert.notStrictEqual(icontrolMock.lastCall.method, 'list');
                    assert.notStrictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}/devices`
                    );
                });
        });
    });

    describe('remove all from device group test', () => {
        it('basic test', () => {
            return bigIp.cluster.removeAllFromDeviceGroup('abc')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, ('modify'));
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/abc');
                    assert.deepEqual(icontrolMock.lastCall.body, { devices: [] });
                });
        });
        it('device trust group test', () => {
            return bigIp.cluster.removeAllFromDeviceGroup('device_trust_group')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, '');
                });
        });
    });

    describe('remove from trust test', () => {
        it('in trust test', () => {
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

            return bigIp.cluster.removeFromTrust(localHostname)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/remove-from-trust');
                    assert.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                });
        });

        it('array in trust test', () => {
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

            return bigIp.cluster.removeFromTrust(['device1', 'device2'])
                .then(() => {
                    let request = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    assert.deepEqual(
                        request,
                        {
                            command: 'run',
                            name: 'Root',
                            caDevice: true,
                            deviceName: 'device1'
                        }
                    );
                    request = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    assert.deepEqual(
                        request,
                        {
                            command: 'run',
                            name: 'Root',
                            caDevice: true,
                            deviceName: 'device2'
                        }
                    );
                });
        });

        it('not in trust test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice']
                }
            );

            return bigIp.cluster.removeFromTrust(localHostname)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                });
        });
    });

    describe('reset trust test', () => {
        it('below v13 test', () => {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '12.1.0'
                }
            );

            return bigIp.cluster.resetTrust()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                });
        });

        it('v13 and above test', () => {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '13.0.0'
                }
            );

            return bigIp.cluster.resetTrust()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain');
                });
        });
    });
});
