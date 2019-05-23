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

const fs = require('fs');
const q = require('q');

const token = 'my auth token';
const refreshToken = 'my refresh token';
const decryptedPassword = 'my decrypted password';

let authn;
let icontrolMock;
let localCryptoUtilMock;
let utilMock;
let LoggerMock;

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        utilMock = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        localCryptoUtilMock = require('../../../f5-cloud-libs').localCryptoUtil;
        authn = require('../../../f5-cloud-libs').authn;
        LoggerMock = require('../../../f5-cloud-libs').logger;
        /* eslint-enable global-require */

        authn.icontrol = icontrolMock;

        utilMock.getProduct = () => {
            return q('BIG-IQ');
        };

        icontrolMock.reset();
        icontrolMock.when(
            'create',
            '/shared/authn/login',
            {
                token: {
                    token
                },
                refreshToken: {
                    token: refreshToken
                }
            }
        );

        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },

    testBasic(test) {
        const host = 'myHost';
        const user = 'myUser';
        const password = 'myPassword';

        test.expect(1);
        authn.authenticate(host, user, password)
            .then(() => {
                test.strictEqual(
                    icontrolMock.getRequest('create', '/shared/authn/login').password, password
                );
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testProductSpecified(test) {
        const host = 'myHost';
        const user = 'myUser';
        const password = 'myPassword';

        test.expect(1);
        authn.authenticate(host, user, password, { product: 'BIG-IP' })
            .then(() => {
                test.strictEqual(icontrolMock.getRequest('create', '/shared/authn/login'), undefined);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testPasswordUrl(test) {
        const host = 'myHost';
        const user = 'myUser';
        const password = 'myPassword';
        const passwordFile = '/tmp/passwordFromUrlTest';
        const passwordUrl = `file://${passwordFile}`;

        fs.writeFileSync(passwordFile, password);

        test.expect(2);
        authn.authenticate(host, user, passwordUrl, { passwordIsUri: true })
            .then((icontrol) => {
                test.strictEqual(
                    icontrolMock.getRequest('create', '/shared/authn/login').password, password
                );
                test.strictEqual(icontrol.authToken, token);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                fs.unlinkSync(passwordFile);
                test.done();
            });
    },

    testPasswordArn(test) {
        const host = 'myHost';
        const user = 'myUser';
        const password = 'myPassword';
        const passwordUri = 'arn:::foo:bar/password';

        authn.provider = {
            init: () => {
                return q();
            }
        };
        utilMock.readData = () => {
            return q(password);
        };

        test.expect(1);
        authn.authenticate(host, user, passwordUri, { passwordIsUri: true })
            .then(() => {
                const loginRequest = icontrolMock.getRequest('create', '/shared/authn/login');
                test.strictEqual(loginRequest.password, password);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testPasswordArnBucketFail(test) {
        const host = 'myHost';
        const user = 'myUser';
        const passwordUri = 'arn:::foo:bar/password';
        const loggedMessages = [];
        const logger = LoggerMock.getLogger();
        logger.info = (message) => {
            loggedMessages.push(message);
        };

        utilMock.readData = () => {
            return q.reject('S3 bucket not found');
        };
        authn.setLogger(logger);
        authn.provider = {
            init: () => {
                return q();
            }
        };
        test.expect(1);
        authn.authenticate(host, user, passwordUri, { passwordIsUri: true })
            .then(() => {
                test.ok(false, 'Should not have been able to resolve');
            })
            .catch(() => {
                test.strictEqual(loggedMessages[0],
                    'Unable to initialize device');
            })
            .finally(() => {
                test.done();
            });
    },

    testPasswordToken(test) {
        const host = 'myHost';
        const user = 'myUser';

        test.expect(1);
        authn.authenticate(host, user, token, { product: 'BIG-IP', passwordIsToken: true })
            .then((icontrol) => {
                test.strictEqual(icontrol.authToken, token);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testPasswordEncrypted: {
        setUp(callback) {
            localCryptoUtilMock.decryptPassword = () => {
                return q(decryptedPassword);
            };
            callback();
        },

        testBasic(test) {
            test.expect(1);
            authn.authenticate('host', 'user', 'password', { passwordEncrypted: true })
                .then(() => {
                    test.strictEqual(
                        icontrolMock.getRequest('create', '/shared/authn/login').password, decryptedPassword
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDecryptError(test) {
            const errorMessage = 'decryption error';
            localCryptoUtilMock.decryptPassword = () => {
                return q.reject(new Error(errorMessage));
            };
            test.expect(1);
            authn.authenticate('host', 'user', 'password', { passwordEncrypted: true })
                .then(() => {
                    test.ok(false, 'should have thrown decryption error');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf(errorMessage), -1);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testNoAuthToken(test) {
        icontrolMock.when(
            'create',
            '/shared/authn/login',
            {}
        );

        test.expect(1);
        authn.authenticate('host', 'user', 'password')
            .then(() => {
                test.ok(false, 'should have thrown no auth token');
            })
            .catch((err) => {
                test.notStrictEqual(err.message.indexOf('Did not receive auth token'), -1);
            })
            .finally(() => {
                test.done();
            });
    },

    testLocalAuth(test) {
        test.expect(1);
        authn.authenticate('localhost', null, null, { port: 8100 })
            .then(() => {
                test.strictEqual(icontrolMock.getNumRequests(), 0);
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    }
};
