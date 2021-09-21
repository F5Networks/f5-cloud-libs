/**
 * Copyright 2017-2018 F5 Networks, Inc.
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

const assert = require('assert');

describe('BIGIQ 5.2.0 License Provider Tests', () => {
    const poolName = 'myLicensePool';
    const poolUuid = '1234';
    const licenseUuid = '5678';
    const bigIpHostname = 'myBigIqHost';
    const LICENSE_PATH = '/cm/device/licensing/pool/regkey/licenses/';
    const regKey = '1234';
    const memberId = '5678';

    let util;
    let BigIqProvider;
    let provider;
    let icontrolMock;

    /* eslint-disable global-require */

    beforeEach(() => {
        util = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../lib/bigIq52LicenseProvider');
        provider = new BigIqProvider();
        provider.bigIp = {
            user: 'user',
            password: 'password'
        };
    });

    describe('Constructor Tests', () => {
        it('should set logger', () => {
            const logger = {
                a: 1,
                b: 2
            };

            provider = new BigIqProvider({}, { logger });
            assert.deepStrictEqual(provider.logger, logger);
        });

        it('should set logger options', () => {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            assert.doesNotThrow(() => {
                return new BigIqProvider({ loggerOptions });
            });
        });
    });

    describe('Get Unmanaged Device License Tests', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}?$select=id,name`,
                [
                    {
                        name: 'pool1',
                        id: poolUuid
                    }
                ]
            );
        });

        it('empty pools test', () => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}?$select=id,name`,
                []
            );

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown empty pools.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('no pools test', () => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}?$select=id,name`,
                {}
            );

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown no pools.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('No license pool'), -1);
                });
        });

        it('pool query error test', () => {
            icontrolMock.fail(
                'list',
                `${LICENSE_PATH}?$select=id,name`
            );

            provider.getLicenseTimeout = function getLicenseTimeout() { return util.SHORT_RETRY; };

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown query error.');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'We were told to fail this.');
                });
        });

        it('no active reg keys test', () => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/offerings?$select=licenseState`,
                [
                    {
                        licenseState: {
                            licenseStartDateTime: undefined,
                            licenseEndDateTime: undefined
                        }
                    }
                ]
            );

            util.MEDIUM_RETRY = { maxRetries: 0, retryIntervalMs: 0 };

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(() => {
                    assert.ok(false, 'Should have thrown no active licenses.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('No valid reg keys'), -1);
                });
        });

        it('no valid reg keys test', () => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/offerings?$select=licenseState`,
                [
                    {
                        licenseState: {
                            licenseStartDateTime: new Date(1970, 1, 1),
                            licenseEndDateTime: new Date(2999, 12, 31),
                            registrationKey: regKey
                        }
                    }
                ]
            );

            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
                [
                    {
                        foo: 'bar'
                    }
                ]
            );

            util.MEDIUM_RETRY = { maxRetries: 0, retryIntervalMs: 0 };

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(() => {
                    assert.ok(false, 'Should have thrown no valid licenses.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('No valid reg keys'), -1);
                });
        });

        it('license request error test', () => {
            icontrolMock.fail('list', `${LICENSE_PATH}${poolUuid}/offerings?$select=licenseState`);

            util.MEDIUM_RETRY = { maxRetries: 0, retryIntervalMs: 0 };

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(() => {
                    assert.ok(false, 'Should have thrown license error.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('We were told to fail this.'), -1);
                });
        });

        it('get members for key error test', () => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/offerings?$select=licenseState`,
                [
                    {
                        licenseState: {
                            licenseStartDateTime: new Date(1970, 1, 1),
                            licenseEndDateTime: new Date(2999, 12, 31),
                            registrationKey: regKey
                        }
                    }
                ]
            );

            icontrolMock.fail('list', `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`);

            util.MEDIUM_RETRY = { maxRetries: 0, retryIntervalMs: 0 };

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(() => {
                    assert.ok(false, 'Should have thrown license error.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('No valid reg keys'), -1);
                });
        });

        describe('Licensed Tests', () => {
            beforeEach(() => {
                icontrolMock.when(
                    'list',
                    `${LICENSE_PATH}${poolUuid}/offerings?$select=licenseState`,
                    [
                        {
                            licenseState: {
                                licenseStartDateTime: new Date(1970, 1, 1),
                                licenseEndDateTime: new Date(2999, 12, 31),
                                registrationKey: regKey
                            }
                        }
                    ]
                );

                icontrolMock.when(
                    'list',
                    `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
                    []
                );

                provider.getLicenseTimeout = function getLicenseTimeout() { return util.SHORT_RETRY; };
            });

            it('licensed immediately test', () => {
                icontrolMock.when(
                    'create',
                    `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
                    {
                        status: 'LICENSED'
                    }
                );

                return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                    .then(() => {
                        assert.deepStrictEqual(icontrolMock.getRequest(
                            'create',
                            `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`
                        ),
                        {
                            deviceAddress: 'bigIpMgmtAddress:443',
                            username: 'user',
                            password: 'password'
                        });
                    });
            });

            it('licensed later test', () => {
                icontrolMock.when(
                    'create',
                    `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
                    {
                        id: memberId,
                        status: 'FOOBAR'
                    }
                );

                icontrolMock.when(
                    'list',
                    `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members/${memberId}`,
                    {
                        status: 'LICENSED'
                    }
                );

                return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'list');
                        assert.strictEqual(
                            icontrolMock.lastCall.path,
                            `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members/${memberId}`
                        );
                    });
            });

            it('never licensed test', () => {
                icontrolMock.when(
                    'create',
                    `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
                    {
                        id: memberId,
                        status: 'FOOBAR'
                    }
                );

                icontrolMock.when(
                    'list',
                    `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members/${memberId}`,
                    {
                        status: 'FOOBAR'
                    }
                );

                util.MEDIUM_RETRY = { maxRetries: 0, retryIntervalMs: 0 };

                return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                    .then(() => {
                        assert.ok(false, 'should thrown not licensed');
                    })
                    .catch((err) => {
                        assert.notStrictEqual(err.message.indexOf('Giving up'), -1);
                    });
            });
        });
    });

    describe('Revoke License Tests', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}?$select=id,name`,
                [
                    {
                        name: 'foo',
                        id: '0001'
                    },
                    {
                        name: poolName,
                        id: poolUuid
                    },
                    {
                        name: 'bar',
                        id: '0002'
                    }
                ]
            );

            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/offerings?$select=licenseState`,
                [
                    {
                        licenseState: {
                            registrationKey: '0001'
                        }
                    },
                    {
                        licenseState: {
                            registrationKey: regKey
                        }
                    },
                    {
                        licenseState: {
                            registrationKey: '0002'
                        }
                    }
                ]
            );

            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
                [
                    {
                        deviceName: 'foo',
                        id: '1000'
                    },
                    {
                        deviceName: bigIpHostname,
                        id: memberId
                    },
                    {
                        deviceName: 'bar',
                        id: '2000'
                    }
                ]
            );

            icontrolMock.when(
                'delete',
                `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members/${memberId}`,
                {}
            );
        });

        it('basic test', () => {
            return provider.revoke(icontrolMock, poolName, { hostname: bigIpHostname })
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'delete',
                        `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members/${memberId}`
                    );
                    assert.deepStrictEqual(
                        request,
                        {
                            username: 'user',
                            password: 'password',
                            id: licenseUuid
                        }
                    );
                });
        });

        it('no license for host test', () => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`,
                [
                    {
                        deviceName: 'foo',
                        id: '1000'
                    },
                    {
                        deviceName: 'bar',
                        id: '2000'
                    }
                ]
            );

            return provider.revoke(icontrolMock, poolName, { hostname: bigIpHostname })
                .then(() => {
                    assert.ok(false, 'should have thrown no license for host');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'License for host not found.');
                });
        });

        it('get members error test', () => {
            icontrolMock.fail('list', `${LICENSE_PATH}${poolUuid}/offerings/${regKey}/members`);

            return provider.revoke(icontrolMock, poolName, { hostname: bigIpHostname })
                .then(() => {
                    assert.ok(false, 'should have thrown no license for host');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'License for host not found.');
                });
        });
    });

    it('get license timeout test', () => {
        assert.deepStrictEqual(provider.getLicenseTimeout(), { maxRetries: 40, retryIntervalMs: 5000 });
    });
});
