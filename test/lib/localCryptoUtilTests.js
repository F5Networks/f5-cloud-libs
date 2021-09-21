/**
 * Copyright 2016-2018 F5 Networks, Inc.
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

describe('local crypto util tests', () => {
    let localKeyUtilMock;
    let cryptoUtilMock;
    let utilMock;
    let localCryptoUtil;
    let childProcessMock;

    let dataSent;
    let optionsSent;
    let encryptedKeySent;
    let dataToDecrypt;

    /* eslint-disable global-require */

    beforeEach(() => {
        utilMock = require('../../lib/util');
        localKeyUtilMock = require('../../lib/localKeyUtil');
        cryptoUtilMock = require('../../lib/cryptoUtil');

        localCryptoUtil = require('../../lib/localCryptoUtil');

        encryptedKeySent = undefined;

        localKeyUtilMock.getPrivateKeyFilePath = function getPrivateKeyFilePath() {
            return q('/foo/bar');
        };

        localKeyUtilMock.getPrivateKeyMetadata = function getPrivateKeyMetadata() {
            return q({});
        };

        localKeyUtilMock.getExistingPrivateKeyName = function getExistingPrivateKeyName(folder, name) {
            return q(name);
        };

        utilMock.readDataFromFile = function readDataFromFile() {
            return q(dataToDecrypt);
        };

        cryptoUtilMock.decrypt = function decrypt(privateKey, data, options) {
            dataSent = data;
            optionsSent = options;
            return q('hello, world');
        };

        cryptoUtilMock.symmetricDecrypt = function symmetricDecrypt(
            privateKey,
            encryptedKey,
            iv,
            data,
            options
        ) {
            dataSent = data;
            optionsSent = options;
            encryptedKeySent = encryptedKey;
            return q('hello, world');
        };
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('decrypt data tests', () => {
        it('no file test', () => {
            assert.throws(() => {
                localCryptoUtil.decryptData(null, 'foo', 'bar');
            }, /data is required/);
        });

        it('no private key folder test', () => {
            assert.throws(() => {
                localCryptoUtil.decryptData('foo', null, 'bar');
            }, /privateKeyFolder is required/);
        });

        it('no private key name test', () => {
            assert.throws(() => {
                localCryptoUtil.decryptData('foo', 'bar');
            }, /privateKeyName is required/);
        });

        it('basic test', () => {
            dataToDecrypt = 'abcd';

            return localCryptoUtil.decryptData(dataToDecrypt, 'foo', 'bar')
                .then((response) => {
                    assert.strictEqual(dataSent, 'abcd');
                    assert.strictEqual(response, 'hello, world');
                });
        });

        it('no passphrase test', () => {
            return localCryptoUtil.decryptData('foo', 'foo', 'bar')
                .then(() => {
                    assert.strictEqual(optionsSent.passphrase, undefined);
                    assert.strictEqual(optionsSent.passphraseEncrypted, false);
                });
        });

        it('passphrase test', () => {
            localKeyUtilMock.getPrivateKeyMetadata = function getPrivateKeyMetadata() {
                return q({ passphrase: 'mypassphrase' });
            };

            return localCryptoUtil.decryptData('foo', 'foo', 'bar')
                .then(() => {
                    assert.strictEqual(optionsSent.passphrase, 'mypassphrase');
                    assert.strictEqual(optionsSent.passphraseEncrypted, true);
                });
        });
    });

    describe('decrypt password tests', () => {
        it('basic test', () => {
            return localCryptoUtil.decryptPassword('secret')
                .then((decryptedSecret) => {
                    assert.deepStrictEqual(decryptedSecret, 'hello, world');
                });
        });
    });

    describe('symmetric decrypt password tests', () => {
        it('basic test', () => {
            dataToDecrypt = {
                encryptedData: 'secret',
                encryptedKey: 'key',
                iv: 'foo',
                privateKey: {
                    folder: 'foo',
                    name: 'bar'
                }
            };

            return localCryptoUtil.symmetricDecryptPassword(dataToDecrypt)
                .then((decryptedSecret) => {
                    assert.deepStrictEqual(decryptedSecret, 'hello, world');
                });
        });
    });

    describe('decrypt data from file tests', () => {
        it('basic test', () => {
            dataToDecrypt = 'abcd';

            return localCryptoUtil.decryptDataFromFile('/foo/bar')
                .then((response) => {
                    assert.strictEqual(dataSent, dataToDecrypt);
                    assert.strictEqual(response, 'hello, world');
                });
        });

        it('symmetric test', () => {
            const encryptedData = 'secret';
            const encryptedKey = 'key';
            dataToDecrypt = JSON.stringify({
                encryptedData,
                encryptedKey,
                iv: 'foo',
                privateKey: {
                    folder: 'foo',
                    name: 'bar'
                }
            });

            return localCryptoUtil.decryptDataFromFile('/foo/bar', { symmetric: true })
                .then((response) => {
                    assert.strictEqual(dataSent, encryptedData);
                    assert.strictEqual(response, 'hello, world');
                    assert.strictEqual(encryptedKeySent, encryptedKey);
                });
        });

        it('error test', () => {
            assert.throws(() => {
                localCryptoUtil.decryptDataFromFile(null);
            }, /dataFile is required/);
        });
    });

    describe('decrypt conf value tests', () => {
        beforeEach(() => {
            childProcessMock = require('child_process');
        });

        it('basic test', () => {
            childProcessMock.execFile = function execFile(file, params, cb) {
                cb(null, 'hello, world', null);
            };

            return localCryptoUtil.decryptConfValue('foo')
                .then((response) => {
                    assert.strictEqual(response, 'hello, world');
                });
        });

        it('error test', () => {
            childProcessMock.execFile = function execFile(file, params, cb) {
                cb(new Error('foo'), null, 'bar');
            };

            return localCryptoUtil.decryptConfValue('foo')
                .then(() => {
                    assert.ok(false, 'decryptConfValue should have thrown');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('bar'), -1);
                });
        });
    });
});
