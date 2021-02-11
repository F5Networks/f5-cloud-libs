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
const assert = require('assert');

const PRODUCTS = require('../../lib/sharedConstants').PRODUCTS;

describe('authn tests', () => {
    const token = 'my auth token';
    const refreshToken = 'my refresh token';
    const decryptedPassword = 'my decrypted password';

    let authn;
    let icontrolMock;
    let localCryptoUtilMock;
    let utilMock;
    let LoggerMock;

    beforeEach(() => {
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
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('basic test', () => {
        const host = 'myHost';
        const user = 'myUser';
        const password = 'myPassword';

        return authn.authenticate(host, user, password)
            .then(() => {
                assert.strictEqual(
                    icontrolMock.getRequest('create', '/shared/authn/login').password, password
                );
            });
    });

    it('product specified test', () => {
        const host = 'myHost';
        const user = 'myUser';
        const password = 'myPassword';

        return authn.authenticate(host, user, password, { product: 'BIG-IP' })
            .then(() => {
                assert.strictEqual(icontrolMock.getRequest('create', '/shared/authn/login'), undefined);
            });
    });

    it('password url test', () => {
        const host = 'myHost';
        const user = 'myUser';
        const password = 'myPassword';
        const passwordFile = '/tmp/passwordFromUrlTest';
        const passwordUrl = `file://${passwordFile}`;

        fs.writeFileSync(passwordFile, password);

        return authn.authenticate(host, user, passwordUrl, { passwordIsUri: true })
            .then((icontrol) => {
                assert.strictEqual(
                    icontrolMock.getRequest('create', '/shared/authn/login').password, password
                );
                assert.strictEqual(icontrol.authToken, token);
            });
    });

    it('password arn test', () => {
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

        return authn.authenticate(host, user, passwordUri, { passwordIsUri: true })
            .then(() => {
                const loginRequest = icontrolMock.getRequest('create', '/shared/authn/login');
                assert.strictEqual(loginRequest.password, password);
            });
    });

    it('password arn bucket fail test', () => {
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
        return authn.authenticate(host, user, passwordUri, { passwordIsUri: true })
            .then(() => {
                assert.ok(false, 'Should not have been able to resolve');
            })
            .catch(() => {
                assert.strictEqual(loggedMessages[0],
                    'Unable to initialize device');
            });
    });

    it('password token test', () => {
        const host = 'myHost';
        const user = 'myUser';

        return authn.authenticate(host, user, token, { product: 'BIG-IP', passwordIsToken: true })
            .then((icontrol) => {
                assert.strictEqual(icontrol.authToken, token);
            });
    });

    describe('password encrypted tests', () => {
        beforeEach(() => {
            localCryptoUtilMock.decryptPassword = () => {
                return q(decryptedPassword);
            };
        });

        it('basic test', () => {
            return authn.authenticate('host', 'user', 'password', { passwordEncrypted: true })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/shared/authn/login').password, decryptedPassword
                    );
                });
        });

        it('decrypt error test', () => {
            const errorMessage = 'decryption error';
            localCryptoUtilMock.decryptPassword = () => {
                return q.reject(new Error(errorMessage));
            };
            return authn.authenticate('host', 'user', 'password', { passwordEncrypted: true })
                .then(() => {
                    assert.ok(false, 'should have thrown decryption error');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(errorMessage), -1);
                });
        });
    });

    it('no auth token test', () => {
        icontrolMock.when(
            'create',
            '/shared/authn/login',
            {}
        );

        return authn.authenticate('host', 'user', 'password')
            .then(() => {
                assert.ok(false, 'should have thrown no auth token');
            })
            .catch((err) => {
                assert.notStrictEqual(err.message.indexOf('Did not receive auth token'), -1);
            });
    });

    it('local auth test', () => {
        return authn.authenticate('localhost', null, null, { port: 8100 })
            .then(() => {
                assert.strictEqual(icontrolMock.getNumRequests(), 0);
            });
    });

    it('auth provider test', () => {
        const options = {
            product: PRODUCTS.BIGIQ,
            authProvider: 'myAuthProvider'
        };

        return authn.authenticate('host', 'user', 'password', options)
            .then(() => {
                assert.strictEqual(
                    icontrolMock.getRequest('create', '/shared/authn/login').loginProviderName,
                    'myAuthProvider'
                );
            })
            .catch((err) => {
                assert.ok(false, err);
            });
    });
});
