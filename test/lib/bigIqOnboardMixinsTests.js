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

const icontrolMock = require('../testUtil/icontrolMock');
const Logger = require('../../../f5-cloud-libs').logger;

const regKey1 = '1234';
const eulaText = 'this is the eula';

let BigIp;
let bigIp;
let bigIqOnboardMixins;

module.exports = {
    setUp(callback) {
        BigIp = require('../../../f5-cloud-libs').bigIp;
        bigIqOnboardMixins = require('../../../f5-cloud-libs').bigIqOnboardMixins;

        bigIp = new BigIp();
        bigIp.isInitialized = true;
        bigIp.icontrol = icontrolMock;

        bigIqOnboardMixins.core = bigIp;
        bigIqOnboardMixins.logger = Logger.getLogger({console: false});

        icontrolMock.reset();
        callback();
    },

    testLicensePools: {
        testCreateLicensePool: {
            setUp(callback) {
                icontrolMock.when(
                    'list',
                    `/cm/device/licensing/pool/initial-activation/${regKey1}`,
                    {
                        eulaText,
                        status: 'ACTIVATING_AUTOMATIC_NEED_EULA_ACCEPT',
                    }
                );
                icontrolMock.whenNext(
                    'list',
                    `/cm/device/licensing/pool/initial-activation/${regKey1}`,
                    {
                        status: 'ACTIVATING_AUTOMATIC_EULA_ACCEPTED'
                    }
                );
                icontrolMock.whenNext(
                    'list',
                    `/cm/device/licensing/pool/initial-activation/${regKey1}`,
                    {
                        status: 'READY',
                        licenseReference: {
                            link: 'https://localhost/mgmt/cm/check/license/ready'
                        }
                    }
                );
                callback();
            },

            testStatusReady(test) {
                icontrolMock.when(
                    'list',
                    '/cm/check/license/ready',
                    {
                        status: 'READY'
                    }
                );

                test.expect(3);
                bigIqOnboardMixins.createLicensePool('mypool', '1234')
                    .then(() => {
                        test.deepEqual(icontrolMock.getRequest(
                            'create',
                            '/cm/device/licensing/pool/initial-activation'),
                            {
                                name: 'mypool',
                                regKey: '1234',
                                status: 'ACTIVATING_AUTOMATIC'
                            }
                        );
                        test.strictEqual(
                            icontrolMock.getNumRequests('list', `/cm/device/licensing/pool/initial-activation/${regKey1}`),
                            3
                        );
                        test.strictEqual(
                            icontrolMock.getNumRequests('list', '/cm/check/license/ready'),
                            1
                        );
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testStateLicensed(test) {
                icontrolMock.when(
                    'list',
                    '/cm/check/license/ready',
                    {
                        state: 'LICENSED'
                    }
                );

                test.expect(2);
                bigIqOnboardMixins.createLicensePool('mypool', '1234')
                    .then(() => {
                        test.strictEqual(
                            icontrolMock.getNumRequests('list', `/cm/device/licensing/pool/initial-activation/${regKey1}`),
                            3
                        );
                        test.strictEqual(
                            icontrolMock.getNumRequests('list', '/cm/check/license/ready'),
                            1
                        );
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            }
        },

        testCreateRegKeyPool: {
            testBasic(test) {
                const poolUuid = '998877';

                icontrolMock.when(
                    'create',
                    '/cm/device/licensing/pool/regkey/licenses',
                    {
                        id: poolUuid
                    }
                );
                icontrolMock.when(
                    'list',
                    `/cm/device/licensing/pool/regkey/licenses/${poolUuid}/offerings/${regKey1}`,
                    {
                        eulaText,
                        status: 'ACTIVATING_AUTOMATIC_NEED_EULA_ACCEPT',
                    }
                );
                icontrolMock.whenNext(
                    'list',
                    `/cm/device/licensing/pool/regkey/licenses/${poolUuid}/offerings/${regKey1}`,
                    {
                        status: 'ACTIVATING_AUTOMATIC_EULA_ACCEPTED'
                    }
                );
                icontrolMock.whenNext(
                    'list',
                    `/cm/device/licensing/pool/regkey/licenses/${poolUuid}/offerings/${regKey1}`,
                    {
                        status: 'READY',
                        licenseReference: {
                            link: 'https://localhost/mgmt/cm/check/license/ready'
                        }
                    }
                );

                test.expect(2);
                bigIqOnboardMixins.createRegKeyPool('mypool', ['1234'])
                    .then(() => {
                        test.deepEqual(icontrolMock.getRequest(
                            'create',
                            `/cm/device/licensing/pool/regkey/licenses/${poolUuid}/offerings`),
                            {
                                regKey: '1234',
                                description: '1234',
                                status: 'ACTIVATING_AUTOMATIC'
                            }
                        );
                        test.strictEqual(
                            icontrolMock.getNumRequests('list', `/cm/device/licensing/pool/regkey/licenses/${poolUuid}/offerings/${regKey1}`),
                            3
                        );
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            }
        }
    },

    testIsMasterKeySet: {
        testIsSet(test) {
            icontrolMock.when(
                'list',
                '/cm/shared/secure-storage/masterkey',
                {
                    isMkSet: true
                }
            );

            test.expect(1);
            bigIqOnboardMixins.isMasterKeySet()
                .then((isSet) => {
                    test.ok(isSet);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testIsNotSet(test) {
            icontrolMock.when(
                'list',
                '/cm/shared/secure-storage/masterkey',
                {
                    isMkSet: false
                }
            );

            test.expect(1);
            bigIqOnboardMixins.isMasterKeySet()
                .then((isSet) => {
                    test.ok(!isSet);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testSetMasterPassphrase(test) {
        const passphrase = 'my passphrase';

        bigIqOnboardMixins.setMasterPassphrase(passphrase)
            .then(() => {
                const passphraseRequest =
                    icontrolMock.getRequest('create', '/cm/shared/secure-storage/masterkey');
                test.strictEqual(passphraseRequest.passphrase, passphrase);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testSetRandomMasterPassphrase(test) {
        bigIqOnboardMixins.setRandomMasterPassphrase()
            .then(() => {
                const passphraseRequest =
                    icontrolMock.getRequest('create', '/cm/shared/secure-storage/masterkey');
                test.ok(passphraseRequest.passphrase);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    }
};