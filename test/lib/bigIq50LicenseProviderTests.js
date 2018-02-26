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
const bigIpHostname = 'myBigIqHost';
const LICENSE_PATH = '/cm/shared/licensing/pools/';

var BigIqProvider;
var provider;
var icontrolMock;
var revokeCalled;

module.exports = {
    setUp: function(callback) {
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../../f5-cloud-libs').bigIq50LicenseProvider;
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
            provider.revoke(icontrolMock, poolName, bigIpHostname)
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
            provider.revoke(icontrolMock, poolName, bigIpHostname)
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