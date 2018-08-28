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

const now = Date.now();
const publicKeyFile = `/tmp/public_${now}.pem`;
const privateKeyFile = `/tmp/private_${now}.pem`;

let fs;
let childProcess;
let crypto;
let cryptoUtil;

let fsReadFile;

const testData = {
    foo: 'bar',
    hello: 'world',
    a: {
        x: 1,
        y: 2
    }
};

/* eslint-disable global-require */
module.exports = {
    setUp(callback) {
        fs = require('fs');
        childProcess = require('child_process');
        crypto = require('crypto');
        cryptoUtil = require('../../../f5-cloud-libs').cryptoUtil;

        fsReadFile = fs.readFile;

        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        try {
            fs.readFile = fsReadFile;

            if (fs.existsSync(publicKeyFile)) {
                fs.unlinkSync(publicKeyFile);
            }
            if (fs.existsSync(privateKeyFile)) {
                fs.unlinkSync(privateKeyFile);
            }
        } catch (err) {
            console.log(err); // eslint-disable-line no-console
        } finally {
            callback();
        }
    },

    testRoundTrip: {
        testPublicKeyInFile(test) {
            const options = {
                publicKeyOutFile: publicKeyFile
            };

            test.expect(1);
            cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(() => {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then((decryptedData) => {
                    test.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    test.ok(false, error);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPublicKeyInFilePassphrase(test) {
            const options = {
                publicKeyOutFile: publicKeyFile,
                passphrase: 'foobar'
            };

            test.expect(1);
            cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(() => {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData, { passphrase: 'foobar' });
                })
                .then((decryptedData) => {
                    test.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    test.ok(false, error);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPublicKeyInData(test) {
            test.expect(1);
            cryptoUtil.generateKeyPair(privateKeyFile)
                .then((publicKey) => {
                    return cryptoUtil.encrypt(publicKey, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then((decryptedData) => {
                    test.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    test.ok(false, error);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRoundTripSymmetric: {
        testPublicKeyInFile(test) {
            const options = {
                publicKeyOutFile: publicKeyFile
            };

            test.expect(1);
            cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(() => {
                    return cryptoUtil.symmetricEncrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.symmetricDecrypt(
                        privateKeyFile,
                        encryptedData.encryptedKey,
                        encryptedData.iv,
                        encryptedData.encryptedData
                    );
                })
                .then((decryptedData) => {
                    test.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    test.ok(false, error);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGenerateKeyPair: {
        testGenRsaError(test) {
            const message = 'genrsa error';
            childProcess.exec = function exec(command, cb) {
                cb(new Error(message));
            };

            cryptoUtil.generateKeyPair()
                .then(() => {
                    test.ok(false, 'should have thrown genrsa error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRsaError(test) {
            const message = 'rsa error';
            childProcess.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/openssl genrsa')) {
                    cb();
                } else if (command.startsWith('/usr/bin/openssl rsa')) {
                    cb(new Error(message));
                }
            };

            cryptoUtil.generateKeyPair()
                .then(() => {
                    test.ok(false, 'should have thrown rsa error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testEncrypt: {
        testBadData(test) {
            test.expect(1);
            return cryptoUtil.encrypt('publicKey', testData)
                .then(() => {
                    test.ok(false, 'should have thrown bad data');
                })
                .catch((error) => {
                    test.notStrictEqual(error.message.indexOf('must be a string'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testReadPublicKeyError(test) {
            const message = 'read file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData))
                .then(() => {
                    test.ok(false, 'should have thrown read error');
                })
                .catch((error) => {
                    test.strictEqual(error.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCryptoEncryptError(test) {
            const message = 'crypto encrypt error';

            crypto.publicEncrypt = function publicEncrypt() {
                throw new Error(message);
            };

            test.expect(1);
            return cryptoUtil.encrypt('-----BEGIN PUBLIC KEY-----', JSON.stringify(testData))
                .then(() => {
                    test.ok(false, 'should have thrown crypto encrypt error');
                })
                .catch((error) => {
                    test.strictEqual(error.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testDecrypt: {
        testBadData(test) {
            test.expect(1);
            return cryptoUtil.decrypt('privateKey', testData)
                .then(() => {
                    test.ok(false, 'should have thrown bad data');
                })
                .catch((error) => {
                    test.notStrictEqual(error.message.indexOf('must be a string'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testReadPrivateKeyError(test) {
            const message = 'read file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            return cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData))
                .then(() => {
                    test.ok(false, 'should have thrown read error');
                })
                .catch((error) => {
                    test.strictEqual(error.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testWaitForMcpError(test) {
            const message = 'waitForMcp error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            childProcess.execFile = function execFile(file, optionsOrCb) {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb(new Error(message));
                }
            };

            fs.readFile = function readFile(file, cb) {
                cb();
            };

            test.expect(1);
            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    test.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPassphraseDecryptError(test) {
            const message = 'decrypt conf value error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            childProcess.execFile = function execFile(file, optionsOrCb, cb) {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb();
                }

                if (file.endsWith('decryptConfValue')) {
                    cb(new Error(message));
                }
            };

            fs.readFile = function readFile(file, cb) {
                cb();
            };

            test.expect(1);
            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    test.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCryptoDecryptError(test) {
            const message = 'crypto private decrypt error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            childProcess.execFile = function execFile(file, optionsOrCb, cb) {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb();
                }

                if (file.endsWith('decryptConfValue')) {
                    cb();
                }
            };

            fs.readFile = function readFile(file, cb) {
                cb();
            };

            crypto.privateDecrypt = function privateDecrypt() {
                throw new Error(message);
            };

            test.expect(1);
            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    test.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGenerateRandomBytes: {
        testBasic(test) {
            test.expect(1);
            cryptoUtil.generateRandomBytes(4, 'hex')
                .then((bytes) => {
                    test.strictEqual(bytes.length, 8);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCryptoRandomBytesError(test) {
            const message = 'crypto randomBytes error';
            const realRandomBytes = crypto.randomBytes;
            crypto.randomBytes = function randomBytes(length, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            cryptoUtil.generateRandomBytes(4, 'hex')
                .then(() => {
                    test.ok(false, 'should have thrown random bytes error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    crypto.randomBytes = realRandomBytes;
                    test.done();
                });
        }
    },

    testGenerateRandomIntInRange(test) {
        const LOW = 0;
        const HIGH_RANGE_1 = 255;
        const HIGH_RANGE_2 = 65535;
        const HIGH_RANGE_3 = 16777215;
        const HIGH_RANGE_4 = 4294967295;
        const HIGH_RANGE_5 = 1099511627775;

        let randomNum;
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_1);
            test.ok(randomNum >= LOW);
            test.ok(randomNum <= HIGH_RANGE_1);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_2);
            test.ok(randomNum >= LOW);
            test.ok(randomNum <= HIGH_RANGE_2);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_3);
            test.ok(randomNum >= LOW);
            test.ok(randomNum <= HIGH_RANGE_3);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_4);
            test.ok(randomNum >= LOW);
            test.ok(randomNum <= HIGH_RANGE_4);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_5);
            test.ok(randomNum >= LOW);
            test.ok(randomNum <= HIGH_RANGE_5);
        }
        test.done();
    },

    testSetLogger(test) {
        test.doesNotThrow(() => {
            cryptoUtil.setLogger();
        });
        test.done();
    }
};
