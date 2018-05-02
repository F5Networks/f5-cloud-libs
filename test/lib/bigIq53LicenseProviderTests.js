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
const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';
const regKey = '1234';
const memberId = '5678';
const taskId = '1234';

var util;
var BigIqProvider;
var provider;
var icontrolMock;

module.exports = {
    setUp: function(callback) {
        util = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../lib/bigIq53LicenseProvider');
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
                'create',
                 LICENSE_PATH,
                 {
                     id: taskId
                 }
            );

            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FINISHED'
                }
            );

            callback();
        },

        testBasic: function(test) {
            test.expect(1);

            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(function() {
                    var licenseRequest = icontrolMock.getRequest('create', LICENSE_PATH);
                    test.strictEqual(licenseRequest.licensePoolName, 'pool1');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testOptions: function(test) {
            test.expect(3);

            provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                {
                    skuKeyword1: 'mySku1',
                    skuKeyword2: 'mySku2',
                    unitOfMeasure: 'myUnitOfMeasure'
                }
            )
                .then(function() {
                    var licenseRequest = icontrolMock.getRequest('create', LICENSE_PATH);
                    test.strictEqual(licenseRequest.skuKeyword1, 'mySku1');
                    test.strictEqual(licenseRequest.skuKeyword2, 'mySku2');
                    test.strictEqual(licenseRequest.unitOfMeasure, 'myUnitOfMeasure');
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicenseRaceConditionFails: function(test) {
            provider.getLicenseTimeout = function() {return util.SHORT_RETRY;};

            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FAILED',
                    errorMessage: 'already been granted to a BIG-IP'
                }
            );

            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                .then(function() {
                    test.ok(false, 'should have thrown license failure');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('Giving up'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicenseFailure: function(test) {
            provider.getLicenseTimeout = function() {return util.SHORT_RETRY;};

            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FAILED',
                    errorMessage: 'foo'
                }
            );

            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                .then(function() {
                    test.ok(false, 'should have thrown license failure');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('Giving up'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testUnknownStatus: function(test) {
            provider.getLicenseTimeout = function() {return util.SHORT_RETRY;};

            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FOO'
                }
            );

            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
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
            icontrolMock.when(
                'list',
                "/shared/index/config?$filter=(%20(%20'kind'%20eq%20'cm:device:licensing:pool:purchased-pool:licenses:licensepoolmemberstate'%20or%20'kind'%20eq%20'cm:device:licensing:pool:utility:licenses:regkey:offerings:offering:members:grantmemberstate'%20or%20'kind'%20eq%20'cm:device:licensing:pool:volume:licenses:regkey:offerings:offering:members:memberstate'%20or%20'kind'%20eq%20'cm:device:licensing:pool:regkey:licenses:item:offerings:regkey:members:regkeypoollicensememberstate'%20)%20and%20'deviceMachineId'%20eq%20'1234')&$select=deviceAddress,deviceMachineId,deviceName,selfLink",
                [{
                    selfLink: 'https://localhost/mgmt/foo/bar/5678'
                }]
            )
            callback();
        },

        testBasic: function(test) {
            test.expect(1);
            provider.revoke(icontrolMock, poolName, {machineId: '1234'})
                .then(function() {
                    let deleteReq = icontrolMock.getRequest('delete', '/foo/bar/5678');
                    test.strictEqual(deleteReq.id, '5678');
                })
                .catch(function(err) {
                    test.ok(false, err);
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