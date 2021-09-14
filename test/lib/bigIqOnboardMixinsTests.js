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

const assert = require('assert');

const icontrolMock = require('../testUtil/icontrolMock');
const Logger = require('../../../f5-cloud-libs').logger;

describe('bigiq onboard mixins tests', () => {
    const regKey1 = '1234';
    const eulaText = 'this is the eula';

    let BigIp;
    let bigIp;
    let bigIqOnboardMixins;

    beforeEach(() => {
        /* eslint-disable global-require */
        BigIp = require('../../../f5-cloud-libs').bigIp;
        bigIqOnboardMixins = require('../../../f5-cloud-libs').bigIqOnboardMixins;

        bigIp = new BigIp();
        bigIp.isInitialized = true;
        bigIp.icontrol = icontrolMock;

        bigIqOnboardMixins.core = bigIp;
        bigIqOnboardMixins.logger = Logger.getLogger({ console: false });

        icontrolMock.reset();
    });

    describe('license pools test', () => {
        describe('create license pool test', () => {
            beforeEach(() => {
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
            });

            it('status ready test', () => {
                icontrolMock.when(
                    'list',
                    '/cm/check/license/ready',
                    {
                        status: 'READY'
                    }
                );

                return bigIqOnboardMixins.createLicensePool('mypool', '1234')
                    .then(() => {
                        assert.deepStrictEqual(icontrolMock.getRequest(
                            'create',
                            '/cm/device/licensing/pool/initial-activation'
                        ),
                        {
                            name: 'mypool',
                            regKey: '1234',
                            status: 'ACTIVATING_AUTOMATIC'
                        });
                        assert.strictEqual(
                            icontrolMock.getNumRequests('list',
                                `/cm/device/licensing/pool/initial-activation/${regKey1}`),
                            3
                        );
                        assert.strictEqual(
                            icontrolMock.getNumRequests('list', '/cm/check/license/ready'),
                            1
                        );
                    });
            });
            it('state licensed test', () => {
                icontrolMock.when(
                    'list',
                    '/cm/check/license/ready',
                    {
                        state: 'LICENSED'
                    }
                );

                return bigIqOnboardMixins.createLicensePool('mypool', '1234')
                    .then(() => {
                        assert.strictEqual(
                            icontrolMock.getNumRequests('list',
                                `/cm/device/licensing/pool/initial-activation/${regKey1}`),
                            3
                        );
                        assert.strictEqual(
                            icontrolMock.getNumRequests('list', '/cm/check/license/ready'),
                            1
                        );
                    });
            });
        });

        describe('create reg key pool test', () => {
            it('basic test', () => {
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

                return bigIqOnboardMixins.createRegKeyPool('mypool', ['1234'])
                    .then(() => {
                        assert.deepStrictEqual(icontrolMock.getRequest(
                            'create',
                            `/cm/device/licensing/pool/regkey/licenses/${poolUuid}/offerings`
                        ),
                        {
                            regKey: '1234',
                            description: '1234',
                            status: 'ACTIVATING_AUTOMATIC'
                        });
                        assert.strictEqual(
                            icontrolMock.getNumRequests('list',
                                `/cm/device/licensing/pool/regkey/licenses/${poolUuid}/offerings/${regKey1}`),
                            3
                        );
                    });
            });
        });
    });

    describe('is primary key set test', () => {
        it('is set test', () => {
            icontrolMock.when(
                'list',
                '/cm/shared/secure-storage/primarykey',
                {
                    isMkSet: true
                }
            );

            return bigIqOnboardMixins.isPrimaryKeySet()
                .then((isSet) => {
                    assert.ok(isSet);
                });
        });

        it('is not set test', () => {
            icontrolMock.when(
                'list',
                '/cm/shared/secure-storage/primarykey',
                {
                    isMkSet: false
                }
            );

            return bigIqOnboardMixins.isPrimaryKeySet()
                .then((isSet) => {
                    assert.ok(!isSet);
                });
        });
    });

    it('set primary passphrase test', () => {
        const passphrase = 'my passphrase';

        return bigIqOnboardMixins.setPrimaryPassphrase(passphrase)
            .then(() => {
                const passphraseRequest =
                    icontrolMock.getRequest('create', '/cm/shared/secure-storage/primarykey');
                assert.strictEqual(passphraseRequest.passphrase, passphrase);
            });
    });

    it('set random primary passphrase test', () => {
        return bigIqOnboardMixins.setRandomPrimaryPassphrase()
            .then(() => {
                const passphraseRequest =
                    icontrolMock.getRequest('create', '/cm/shared/secure-storage/primarykey');
                assert.ok(passphraseRequest.passphrase);
            });
    });
});
