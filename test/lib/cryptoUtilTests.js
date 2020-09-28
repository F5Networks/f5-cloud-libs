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
const assert = require('assert');

describe('bigip tests', () => {
    const publicKeyFile = `/tmp/public_${now}.pem`;
    const privateKeyFile = `/tmp/private_${now}.pem`;

    let fs;
    let childProcess;
    let crypto;
    let cryptoUtil;
    let util;
    let q;

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

    beforeEach(() => {
        fs = require('fs');
        childProcess = require('child_process');
        crypto = require('crypto');
        q = require('q');
        util = require('../../../f5-cloud-libs').util;
        cryptoUtil = require('../../../f5-cloud-libs').cryptoUtil;

        fsReadFile = fs.readFile;
    });

    afterEach(() => {
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
        }
    });

    describe('round trip tests', () => {
        it('public key in file test', (done) => {
            const options = {
                publicKeyOutFile: publicKeyFile
            };

            cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(() => {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then((decryptedData) => {
                    assert.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    assert.ok(false, error);
                })
                .finally(() => {
                    done();
                });
        });

        it('public key in file passphrase test', (done) => {
            const options = {
                publicKeyOutFile: publicKeyFile,
                passphrase: 'foobar'
            };

            cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(() => {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData, { passphrase: 'foobar' });
                })
                .then((decryptedData) => {
                    assert.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    assert.ok(false, error);
                })
                .finally(() => {
                    done();
                });
        });

        it('public key in data test', (done) => {
            cryptoUtil.generateKeyPair(privateKeyFile)
                .then((publicKey) => {
                    return cryptoUtil.encrypt(publicKey, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then((decryptedData) => {
                    assert.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    assert.ok(false, error);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('round trip symmetric tests', () => {
        it('public key in file test', (done) => {
            const options = {
                publicKeyOutFile: publicKeyFile
            };

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
                    assert.deepEqual(JSON.parse(decryptedData), testData);
                })
                .catch((error) => {
                    assert.ok(false, error);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('generate Key Pair tests', () => {
        it('gen rsa error test', (done) => {
            const message = 'genrsa error';
            childProcess.exec = function exec(command, cb) {
                cb(new Error(message));
            };

            cryptoUtil.generateKeyPair()
                .then(() => {
                    assert.ok(false, 'should have thrown genrsa error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('rsa error test', (done) => {
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
                    assert.ok(false, 'should have thrown rsa error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('encrypt tests', () => {
        it('bad data test', (done) => {
            cryptoUtil.encrypt('publicKey', testData)
                .then(() => {
                    assert.ok(false, 'should have thrown bad data');
                })
                .catch((error) => {
                    assert.notStrictEqual(error.message.indexOf('must be a string'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('read public key error test', (done) => {
            const message = 'read file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData))
                .then(() => {
                    assert.ok(false, 'should have thrown read error');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('crypto encrypt error test', (done) => {
            const message = 'crypto encrypt error';

            crypto.publicEncrypt = function publicEncrypt() {
                throw new Error(message);
            };

            cryptoUtil.encrypt('-----BEGIN PUBLIC KEY-----', JSON.stringify(testData))
                .then(() => {
                    assert.ok(false, 'should have thrown crypto encrypt error');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('decrypt tests', () => {
        it('bad data test', (done) => {
            cryptoUtil.decrypt('privateKey', testData)
                .then(() => {
                    assert.ok(false, 'should have thrown bad data');
                })
                .catch((error) => {
                    assert.notStrictEqual(error.message.indexOf('must be a string'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('read private key error test', (done) => {
            const message = 'read file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData))
                .then(() => {
                    assert.ok(false, 'should have thrown read error');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('wait for mcp error test', (done) => {
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

            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    assert.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('passphrase decrypt error test', (done) => {
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

            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    assert.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('crypto decrypt error test', (done) => {
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

            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    assert.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('generate random bytes tests', () => {
        it('basic test', (done) => {
            cryptoUtil.generateRandomBytes(4, 'hex')
                .then((bytes) => {
                    assert.strictEqual(bytes.length, 8);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('crypto random bytes error test', (done) => {
            const message = 'crypto randomBytes error';
            const realRandomBytes = crypto.randomBytes;
            crypto.randomBytes = function randomBytes(length, cb) {
                cb(new Error(message));
            };

            cryptoUtil.generateRandomBytes(4, 'hex')
                .then(() => {
                    assert.ok(false, 'should have thrown random bytes error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    crypto.randomBytes = realRandomBytes;
                    done();
                });
        });
    });

    it('generate random int in range test', (done) => {
        const LOW = 0;
        const HIGH_RANGE_1 = 255;
        const HIGH_RANGE_2 = 65535;
        const HIGH_RANGE_3 = 16777215;
        const HIGH_RANGE_4 = 4294967295;
        const HIGH_RANGE_5 = 1099511627775;

        let randomNum;
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_1);
            assert.ok(randomNum >= LOW);
            assert.ok(randomNum <= HIGH_RANGE_1);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_2);
            assert.ok(randomNum >= LOW);
            assert.ok(randomNum <= HIGH_RANGE_2);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_3);
            assert.ok(randomNum >= LOW);
            assert.ok(randomNum <= HIGH_RANGE_3);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_4);
            assert.ok(randomNum >= LOW);
            assert.ok(randomNum <= HIGH_RANGE_4);
        }
        for (let i = 0; i < 1000; i++) {
            randomNum = cryptoUtil.generateRandomIntInRange(LOW, HIGH_RANGE_5);
            assert.ok(randomNum >= LOW);
            assert.ok(randomNum <= HIGH_RANGE_5);
        }
        done();
    });

    describe('random user tests', () => {
        it('create random user bad password test', (done) => {
            cryptoUtil.generateRandomBytes = function generateRandomBytes(length) {
                const lengths = {
                    10: 'user',
                    24: 'password'
                };
                return q(lengths[length]);
            };

            cryptoUtil.checkPasswordAll = function checkPasswordAll(length, password) {
                return q.reject(password);
            };

            util.runTmshCommand = function runTmshCommand() {
                return q();
            };

            cryptoUtil.nextRandomUser()
                .then(() => {
                    assert.ok(false, 'Should have thrown an error, please check test.');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'too many tries');
                })
                .finally(() => {
                    done();
                });
        });

        it('create random user test', (done) => {
            const expectedUser = {
                user: 'user',
                password: 'Z+Skz3kmUoLft02zUoguohaR0e1yIO+p'
            };

            cryptoUtil.generateRandomBytes = function generateRandomBytes(length) {
                const lengths = {
                    10: 'user',
                    24: 'Z+Skz3kmUoLft02zUoguohaR0e1yIO+p'
                };
                return q(lengths[length]);
            };

            cryptoUtil.checkPasswordAll = function checkPasswordAll(length, password) {
                return q(password);
            };

            util.runTmshCommand = function runTmshCommand() {
                return q();
            };

            cryptoUtil.nextRandomUser()
                .then((response) => {
                    assert.deepEqual(response, expectedUser);
                })
                .finally(() => {
                    done();
                });
        });
    });

    it('set logger test', (done) => {
        assert.doesNotThrow(() => {
            cryptoUtil.setLogger();
        });
        done();
    });
});
