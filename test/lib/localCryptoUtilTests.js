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
    let decryptedData;

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
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('decrypt data tests', () => {
        it('no file test', (done) => {
            assert.throws(() => {
                localCryptoUtil.decryptData(null, 'foo', 'bar');
            });
            done();
        });

        it('no private key folder test', (done) => {
            assert.throws(() => {
                localCryptoUtil.decryptData('foo', null, 'bar');
            });
            done();
        });

        it('no private key name test', (done) => {
            assert.throws(() => {
                localCryptoUtil.decryptData('foo', 'bar');
            });
            done();
        });

        it('basic test', (done) => {
            dataToDecrypt = 'abcd';
            decryptedData = 'hello, world';

            localCryptoUtil.decryptData(dataToDecrypt, 'foo', 'bar')
                .then((response) => {
                    assert.strictEqual(dataSent, dataToDecrypt);
                    assert.strictEqual(response, decryptedData);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('no passphrase test', (done) => {
            localCryptoUtil.decryptData('foo', 'foo', 'bar')
                .then(() => {
                    assert.strictEqual(optionsSent.passphrase, undefined);
                    assert.strictEqual(optionsSent.passphraseEncrypted, false);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('passphrase test', (done) => {
            const passphrase = 'mypassphrase';

            localKeyUtilMock.getPrivateKeyMetadata = function getPrivateKeyMetadata() {
                return q({ passphrase });
            };

            localCryptoUtil.decryptData('foo', 'foo', 'bar')
                .then(() => {
                    assert.strictEqual(optionsSent.passphrase, passphrase);
                    assert.strictEqual(optionsSent.passphraseEncrypted, true);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('decrypt password tests', () => {
        it('basic test', (done) => {
            decryptedData = 'hello, world';

            localCryptoUtil.decryptPassword('secret')
                .then((decryptedSecret) => {
                    assert.deepEqual(decryptedSecret, decryptedData);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('symmetric decrypt password tests', () => {
        it('basic test', (done) => {
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
                    assert.deepEqual(decryptedSecret, decryptedData);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('decrypt data from file tests', () => {
        it('basic test', (done) => {
            dataToDecrypt = 'abcd';
            decryptedData = 'hello, world';

            localCryptoUtil.decryptDataFromFile('/foo/bar')
                .then((response) => {
                    assert.strictEqual(dataSent, dataToDecrypt);
                    assert.strictEqual(response, decryptedData);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('symmetric test', (done) => {
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

            localCryptoUtil.decryptDataFromFile('/foo/bar', { symmetric: true })
                .then((response) => {
                    assert.strictEqual(dataSent, encryptedData);
                    assert.strictEqual(response, decryptedData);
                    assert.strictEqual(encryptedKeySent, encryptedKey);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('error test', (done) => {
            assert.throws(() => {
                localCryptoUtil.decryptDataFromFile(null);
            });
            done();
        });
    });

    describe('decrypt conf value tests', () => {
        beforeEach(() => {
            childProcessMock = require('child_process');
        });

        it('basic test', (done) => {
            childProcessMock.execFile = function execFile(file, params, cb) {
                cb(null, decryptedData, null);
            };

            localCryptoUtil.decryptConfValue('foo')
                .then((response) => {
                    assert.strictEqual(response, decryptedData);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('error test', (done) => {
            childProcessMock.execFile = function execFile(file, params, cb) {
                cb(new Error('foo'), null, 'bar');
            };

            localCryptoUtil.decryptConfValue('foo')
                .then(() => {
                    assert.ok(false, 'decryptConfValue should have thrown');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('bar'), -1);
                })
                .finally(() => {
                    done();
                });
        });
    });
});
