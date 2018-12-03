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
const sharedConstants = require('../../lib/sharedConstants');

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
let revokeCalled;

let licensingArgs;
let apiTypeCalled;
let gotByVersion;

module.exports = {
    setUp(callback) {
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

        authnMock = require('../../../f5-cloud-libs').authn;
        authnMock.authenticate = (authHost, authUser, authPassword) => {
            icontrolMock.password = authPassword;
            return q.resolve(icontrolMock);
        };

        BigIq = require('../../../f5-cloud-libs').bigIq;
        bigIq = new BigIq();
        bigIq.icontrol = icontrolMock;

        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        callback();
    },

    testConstructor: {
        testSetLogger(test) {
            const logger = {
                a: 1,
                b: 2
            };

            bigIq = new BigIq({ logger });
            test.deepEqual(bigIq.logger, logger);
            test.done();
        },

        testLoggerOptions(test) {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            test.doesNotThrow(() => {
                // eslint-disable-next-line no-new
                new BigIq({ loggerOptions });
            });
            test.done();
        }
    },

    testInit: {
        testBasic(test) {
            test.expect(4);
            bigIq.init(host, user, password)
                .then(() => {
                    test.strictEqual(bigIq.host, host);
                    test.strictEqual(bigIq.user, user);
                    test.strictEqual(bigIq.version, bigIqVersion);
                    test.strictEqual(icontrolMock.password, password);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testGetVersionError(test) {
            icontrolMock.fail('list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version');

            test.expect(1);
            bigIq.init(host, user, password)
                .then(() => {
                    test.ok(false, 'should have thrown init error');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testLicenseBigIp: {
        setUp(callback) {
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

            callback();
        },

        testByVersion: {
            testBasic(test) {
                test.expect(2);
                bigIq.init('host', 'user', 'password')
                    .then(() => {
                        bigIq.licenseBigIp(poolName, '1.2.3.4', '8888')
                            .then(() => {
                                test.strictEqual(gotByVersion, true);
                                test.strictEqual(licensingArgs[1], poolName);
                            })
                            .catch(() => {
                                test.ok(false, 'licensing by version failed');
                            })
                            .finally(() => {
                                test.done();
                            });
                    });
            },

            testBadVersion(test) {
                bigIqLicenseProviderFactoryMock.getLicenseProviderByVersion = function a() {
                    throw new Error('get by version failed');
                };

                bigIq.init('host', 'user', 'password')
                    .then(() => {
                        bigIq.licenseBigIp(poolName, '1.2.3.4', '8888')
                            .then(() => {
                                test.ok(false, 'getByVersion should have thrown');
                            })
                            .catch((err) => {
                                test.strictEqual(err.message, 'get by version failed');
                            })
                            .finally(() => {
                                test.done();
                            });
                    });
            }
        },

        testByType: {
            testPurchased(test) {
                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/purchased-pool/licenses?$select=name',
                    [
                        {
                            name: poolName
                        }
                    ]
                );

                test.expect(2);
                bigIq.init('host', 'user', 'password')
                    .then(() => {
                        bigIq.licenseBigIp(poolName, '1.2.3.4', '8888', { autoApiType: true })
                            .then(() => {
                                test.strictEqual(
                                    apiTypeCalled,
                                    sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE
                                );
                                test.strictEqual(licensingArgs[1], poolName);
                            })
                            .catch(() => {
                                test.ok(false, 'licensing by type failed');
                            })
                            .finally(() => {
                                test.done();
                            });
                    });
            },

            testUtility(test) {
                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/purchased-pool/licenses?$select=name',
                    []
                );

                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/utility/licenses?$select=name',
                    [
                        {
                            name: poolName
                        }
                    ]
                );

                test.expect(2);
                bigIq.init('host', 'user', 'password')
                    .then(() => {
                        bigIq.licenseBigIp(poolName, '1.2.3.4', '8888', { autoApiType: true })
                            .then(() => {
                                test.strictEqual(
                                    apiTypeCalled,
                                    sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE
                                );
                                test.strictEqual(licensingArgs[1], poolName);
                            })
                            .catch(() => {
                                test.ok(false, 'licensing by type failed');
                            })
                            .finally(() => {
                                test.done();
                            });
                    });
            },

            testRegKey(test) {
                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/purchased-pool/licenses?$select=name',
                    []
                );

                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/utility/licenses?$select=name',
                    []
                );

                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/regkey/licenses?$select=name',
                    [
                        {
                            name: poolName
                        }
                    ]
                );

                test.expect(2);
                bigIq.init('host', 'user', 'password')
                    .then(() => {
                        bigIq.licenseBigIp(poolName, '1.2.3.4', '8888', { autoApiType: true })
                            .then(() => {
                                test.strictEqual(
                                    apiTypeCalled,
                                    sharedConstants.LICENSE_API_TYPES.REG_KEY
                                );
                                test.strictEqual(licensingArgs[1], poolName);
                            })
                            .catch(() => {
                                test.ok(false, 'licensing by type failed');
                            })
                            .finally(() => {
                                test.done();
                            });
                    });
            },

            testReachable(test) {
                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/purchased-pool/licenses?$select=name',
                    [
                        {
                            name: poolName
                        }
                    ]
                );

                test.expect(2);
                bigIq.init('host', 'user', 'password')
                    .then(() => {
                        bigIq.licenseBigIp(
                            poolName,
                            '1.2.3.4',
                            '8888',
                            {
                                noUnreachable: true,
                                autoApiType: true
                            }
                        )
                            .then(() => {
                                test.strictEqual(
                                    apiTypeCalled,
                                    sharedConstants.LICENSE_API_TYPES.UTILITY
                                );
                                test.strictEqual(licensingArgs[1], poolName);
                            })
                            .catch(() => {
                                test.ok(false, 'licensing by type failed');
                            })
                            .finally(() => {
                                test.done();
                            });
                    });
            },

            testPoolNotFound(test) {
                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/purchased-pool/licenses?$select=name',
                    []
                );

                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/purchased-pool/licenses?$select=name',
                    []
                );

                icontrolMock.when(
                    'list',
                    '/cm/device/licensing/pool/regkey/licenses?$select=name',
                    []
                );

                test.expect(1);
                bigIq.init('host', 'user', 'password')
                    .then(() => {
                        bigIq.licenseBigIp(poolName, '1.2.3.4', '8888', { autoApiType: true })
                            .then(() => {
                                test.ok(false, 'should have thrown pool not found');
                            })
                            .catch((err) => {
                                test.notStrictEqual(err.message.indexOf('not found'), -1);
                            })
                            .finally(() => {
                                test.done();
                            });
                    });
            }
        }
    },

    testRevokeLicense: {
        setUp(callback) {
            revokeCalled = false;
            callback();
        },

        testBasic(test) {
            bigIqLicenseProviderFactoryMock.getLicenseProviderByVersion = function a() {
                return {
                    revoke() {
                        revokeCalled = true;
                        return q();
                    }
                };
            };

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(() => {
                    bigIq.revokeLicense()
                        .then(() => {
                            test.strictEqual(revokeCalled, true);
                        })
                        .catch(() => {
                            test.ok(false, 'reovoke failed');
                        })
                        .finally(() => {
                            test.done();
                        });
                });
        },

        testBadVersion(test) {
            bigIqLicenseProviderFactoryMock.getLicenseProviderByVersion = function a() {
                throw new Error('get by version failed');
            };

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(() => {
                    bigIq.revokeLicense()
                        .then(() => {
                            test.ok(false, 'getByVersion should have thrown');
                        })
                        .catch((err) => {
                            test.strictEqual(err.message, 'get by version failed');
                        })
                        .finally(() => {
                            test.done();
                        });
                });
        }
    }
};
