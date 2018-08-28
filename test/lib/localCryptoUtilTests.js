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

let localKeyUtilMock;
let cryptoUtilMock;
let utilMock;
let localCryptoUtil;
let childProcessMock;

let dataSent;
let optionsSent;
let encryptedKeySent;
let dataToDecrypt;
let decryptedData;

/* eslint-disable global-require */
module.exports = {
    setUp(callback) {
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

        utilMock.readDataFromFile = function readDataFromFile() {
            return q(dataToDecrypt);
        };

        cryptoUtilMock.decrypt = function decrypt(privateKey, data, options) {
            dataSent = data;
            optionsSent = options;
            return q(decryptedData);
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
            return q(decryptedData);
        };

        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        callback();
    },

    testDecryptData: {
        testNoFile(test) {
            test.expect(1);
            test.throws(() => {
                localCryptoUtil.decryptData(null, 'foo', 'bar');
            });
            test.done();
        },

        testNoPrivateKeyFolder(test) {
            test.expect(1);
            test.throws(() => {
                localCryptoUtil.decryptData('foo', null, 'bar');
            });
            test.done();
        },

        testNoPrivateKeyName(test) {
            test.expect(1);
            test.throws(() => {
                localCryptoUtil.decryptData('foo', 'bar');
            });
            test.done();
        },

        testBasic(test) {
            dataToDecrypt = 'abcd';
            decryptedData = 'hello, world';

            test.expect(2);
            localCryptoUtil.decryptData(dataToDecrypt, 'foo', 'bar')
                .then((response) => {
                    test.strictEqual(dataSent, dataToDecrypt);
                    test.strictEqual(response, decryptedData);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoPassphrase(test) {
            test.expect(2);
            localCryptoUtil.decryptData('foo', 'foo', 'bar')
                .then(() => {
                    test.strictEqual(optionsSent.passphrase, undefined);
                    test.strictEqual(optionsSent.passphraseEncrypted, false);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPassphrase(test) {
            const passphrase = 'mypassphrase';

            localKeyUtilMock.getPrivateKeyMetadata = function getPrivateKeyMetadata() {
                return q({ passphrase });
            };

            test.expect(2);
            localCryptoUtil.decryptData('foo', 'foo', 'bar')
                .then(() => {
                    test.strictEqual(optionsSent.passphrase, passphrase);
                    test.strictEqual(optionsSent.passphraseEncrypted, true);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testDecryptPassword: {
        testBasic(test) {
            decryptedData = 'hello, world';

            localCryptoUtil.decryptPassword('secret')
                .then((decryptedSecret) => {
                    test.deepEqual(decryptedSecret, decryptedData);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testSymmetricDecryptPassword: {
        testBasic(test) {
            dataToDecrypt = {
                encryptedData: 'secret',
                encryptedKey: 'key',
                iv: 'foo',
                privateKey: {
                    folder: 'foo',
                    name: 'bar'
                }
            };
            decryptedData = 'hello, world';

            localCryptoUtil.symmetricDecryptPassword(dataToDecrypt)
                .then((decryptedSecret) => {
                    test.deepEqual(decryptedSecret, decryptedData);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testDecryptDataFromFile: {
        testBasic(test) {
            dataToDecrypt = 'abcd';
            decryptedData = 'hello, world';

            test.expect(2);
            localCryptoUtil.decryptDataFromFile('/foo/bar')
                .then((response) => {
                    test.strictEqual(dataSent, dataToDecrypt);
                    test.strictEqual(response, decryptedData);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSymmetric(test) {
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
            decryptedData = 'hello, world';

            test.expect(3);
            localCryptoUtil.decryptDataFromFile('/foo/bar', { symmetric: true })
                .then((response) => {
                    test.strictEqual(dataSent, encryptedData);
                    test.strictEqual(response, decryptedData);
                    test.strictEqual(encryptedKeySent, encryptedKey);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testError(test) {
            test.expect(1);
            test.throws(() => {
                localCryptoUtil.decryptDataFromFile(null);
            });
            test.done();
        }
    },

    testDecryptConfValue: {
        setUp(callback) {
            childProcessMock = require('child_process');
            callback();
        },

        testBasic(test) {
            childProcessMock.execFile = function execFile(file, params, cb) {
                cb(null, decryptedData, null);
            };

            test.expect(1);
            localCryptoUtil.decryptConfValue('foo')
                .then((response) => {
                    test.strictEqual(response, decryptedData);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testError(test) {
            childProcessMock.execFile = function execFile(file, params, cb) {
                cb(new Error('foo'), null, 'bar');
            };

            test.expect(1);
            localCryptoUtil.decryptConfValue('foo')
                .then(() => {
                    test.ok(false, 'decryptConfValue should have thrown');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('bar'), -1);
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
