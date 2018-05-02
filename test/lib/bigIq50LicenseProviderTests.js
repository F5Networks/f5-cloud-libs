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

const poolName = 'myLicensePool';
const poolUuid = '1234';
const licenseUuid = '5678';
const bigIpHostname = 'myBigIqHost';
const LICENSE_PATH = '/cm/shared/licensing/pools/';

var util;
var BigIqProvider;
var provider;
var icontrolMock;
var revokeCalled;

module.exports = {
    setUp: function(callback) {
        util = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../lib/bigIq50LicenseProvider');
        provider = new BigIqProvider();
        provider.bigIp = {
            user: 'user',
            password: 'password'
        };
        callback();
    },

    testConstructor: {
        testSetLogger: function(test) {
            const logger = {
                a: 1,
                b: 2
            };

            provider = new BigIqProvider({}, {logger: logger});
            test.deepEqual(provider.logger, logger);
            test.done();
        },

        testLoggerOptions: function(test) {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            test.doesNotThrow(function() {
                new BigIqProvider({loggerOptions: loggerOptions});
            });
            test.done();
        }
    },

    testGetUnmanagedDeviceLicense: {
        setUp: function(callback) {
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
            callback();
        },

        testEmptyPools: function(test) {
            icontrolMock.when(
                'list',
                '/cm/shared/licensing/pools/?$select=uuid,name',
                []
            );

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(function() {
                    test.ok(false, "Should have thrown empty pools.");
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('No license pool'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testBadPoolResponse: function(test) {
            icontrolMock.when(
                'list',
                '/cm/shared/licensing/pools/?$select=uuid,name',
                {}
            );

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(function() {
                    test.ok(false, "Should have thrown no pools.");
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('Error getting license pools'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicensedImmediately: function(test) {
            icontrolMock.when(
                'create',
                '/cm/shared/licensing/pools/1/members',
                {
                    state: 'LICENSED'
                }
            );
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                .then(function() {
                    test.deepEqual(icontrolMock.getRequest(
                        'create',
                        '/cm/shared/licensing/pools/1/members'),
                        {
                            deviceAddress: 'bigIpMgmtAddress:443',
                            username: 'user',
                            password: 'password'
                        });
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicensedLater: function(test) {
            var licenseUuid = '123456';

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

            test.expect(2);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress')
                .then(function() {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/cm/shared/licensing/pools/1/members/' + licenseUuid);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicenseFailure: function(test) {
            var licenseUuid = '123456';
            provider.getLicenseTimeout = function() {return util.SHORT_RETRY;};

            icontrolMock.when(
                'create',
                '/cm/shared/licensing/pools/1/members',
                {
                    state: 'FOOBAR',
                    uuid: licenseUuid
                }
            );

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress')
                .then(function() {
                    test.ok(false, 'should have thrown license failure');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('Giving up'), -1);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testRevokeLicense: {
        setUp: function(callback) {
            revokeCalled = false;

            icontrolMock.when(
                'list',
                LICENSE_PATH + '?$select=uuid,name',
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
                LICENSE_PATH + poolUuid + '/members/',
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

            icontrolMock.when('delete', LICENSE_PATH + poolUuid + '/members/' + licenseUuid, {});

            callback();
        },

        testBasic: function(test) {
            test.expect(1);
            provider.revoke(icontrolMock, poolName, {hostname: bigIpHostname})
                .then(function() {
                    var request = icontrolMock.getRequest('delete', LICENSE_PATH + poolUuid + '/members/' + licenseUuid);
                    test.deepEqual(
                        request,
                        {
                            username: 'user',
                            password: 'password',
                            uuid: licenseUuid
                        }
                    );
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicenseNotFound: function(test) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/members/',
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

            test.expect(1);
            provider.revoke(icontrolMock, poolName, {hostname: bigIpHostname})
                .then(function() {
                    test.ok(false, 'should have thrown no license');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('no license found'), -1);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};