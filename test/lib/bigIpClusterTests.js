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
        it('not in trust test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice']
                }
            );

            bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/add-to-trust');
                    assert.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('already in trust test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice', `/Common/${localHostname}`]

                }
            );

            bigIp.cluster.addToTrust(localHostname, 'host', 'user', 'pass')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('add to device group test', () => {
        it('not in device group test', (done) => {
            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'notTheLocalDevice'
                    }
                ]
            );

            bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/~Common~${deviceGroup}/devices`
                    );
                    assert.deepEqual(icontrolMock.lastCall.body, { name: localHostname });
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('already in device group test', (done) => {
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

            bigIp.cluster.addToDeviceGroup(localHostname, deviceGroup)
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

        it('none in group test', (done) => {
            const devices = ['device3', 'device4'];

            bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    assert.strictEqual(devicesInGroup.length, 0);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('some in group test', (done) => {
            const devices = ['device1', 'device3'];

            bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    assert.strictEqual(devicesInGroup.length, 1);
                    assert.strictEqual(devicesInGroup.indexOf('device1'), 0);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('all in group test', (done) => {
            const devices = ['device1', 'device2'];

            bigIp.cluster.areInTrustGroup(devices)
                .then((devicesInGroup) => {
                    assert.strictEqual(devicesInGroup.length, 2);
                    assert.strictEqual(devicesInGroup.indexOf('device1'), 0);
                    assert.strictEqual(devicesInGroup.indexOf('device2'), 1);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
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

        it('already exists device not in group test', (done) => {
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

            bigIp.cluster.createDeviceGroup(deviceGroup, 'sync-only', devices)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/tm/cm/device-group/~Common~${deviceGroup}/devices`
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('defaults test', (done) => {
            const name = 'groupFoo';
            const type = 'sync-failover';
            const devices = ['device1', 'device2'];

            bigIp.cluster.createDeviceGroup(name, type, devices)
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
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('full test', (done) => {
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

            bigIp.cluster.createDeviceGroup(name, type, devices, options)
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
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('sync only test', (done) => {
            bigIp.cluster.createDeviceGroup('abc', 'sync-only', [])
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.type, 'sync-only');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('single device test', (done) => {
            const name = 'groupFoo';
            const type = 'sync-failover';
            const device = 'device1';

            bigIp.cluster.createDeviceGroup(name, type, device)
                .then(() => {
                    assert.deepEqual(icontrolMock.lastCall.body.devices, [device]);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('no name test', (done) => {
            bigIp.cluster.createDeviceGroup()
                .then(() => {
                    assert.ok(false, 'Should have thrown deviceGroup required');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('deviceGroup is required'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('bad type test', (done) => {
            bigIp.cluster.createDeviceGroup('abc', 'foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown bad type');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('type must be'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('no type test', (done) => {
            bigIp.cluster.createDeviceGroup('abc')
                .then(() => {
                    assert.ok(false, 'Should have thrown no type');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('type must be'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('no devices test', (done) => {
            bigIp.cluster.createDeviceGroup('abc', 'sync-failover', [])
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.devices.length, 0);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('update settings test', (done) => {
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
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('delete device group test', () => {
        it('device group doesnt exist test', (done) => {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'def' }]);

            bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('device group exists test', (done) => {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'abc' }]);

            bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/abc');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('devices removed test', (done) => {
            icontrolMock.when('list', '/tm/cm/device-group/', [{ name: 'abc' }]);

            bigIp.cluster.deleteDeviceGroup('abc')
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/cm/device-group/abc'), { devices: [] }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('config sync test', () => {
        it('set config sync ip test', (done) => {
            const ip = '1.2.3.4';

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: localHostname
                }
            );

            bigIp.cluster.configSyncIp(ip)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device/~Common~${localHostname}`);
                    assert.deepEqual(icontrolMock.lastCall.body, { configsyncIp: ip });
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('sync basic test', (done) => {
            bigIp.cluster.sync('to-group', deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    assert.strictEqual(
                        icontrolMock.lastCall.body.utilCmdArgs, `config-sync  to-group ${deviceGroup}`
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('sync force full load push test', (done) => {
            bigIp.cluster.sync('to-group', deviceGroup, true)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'run');
                    assert.strictEqual(
                        icontrolMock.lastCall.body.utilCmdArgs,
                        `config-sync force-full-load-push to-group ${deviceGroup}`
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('sync complete test', (done) => {
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

            bigIp.cluster.syncComplete()
                .then(() => {
                    assert.ok(true);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('sync not complete test', (done) => {
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

            bigIp.cluster.syncComplete(util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'syncComplete should have thrown.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('sync complete connected devices test', (done) => {
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

            bigIp.cluster.syncComplete(util.NO_RETRY, { connectedDevices: ['device1', 'device2'] })
                .then(() => {
                    assert.ok(true);
                })
                .catch(() => {
                    assert.ok(false, 'Should have been resolved due to connectedDevices.');
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('get cm sync status test', () => {
        it('basic test', (done) => {
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

            bigIp.cluster.getCmSyncStatus()
                .then((response) => {
                    assert.strictEqual(response.connected.length, 1);
                    assert.notStrictEqual(response.connected.indexOf('iAmConnected'), -1);
                    assert.strictEqual(response.disconnected.length, 1);
                    assert.notStrictEqual(response.disconnected.indexOf('iAmDisconnected'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('no entries test', (done) => {
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

            bigIp.cluster.getCmSyncStatus()
                .then((response) => {
                    assert.strictEqual(response.connected.length, 0);
                    assert.strictEqual(response.disconnected.length, 0);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('is in device group test', () => {
        it('group does not exist test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/cm/device-group/',
                [
                    {
                        name: 'foo'
                    }
                ]
            );

            bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    assert.strictEqual(isInGroup, false);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('in group test', (done) => {
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

            bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    assert.ok(isInGroup);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('not in group test', (done) => {
            icontrolMock.when(
                'list',
                `/tm/cm/device-group/${deviceGroup}/devices`,
                [
                    {
                        name: 'someOtherDevice'
                    }
                ]
            );

            bigIp.cluster.isInDeviceGroup(localHostname, deviceGroup)
                .then((isInGroup) => {
                    assert.ok(!isInGroup);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('in is trust group test', () => {
        it('in group test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: [`/Common/${localHostname}`]
                }
            );

            bigIp.cluster.isInTrustGroup(localHostname)
                .then((isInGroup) => {
                    assert.ok(isInGroup);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('not in group test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/notMe']
                }
            );

            bigIp.cluster.isInTrustGroup(localHostname)
                .then((isInGroup) => {
                    assert.ok(!isInGroup);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
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

        it('missing parameters test', (done) => {
            assert.throws(() => {
                bigIp.cluster.joinCluster();
            });
            done();
        });

        it('basic test', (done) => {
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

            bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const syncRequest = icontrolMock.getRequest('create', '/tm/cm');
                    assert.strictEqual(syncRequest.command, 'run');
                    assert.notStrictEqual(syncRequest.utilCmdArgs.indexOf('to-group'), -1);
                    assert.notStrictEqual(syncRequest.utilCmdArgs.indexOf(deviceGroup), -1);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('below 121 test', (done) => {
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

            bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const syncRequest =
                        icontrolMock.getRequest(
                            'modify', `/tm/cm/device-group/datasync-global-dg/devices/${localHostname}`
                        );
                    assert.deepEqual(syncRequest, { 'set-sync-leader': true });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('multiple devices test', (done) => {
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

            bigIp.cluster.joinCluster(
                deviceGroup, 'remoteHost', 'remoteUser', 'remotePassword', false, { syncDelay: 5 }
            )
                .then(() => {
                    const addToTrustRequest = icontrolMock.getRequest('create', '/tm/cm/add-to-trust');
                    assert.strictEqual(addToTrustRequest.deviceName, localHostname);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('recommended action test', (done) => {
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

            bigIp.cluster.joinCluster(
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
                })
                .finally(() => {
                    done();
                });
        });

        it('local test', (done) => {
            const remoteIp = '1.2.3.4';
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

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
                    assert.strictEqual(addToTrustRequest.device, remoteIp);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('local already in group test', (done) => {
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

            bigIp.cluster.joinCluster(
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
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    bigIp.cluster.isInDeviceGroup = isInDeviceGroup;
                    done();
                });
        });

        it('remote test', (done) => {
            const remoteIp = '1.2.3.4';
            icontrolMock.when(
                'create',
                '/tm/cm',
                {}
            );

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
                    assert.strictEqual(addToTrustRequest.device, '5.6.7.8');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('sync comp devices test', (done) => {
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

            bigIp.cluster.joinCluster(
                deviceGroup,
                'remoteHost',
                'remoteUser',
                'remotePassword',
                false,
                { syncDelay: 5, syncCompDelay: 5, syncCompDevices: ['device1'] }
            )
                .catch(() => {
                    assert.ok(false, 'Should have been resolved due to syncCompDevices.');
                })
                .finally(() => {
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
                    done();
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

        it('one device test', (done) => {
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

            bigIp.cluster.removeFromCluster(device1)
                .then(() => {
                    const modifyFromDeviceGroupRequest =
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`);
                    const removeFromTrustRequest =
                        icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    assert.deepEqual(modifyFromDeviceGroupRequest.devices, [device2]);
                    assert.strictEqual(removeFromTrustRequest.deviceName, device1);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('two devices test', (done) => {
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

            bigIp.cluster.removeFromCluster([device1, device2])
                .then(() => {
                    const modifyFromDeviceGroupRequest =
                        icontrolMock.getRequest('modify', `/tm/cm/device-group/${deviceGroup}`);
                    let removeFromTrustRequest =
                        icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');

                    assert.deepEqual(modifyFromDeviceGroupRequest.devices, []);
                    assert.strictEqual(removeFromTrustRequest.deviceName, device1);
                    removeFromTrustRequest = icontrolMock.getRequest('create', '/tm/cm/remove-from-trust');
                    assert.strictEqual(removeFromTrustRequest.deviceName, device2);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('remove from device group test', () => {
        it('in group test', (done) => {
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

            bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}`);
                    assert.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            devices: [device2]
                        }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('array in group test', (done) => {
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

            bigIp.cluster.removeFromDeviceGroup(['device1', 'device2'], deviceGroup)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/cm/device-group/${deviceGroup}`);
                    assert.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            devices: [keepMe]
                        }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('not in group test', (done) => {
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

            bigIp.cluster.removeFromDeviceGroup(device1, deviceGroup)
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

        it('validate skip asm groups test', (done) => {
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

            bigIp.cluster.removeFromDeviceGroup(device1, 'datasync-foo-dg')
                .then(() => {
                    assert.notStrictEqual(icontrolMock.lastCall.method, 'list');
                    assert.notStrictEqual(
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
    });

    describe('remove all from device group test', () => {
        it('basic test', (done) => {
            bigIp.cluster.removeAllFromDeviceGroup('abc')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, ('modify'));
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/device-group/abc');
                    assert.deepEqual(icontrolMock.lastCall.body, { devices: [] });
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
        it('device trust group test', (done) => {
            bigIp.cluster.removeAllFromDeviceGroup('device_trust_group')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, '');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('remove from trust test', () => {
        it('in trust test', (done) => {
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

            bigIp.cluster.removeFromTrust(localHostname)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/remove-from-trust');
                    assert.strictEqual(icontrolMock.lastCall.body.deviceName, localHostname);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('array in trust test', (done) => {
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

            bigIp.cluster.removeFromTrust(['device1', 'device2'])
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
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('not in trust test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/cm/trust-domain/Root',
                {
                    caDevices: ['/Common/someOtherDevice']
                }
            );

            bigIp.cluster.removeFromTrust(localHostname)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('reset trust test', () => {
        it('below v13 test', (done) => {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '12.1.0'
                }
            );

            bigIp.cluster.resetTrust()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain/Root');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('v13 and above test', (done) => {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '13.0.0'
                }
            );

            bigIp.cluster.resetTrust()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/cm/trust-domain');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });
});
