/**
 * Copyright 2017-2018 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const assert = require('assert');

describe('BIGIQ 5.0.0 License Provider Tests', () => {
    const poolName = 'myLicensePool';
    const poolUuid = '1234';
    let licenseUuid = '5678';
    const bigIpHostname = 'myBigIqHost';
    const LICENSE_PATH = '/cm/shared/licensing/pools/';

    let util;
    let BigIqProvider;
    let provider;
    let icontrolMock;

    beforeEach(() => {
        /* eslint-disable global-require */
        util = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../lib/bigIq50LicenseProvider');
        /* eslint-enable global-require */

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
    });

    it('should set logger options', () => {
        const loggerOptions = {
            a: 1,
            b: 2
        };

        assert.doesNotThrow(() => {
            new BigIqProvider({ loggerOptions }); // eslint-disable-line no-new
        });
    });

    describe('Get Unmanaged Device License Tests', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                '/cm/shared/licensing/pools/?$select=uuid,name',
                [
                    {
                        name: 'pool1',
                        uuid: '1'
                    },
                    {
                        name: 'pool2',
                        uuid: '2'
                    }
                ]
            );
        });

        it('empty pools test', () => {
            icontrolMock.when(
                'list',
                '/cm/shared/licensing/pools/?$select=uuid,name',
                []
            );

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown empty pools.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('No license pool'), -1);
                });
        });

        it('bad pool response test', () => {
            icontrolMock.when(
                'list',
                '/cm/shared/licensing/pools/?$select=uuid,name',
                {}
            );

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown no pools.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Error getting license pools'), -1);
                });
        });

        it('license immediately test', () => {
            icontrolMock.when(
                'create',
                '/cm/shared/licensing/pools/1/members',
                {
                    state: 'LICENSED'
                }
            );
            return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                .then(() => {
                    assert.deepStrictEqual(icontrolMock.getRequest(
                        'create',
                        '/cm/shared/licensing/pools/1/members'
                    ),
                    {
                        deviceAddress: 'bigIpMgmtAddress:443',
                        username: 'user',
                        password: 'password'
                    });
                });
        });

        it('licensed later test', () => {
            licenseUuid = '123456';

            icontrolMock.when(
                'create',
                '/cm/shared/licensing/pools/1/members',
                {
                    state: 'FOOBAR',
                    uuid: licenseUuid
                }
            );
            icontrolMock.when(
                'list',
                '/cm/shared/licensing/pools/1/members/123456',
                {
                    state: 'LICENSED'
                }
            );

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(
                        icontrolMock.lastCall.path, `/cm/shared/licensing/pools/1/members/${licenseUuid}`
                    );
                });
        });

        it('license failure test', () => {
            licenseUuid = '123456';
            provider.getLicenseTimeout = () => { return util.SHORT_RETRY; };

            icontrolMock.when(
                'create',
                '/cm/shared/licensing/pools/1/members',
                {
                    state: 'FOOBAR',
                    uuid: licenseUuid
                }
            );

            return provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress')
                .then(() => {
                    assert.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Giving up'), -1);
                });
        });
    });

    describe('Revoke License Tests', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}?$select=uuid,name`,
                [
                    {
                        name: 'foo',
                        uuid: '0001'
                    },
                    {
                        name: poolName,
                        uuid: poolUuid
                    },
                    {
                        name: 'bar',
                        uuid: '0002'
                    }
                ]
            );

            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/members/`,
                [
                    {
                        deviceName: 'foo',
                        uuid: '1000'
                    },
                    {
                        deviceName: bigIpHostname,
                        uuid: licenseUuid
                    },
                    {
                        deviceName: 'bar',
                        uuid: '2000'
                    }
                ]
            );

            icontrolMock.when('delete', `${LICENSE_PATH}${poolUuid}/members/${licenseUuid}`, {});
        });

        it('basic test', () => {
            return provider.revoke(icontrolMock, poolName, { hostname: bigIpHostname })
                .then(() => {
                    const request = icontrolMock.getRequest(
                        'delete', `${LICENSE_PATH}${poolUuid}/members/${licenseUuid}`
                    );
                    assert.deepStrictEqual(
                        request,
                        {
                            username: 'user',
                            password: 'password',
                            uuid: licenseUuid
                        }
                    );
                });
        });

        it('license not found test', () => {
            icontrolMock.when(
                'list',
                `${LICENSE_PATH}${poolUuid}/members/`,
                [
                    {
                        deviceName: 'foo',
                        uuid: '1000'
                    },
                    {
                        deviceName: 'bar',
                        uuid: '2000'
                    }
                ]
            );

            return provider.revoke(icontrolMock, poolName, { hostname: bigIpHostname })
                .then(() => {
                    assert.ok(false, 'should have thrown no license');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('no license found'), -1);
                });
        });
    });
});
