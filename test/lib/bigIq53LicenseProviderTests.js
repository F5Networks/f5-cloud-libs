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

describe('BIGIQ 5.3.0 License Provider Tests', () => {
    const poolName = 'myLicensePool';
    const LICENSE_PATH = '/cm/device/tasks/licensing/pool/member-management/';
    const taskId = '1234';

    let util;
    let BigIqProvider;
    let provider;
    let icontrolMock;

    beforeEach(() => {
        /* eslint-disable global-require */
        util = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../lib/bigIq53LicenseProvider');
        provider = new BigIqProvider();
        provider.bigIp = {
            user: 'user',
            password: 'password'
        };
    });

    it('get license timeout test', (done) => {
        assert.deepEqual(provider.getLicenseTimeout(), { maxRetries: 40, retryIntervalMs: 5000 });
        done();
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
                    status: 'FINISHED'
                }
            );
        });

        it('basic test', (done) => {
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
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
        it('options test', (done) => {
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
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', LICENSE_PATH);
                    assert.strictEqual(licenseRequest.skuKeyword1, 'mySku1');
                    assert.strictEqual(licenseRequest.skuKeyword2, 'mySku2');
                    assert.strictEqual(licenseRequest.unitOfMeasure, 'myUnitOfMeasure');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('license race condition fails test', (done) => {
            provider.getLicenseTimeout = () => { return util.SHORT_RETRY; };

            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FAILED',
                    errorMessage: 'already been granted to a BIG-IP'
                }
            );

            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                .then(() => {
                    assert.ok(false, 'should have thrown license failure');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Giving up'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('license failure test', (done) => {
            const failureReason = 'we failed for no apparent reason';
            provider.getLicenseTimeout = () => { return util.SHORT_RETRY; };

            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FAILED',
                    errorMessage: failureReason
                }
            );

            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
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

        it('unknown status test', (done) => {
            const failureReason = 'we do not know what is happening';
            provider.getLicenseTimeout = () => { return util.SHORT_RETRY; };

            icontrolMock.when(
                'list',
                LICENSE_PATH + taskId,
                {
                    status: 'FOO',
                    errorMessage: failureReason
                }
            );

            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
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
        beforeEach(() => {
            icontrolMock.when(
                'list',
                // eslint-disable-next-line max-len
                "/shared/index/config?$filter=(%20(%20'kind'%20eq%20'cm:device:licensing:pool:purchased-pool:licenses:licensepoolmemberstate'%20or%20'kind'%20eq%20'cm:device:licensing:pool:utility:licenses:regkey:offerings:offering:members:grantmemberstate'%20or%20'kind'%20eq%20'cm:device:licensing:pool:volume:licenses:regkey:offerings:offering:members:memberstate'%20or%20'kind'%20eq%20'cm:device:licensing:pool:regkey:licenses:item:offerings:regkey:members:regkeypoollicensememberstate'%20)%20and%20'deviceMachineId'%20eq%20'1234')&$select=deviceAddress,deviceMachineId,deviceName,selfLink",
                [{
                    selfLink: 'https://localhost/mgmt/foo/bar/5678'
                }]
            );
        });
        it('basic test', (done) => {
            provider.revoke(icontrolMock, poolName, { machineId: '1234' })
                .then(() => {
                    const deleteReq = icontrolMock.getRequest('delete', '/foo/bar/5678');
                    assert.strictEqual(deleteReq.id, '5678');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });
});
