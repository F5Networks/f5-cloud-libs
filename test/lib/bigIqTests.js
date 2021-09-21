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

const q = require('q');
const assert = require('assert');
const sharedConstants = require('../../lib/sharedConstants');

describe('bigiq tests', () => {
    const host = 'myHost';
    const user = 'myUser';
    const password = 'myPassword';

    const bigIqVersion = '5.2';

    const poolName = 'mypool';

    let BigIq;
    let bigIq;
    let bigIqLicenseProviderFactoryMock;
    let authnMock;
    let icontrolMock;
    let utilMock;
    let revokeCalled;

    let licensingArgs;
    let apiTypeCalled;
    let gotByVersion;
    let authnOptionsSent;

    beforeEach(() => {
        /* eslint-disable global-require */
        bigIqLicenseProviderFactoryMock = require('../../lib/bigIqLicenseProviderFactory');

        icontrolMock = require('../testUtil/icontrolMock');

        icontrolMock.reset();

        icontrolMock.when(
            'create',
            '/shared/authn/login',
            {
                token: {
                    token: 'foo'
                }
            }
        );

        icontrolMock.when(
            'list',
            '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
            [
                {
                    version: bigIqVersion
                }
            ]
        );

        icontrolMock.when(
            'create',
            '/shared/authn/login',
            {
                token: {
                    token: 'foo'
                }
            }
        );

        utilMock = require('../../../f5-cloud-libs').util;

        authnMock = require('../../../f5-cloud-libs').authn;
        authnMock.authenticate = (authHost, authUser, authPassword, options) => {
            icontrolMock.password = authPassword;
            authnOptionsSent = options;
            return q.resolve(icontrolMock);
        };

        BigIq = require('../../../f5-cloud-libs').bigIq;
        bigIq = new BigIq();
        bigIq.icontrol = icontrolMock;
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('constructor test', () => {
        it('set logger test', () => {
            const logger = {
                a: 1,
                b: 2
            };

            bigIq = new BigIq({ logger });
            assert.deepStrictEqual(bigIq.logger, logger);
        });

        it('set logger options test', () => {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            assert.doesNotThrow(() => {
                // eslint-disable-next-line no-new
                new BigIq({ loggerOptions });
            });
        });
    });

    describe('init test', () => {
        it('basic test', () => {
            const port = 1111;
            return bigIq.init(host, user, password, { port, authProvider: 'myAuthProvider' })
                .then(() => {
                    assert.strictEqual(bigIq.host, host);
                    assert.strictEqual(bigIq.user, user);
                    assert.strictEqual(bigIq.version, bigIqVersion);
                    assert.strictEqual(icontrolMock.password, password);
                    assert.strictEqual(authnOptionsSent.port, port);
                    assert.strictEqual(authnOptionsSent.authProvider, 'myAuthProvider');
                });
        });

        it('get version error test', () => {
            icontrolMock.fail('list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version');

            utilMock.MEDIUM_RETRY = { maxRetries: 1, retryIntervalMs: 10 };
            return bigIq.init(host, user, password)
                .then(() => {
                    assert.ok(false, 'should have thrown init error');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('license bigip test', () => {
        beforeEach(() => {
            gotByVersion = false;
            licensingArgs = null;
            bigIqLicenseProviderFactoryMock.getLicenseProviderByVersion = function a() {
                gotByVersion = true;
                return q({
                    getUnmanagedDeviceLicense() {
                        licensingArgs = arguments;
                        return q();
                    }
                });
            };

            bigIqLicenseProviderFactoryMock.getLicenseProviderByType = function a() {
                apiTypeCalled = arguments[0];
                return q({
                    getUnmanagedDeviceLicense() {
                        licensingArgs = arguments;
                        return q();
                    }
                });
            };
        });

        describe('by version test', () => {
            it('basic test', () => {
                return bigIq.init('host', 'user', 'password')
                    .then(() => {
                        return bigIq.licenseBigIp(poolName, '1.2.3.4', '8888');
                    })
                    .then(() => {
                        assert.strictEqual(gotByVersion, true);
                        assert.strictEqual(licensingArgs[1], 'mypool');
                    });
            });

            it('bad version test', () => {
                bigIqLicenseProviderFactoryMock.getLicenseProviderByVersion = function a() {
                    throw new Error('get by version failed');
                };

                return bigIq.init('host', 'user', 'password')
                    .then(() => {
                        return bigIq.licenseBigIp(poolName, '1.2.3.4', '8888');
                    })
                    .then(() => {
                        assert.ok(false, 'getByVersion should have thrown');
                    })
                    .catch((err) => {
                        assert.strictEqual(err.message, 'get by version failed');
                    });
            });
        });

        describe('by type test', () => {
            it('reachable test', () => {
                return bigIq.init('host', 'user', 'password')
                    .then(() => {
                        return bigIq.licenseBigIp(
                            poolName,
                            '1.2.3.4',
                            '8888',
                            { autoApiType: true, noUnreachable: true }
                        );
                    })
                    .then(() => {
                        assert.strictEqual(apiTypeCalled,
                            sharedConstants.LICENSE_API_TYPES.UTILITY);
                        assert.strictEqual(licensingArgs[1], 'mypool');
                    });
            });

            it('unreachable test', () => {
                return bigIq.init('host', 'user', 'password')
                    .then(() => {
                        return bigIq.licenseBigIp(poolName, '1.2.3.4', '8888', { autoApiType: true });
                    })
                    .then(() => {
                        assert.strictEqual(
                            apiTypeCalled,
                            sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE
                        );
                        assert.strictEqual(licensingArgs[1], 'mypool');
                    });
            });

            it('chargebackTag test', () => {
                return bigIq.init('host', 'user', 'password')
                    .then(() => {
                        return bigIq.licenseBigIp(poolName, '1.2.3.4', '8888', { chargebackTag: 'foo-bar' });
                    })
                    .then(() => {
                        assert.strictEqual(
                            apiTypeCalled,
                            sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE
                        );
                        assert.strictEqual(licensingArgs[1], poolName);
                        assert.strictEqual(licensingArgs[4].chargebackTag, 'foo-bar');
                    });
            });
        });
    });

    describe('revoke license test', () => {
        beforeEach(() => {
            revokeCalled = false;
        });

        it('basic test', () => {
            bigIqLicenseProviderFactoryMock.getLicenseProviderByVersion = function a() {
                return {
                    revoke() {
                        revokeCalled = true;
                        return q();
                    }
                };
            };

            return bigIq.init('host', 'user', 'password')
                .then(() => {
                    return bigIq.revokeLicense();
                })
                .then(() => {
                    assert.strictEqual(revokeCalled, true);
                });
        });

        it('bad version test', () => {
            bigIqLicenseProviderFactoryMock.getLicenseProviderByVersion = function a() {
                throw new Error('get by version failed');
            };

            return bigIq.init('host', 'user', 'password')
                .then(() => {
                    return bigIq.revokeLicense();
                })
                .then(() => {
                    assert.ok(false, 'getByVersion should have thrown');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'get by version failed');
                });
        });
    });
});
