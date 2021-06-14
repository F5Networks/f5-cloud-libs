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
const sinon = require('sinon');

const BigIp = require('../../lib/bigIp');

describe('BIGIQ 5.4.0 License Provider Tests', () => {
    const poolName = 'myLicensePool';
    const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';
    const taskId = 1234;

    let util;
    let BigIqProvider;
    let bigIp;
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
        /* eslint-enable global-require */

        bigIp = new BigIp();
        provider = new BigIqProvider(bigIp);
        provider.bigIp.user = 'user';
        provider.bigIp.password = 'password';

        sinon.stub(bigIp, 'getManagementMac').resolves('fa:16:3e:be:5a:45');
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Constructor Tests', () => {
        it('should set logger', () => {
            const logger = {
                a: 1,
                b: 2
            };

            provider = new BigIqProvider({}, { logger });
            assert.deepEqual(provider.logger, logger);
        });

        it('should set logger options', () => {
            const loggerOptions = {
                id: 'hiThere',
                logLevel: 'debug',
                console: false,
                json: true
            };

            provider = new BigIqProvider(bigIp, { loggerOptions });
            // This test needs something more, but the options supplied does not seem to change the logger
            assert.strictEqual(provider.logger.id, null);
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

        it('basic test', () => {
            return provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', LICENSE_PATH);
                    return assert.strictEqual(licenseRequest.licensePoolName, 'pool1');
                });
        });

        it('get license text failure test', () => {
            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FAILED',
                    errorMessage: 'you have no license text'
                }
            );

            return provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    return assert.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    return assert.strictEqual(err.message, 'you have no license text');
                });
        });

        it('install license failure test', () => {
            provider.bigIp.onboard = {
                installLicense() {
                    return q.reject(new Error('bad license text'));
                }
            };

            return provider.getUnmanagedDeviceLicense(
                icontrolMock,
                'pool1',
                'bigIpMgmtAddress',
                '443',
                { cloud: 'cloud' }
            )
                .then(() => {
                    return assert.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    return assert.strictEqual(err.message, 'bad license text');
                });
        });
    });

    describe('Revoke License Tests', () => {
        it('basic test', () => {
            const ipAddress = '1.2.3.4';

            return provider.revoke(
                icontrolMock,
                poolName,
                { macAddress: 'fa:16:3e:be:5a:45', mgmtIp: ipAddress }
            )
                .then(() => {
                    const deleteReq = icontrolMock.getRequest('create', LICENSE_PATH);
                    assert.deepStrictEqual(
                        deleteReq,
                        {
                            command: 'revoke',
                            licensePoolName: poolName,
                            address: ipAddress,
                            assignmentType: 'UNREACHABLE',
                            macAddress: 'fa:16:3e:be:5a:45'
                        }
                    );
                });
        });

        it('no unreachable test', () => {
            const ipAddress = '1.2.3.4';

            return provider.revoke(
                icontrolMock,
                poolName,
                { macAddress: 'fa:16:3e:be:5a:45', mgmtIp: ipAddress },
                { noUnreachable: true }
            )
                .then(() => {
                    assert.ok(bigIq53RevokeCalled);
                });
        });
    });

    it('get license timeout test', (done) => {
        assert.deepEqual(provider.getLicenseTimeout(), { maxRetries: 40, retryIntervalMs: 5000 });
        done();
    });
});
