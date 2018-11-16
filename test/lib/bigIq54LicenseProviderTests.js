/**
 * Copyright 2018 F5 Networks, Inc.
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

const poolName = 'myLicensePool';
const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';
const taskId = 1234;

let util;
let BigIqProvider;
let provider;
let icontrolMock;
let BigIq53ProviderMock;
let bigIq53RevokeCalled;

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        util = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        bigIq53RevokeCalled = false;

        BigIq53ProviderMock = require('../../lib/bigIq53LicenseProvider');
        BigIq53ProviderMock.prototype.revoke = () => {
            bigIq53RevokeCalled = true;
            return q(true);
        };

        BigIqProvider = require('../../lib/bigIq54LicenseProvider');
        provider = new BigIqProvider();
        provider.bigIp = {
            user: 'user',
            password: 'password'
        };
        callback();
    },

    testConstructor: {
        testSetLogger(test) {
            const logger = {
                a: 1,
                b: 2
            };

            provider = new BigIqProvider({}, { logger });
            test.deepEqual(provider.logger, logger);
            test.done();
        },

        testLoggerOptions(test) {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            test.doesNotThrow(() => {
                // eslint-disable-next-line no-new
                new BigIqProvider({ loggerOptions });
            });
            test.done();
        }
    },

    testGetUnmanagedDeviceLicense: {
        setUp(callback) {
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
                    status: 'FINISHED',
                    licenseText: 'this is your license'
                }
            );

            provider.getLicenseTimeout = () => { return util.SHORT_RETRY; };
            provider.bigIp.onboard = {
                installLicense() {
                    return q();
                }
            };
            provider.bigIp.deviceInfo = () => {
                return q({});
            };

            callback();
        },

        testBasic(test) {
            test.expect(1);

            provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', LICENSE_PATH);
                    test.strictEqual(licenseRequest.licensePoolName, 'pool1');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testGetLicenseTextFailure(test) {
            const failureReason = 'you have no license text';
            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FAILED',
                    errorMessage: failureReason
                }
            );

            provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    test.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf(failureReason), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testInstallLicenseFailure(test) {
            const failureReason = 'bad license text';
            provider.bigIp.onboard = {
                installLicense() {
                    return q.reject(new Error(failureReason));
                }
            };

            test.expect(1);
            provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    test.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf(failureReason), -1);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRevokeLicense: {
        testBasic(test) {
            test.expect(1);
            const macAddress = '1234';
            const ipAddress = '1.2.3.4';

            provider.revoke(icontrolMock, poolName, { macAddress, mgmtIp: ipAddress })
                .then(() => {
                    const deleteReq = icontrolMock.getRequest('create', LICENSE_PATH);
                    test.deepEqual(
                        deleteReq,
                        {
                            command: 'revoke',
                            licensePoolName: poolName,
                            address: ipAddress,
                            assignmentType: 'UNREACHABLE',
                            macAddress
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoUnreachable(test) {
            test.expect(1);
            const macAddress = '1234';
            const ipAddress = '1.2.3.4';

            provider.revoke(
                icontrolMock, poolName, { macAddress, mgmtIp: ipAddress }, { noUnreachable: true }
            )
                .then(() => {
                    test.ok(bigIq53RevokeCalled);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGetLicenseTimeout(test) {
        test.deepEqual(provider.getLicenseTimeout(), { maxRetries: 40, retryIntervalMs: 5000 });
        test.done();
    }
};
