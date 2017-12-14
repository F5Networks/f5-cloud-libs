/**
 * Copyright 2017 F5 Networks, Inc.
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
const bigIpHostname ='myBigIqHost';
const LICENSE_PATH = '/cm/device/licensing/pool/regkey/licenses/';
const regKey = '1234';
const memberId = '5678';

var BigIqProvider;
var provider;
var icontrolMock;

module.exports = {
    setUp: function(callback) {
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../../f5-cloud-libs').bigIq5_2LicenseProvider;
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

    testRevokeLicense: {
        setUp: function(callback) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + '?$select=id,name',
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
                LICENSE_PATH + poolUuid + '/offerings?$select=licenseState',
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
                LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
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
                LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId,
                {}
            );

            callback();
        },

        testBasic: function(test) {
            test.expect(1);
            provider.revoke(icontrolMock, poolName, bigIpHostname)
                .then(function() {
                    var request = icontrolMock.getRequest('delete', LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId);
                    test.deepEqual(
                        request,
                        {
                            username: 'user',
                            password: 'password',
                            id: licenseUuid
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

        testNoLicenseForHost: function(test) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
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


            test.expect(1);
            provider.revoke(icontrolMock, poolName, bigIpHostname)
                .then(function() {
                    test.ok(false, 'should have thrown no license for host');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, 'License for host not found.');
                })
                .finally(function() {
                    test.done();
                });
        },

        testGetMembersError: function(test) {
            icontrolMock.fail('list', LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members');

            test.expect(1);
            provider.revoke(icontrolMock, poolName, bigIpHostname)
                .then(function() {
                    test.ok(false, 'should have thrown no license for host');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, 'License for host not found.');
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testGetLicenseTimeout: function(test) {
        test.deepEqual(provider.getLicenseTimeout(), {maxRetries: 40, retryIntervalMs: 5000});
        test.done();
    }
};