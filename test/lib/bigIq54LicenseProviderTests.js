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
const assert = require('assert');

describe('BIGIQ 5.4.0 License Provider Tests', () => {
    const poolName = 'myLicensePool';
    const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';
    const taskId = 1234;

    let util;
    let BigIqProvider;
    let provider;
    let icontrolMock;
    let BigIq53ProviderMock;
    let bigIq53RevokeCalled;

    beforeEach(() => {
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
    });

    describe('Constructor Tests', () => {
        it('should set logger', (done) => {
            const logger = {
                a: 1,
                b: 2
            };

            provider = new BigIqProvider({}, { logger });
            assert.deepEqual(provider.logger, logger);
            done();
        });

        it('should set logger options', (done) => {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            assert.doesNotThrow(() => {
                // eslint-disable-next-line no-new
                new BigIqProvider({ loggerOptions });
            });
            done();
        });
    });

    describe('Unmanaged Device License Tests', () => {
        beforeEach(() => {
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
        });

        it('basic test', (done) => {
            provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', LICENSE_PATH);
                    assert.strictEqual(licenseRequest.licensePoolName, 'pool1');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('get license text failure test', (done) => {
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
                    assert.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(failureReason), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('install license failure test', (done) => {
            const failureReason = 'bad license text';
            provider.bigIp.onboard = {
                installLicense() {
                    return q.reject(new Error(failureReason));
                }
            };

            provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    assert.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(failureReason), -1);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('Revoke License Tests', () => {
        it('basic test', (done) => {
            const macAddress = '1234';
            const ipAddress = '1.2.3.4';

            provider.revoke(icontrolMock, poolName, { macAddress, mgmtIp: ipAddress })
                .then(() => {
                    const deleteReq = icontrolMock.getRequest('create', LICENSE_PATH);
                    assert.deepEqual(
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
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('no unreachable test', (done) => {
            const macAddress = '1234';
            const ipAddress = '1.2.3.4';

            provider.revoke(
                icontrolMock, poolName, { macAddress, mgmtIp: ipAddress }, { noUnreachable: true }
            )
                .then(() => {
                    assert.ok(bigIq53RevokeCalled);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    it('get license timeout test', (done) => {
        assert.deepEqual(provider.getLicenseTimeout(), { maxRetries: 40, retryIntervalMs: 5000 });
        done();
    });
});
