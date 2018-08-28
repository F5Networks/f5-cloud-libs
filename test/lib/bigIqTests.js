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

const q = require('q');

const host = 'myHost';
const user = 'myUser';
const password = 'myPassword';

const bigIqVersion = '5.2';

let BigIq;
let bigIq;
let authnMock;
let icontrolMock;
let revokeCalled;

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
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

    testRevokeLicense: {
        setUp(callback) {
            revokeCalled = false;
            callback();
        },

        test5_0(test) {
            const licenseProvider = require('../../lib/bigIq50LicenseProvider');

            licenseProvider.revoke = () => {
                return q();
            };

            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '5.0.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(() => {
                    bigIq.revokeLicense()
                        .then(() => {
                            test.strictEqual(revokeCalled, true);
                        })
                        .catch(() => {
                            test.ok(true);
                        })
                        .finally(() => {
                            test.done();
                        });
                });
        },

        test5_2(test) {
            const licenseProvider = require('../../lib/bigIq52LicenseProvider');

            licenseProvider.revoke = () => {
                return q();
            };

            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '5.2.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(() => {
                    bigIq.revokeLicense()
                        .then(() => {
                            test.strictEqual(revokeCalled, true);
                        })
                        .catch(() => {
                            test.ok(true);
                        })
                        .finally(() => {
                            test.done();
                        });
                });
        },

        test5_3(test) {
            const licenseProvider = require('../../lib/bigIq53LicenseProvider');

            licenseProvider.revoke = () => {
                return q();
            };

            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '5.3.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(() => {
                    bigIq.revokeLicense()
                        .then(() => {
                            test.strictEqual(revokeCalled, true);
                        })
                        .catch(() => {
                            test.ok(true);
                        })
                        .finally(() => {
                            test.done();
                        });
                });
        },

        testPre5_0(test) {
            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '4.9.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(() => {
                    bigIq.revokeLicense()
                        .then(() => {
                            test.ok(false, 'should have thrown not supported');
                        })
                        .catch((err) => {
                            test.notStrictEqual(err.message.indexOf('BIG-IQ versions'), -1);
                        })
                        .finally(() => {
                            test.done();
                        });
                });
        }
    }
};
