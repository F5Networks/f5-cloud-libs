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

const sinon = require('sinon');
const assert = require('assert');
const crypto = require('crypto');
const childProcess = require('child_process');

const now = Date.now();

describe('bigip tests', () => {
    const publicKeyFile = `/tmp/public_${now}.pem`;
    const privateKeyFile = `/tmp/private_${now}.pem`;

    let fs;
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
        q = require('q');
        util = require('../../../f5-cloud-libs').util;
        cryptoUtil = require('../../../f5-cloud-libs').cryptoUtil;

        fsReadFile = fs.readFile;
    });

    afterEach(() => {
        sinon.restore();

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
        it('public key in file test', () => {
            const options = {
                publicKeyOutFile: publicKeyFile
            };

            return cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(() => {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then((decryptedData) => {
                    assert.deepStrictEqual(JSON.parse(decryptedData), testData);
                });
        });

        it('public key in file passphrase test', () => {
            const options = {
                publicKeyOutFile: publicKeyFile,
                passphrase: 'foobar'
            };

            return cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(() => {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData, { passphrase: 'foobar' });
                })
                .then((decryptedData) => {
                    assert.deepStrictEqual(JSON.parse(decryptedData), testData);
                });
        });

        it('public key in data test', () => {
            return cryptoUtil.generateKeyPair(privateKeyFile)
                .then((publicKey) => {
                    return cryptoUtil.encrypt(publicKey, JSON.stringify(testData));
                })
                .then((encryptedData) => {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then((decryptedData) => {
                    assert.deepStrictEqual(JSON.parse(decryptedData), testData);
                });
        });
    });

    describe('round trip symmetric tests', () => {
        it('public key in file test', () => {
            const options = {
                publicKeyOutFile: publicKeyFile
            };

            return cryptoUtil.generateKeyPair(privateKeyFile, options)
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
                    assert.deepStrictEqual(JSON.parse(decryptedData), testData);
                });
        });
    });

    describe('generate Key Pair tests', () => {
        it('gen rsa error test', () => {
            const message = 'genrsa error';
            sinon.stub(childProcess, 'exec').callsFake((command, cb) => {
                cb(new Error(message));
            });

            return cryptoUtil.generateKeyPair()
                .then(() => {
                    assert.ok(false, 'should have thrown genrsa error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });

        it('rsa error test', () => {
            const message = 'rsa error';
            sinon.stub(childProcess, 'exec').callsFake((command, cb) => {
                if (command.startsWith('/usr/bin/openssl genrsa')) {
                    cb();
                } else if (command.startsWith('/usr/bin/openssl rsa')) {
                    cb(new Error(message));
                }
            });

            return cryptoUtil.generateKeyPair()
                .then(() => {
                    assert.ok(false, 'should have thrown rsa error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });
    });

    describe('encrypt tests', () => {
        it('bad data test', () => {
            return cryptoUtil.encrypt('publicKey', testData)
                .then(() => {
                    assert.ok(false, 'should have thrown bad data');
                })
                .catch((error) => {
                    assert.notStrictEqual(error.message.indexOf('must be a string'), -1);
                });
        });

        it('read public key error test', () => {
            const message = 'read file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData))
                .then(() => {
                    assert.ok(false, 'should have thrown read error');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, message);
                });
        });

        it('crypto encrypt error test', () => {
            const message = 'crypto encrypt error';

            sinon.stub(crypto, 'publicEncrypt').throws(new Error(message));

            return cryptoUtil.encrypt('-----BEGIN PUBLIC KEY-----', JSON.stringify(testData))
                .then(() => {
                    assert.ok(false, 'should have thrown crypto encrypt error');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, message);
                });
        });
    });

    describe('decrypt tests', () => {
        it('bad data test', () => {
            return cryptoUtil.decrypt('privateKey', testData)
                .then(() => {
                    assert.ok(false, 'should have thrown bad data');
                })
                .catch((error) => {
                    assert.notStrictEqual(error.message.indexOf('must be a string'), -1);
                });
        });

        it('read private key error test', () => {
            const message = 'read file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            return cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData))
                .then(() => {
                    assert.ok(false, 'should have thrown read error');
                })
                .catch((error) => {
                    assert.strictEqual(error.message, message);
                });
        });

        it('wait for mcp error test', () => {
            const message = 'waitForMcp error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            sinon.stub(childProcess, 'execFile').callsFake((file, optionsOrCb) => {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb(new Error(message));
                }
            });

            fs.readFile = function readFile(file, cb) {
                cb();
            };

            return cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    assert.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });

        it('passphrase decrypt error test', () => {
            const message = 'decrypt conf value error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            sinon.stub(childProcess, 'execFile').callsFake((file, optionsOrCb, cb) => {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb();
                }

                if (file.endsWith('decryptConfValue')) {
                    cb(new Error(message));
                }
            });

            fs.readFile = function readFile(file, cb) {
                cb();
            };

            return cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    assert.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });

        it('crypto decrypt error test', () => {
            const message = 'crypto private decrypt error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            sinon.stub(childProcess, 'execFile').callsFake((file, optionsOrCb, cb) => {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb();
                }

                if (file.endsWith('decryptConfValue')) {
                    cb();
                }
            });

            fs.readFile = function readFile(file, cb) {
                cb();
            };

            sinon.stub(crypto, 'privateDecrypt').throws(new Error(message));

            return cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(() => {
                    assert.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });
    });

    describe('generate random bytes tests', () => {
        it('basic test', () => {
            return cryptoUtil.generateRandomBytes(4, 'hex')
                .then((bytes) => {
                    assert.strictEqual(bytes.length, 8);
                });
        });

        it('crypto random bytes error test', () => {
            const message = 'crypto randomBytes error';

            sinon.stub(crypto, 'randomBytes').callsFake((length, cb) => {
                cb(new Error(message));
            });

            return cryptoUtil.generateRandomBytes(4, 'hex')
                .then(() => {
                    assert.ok(false, 'should have thrown random bytes error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });
    });

    it('generate random int in range test', () => {
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
    });

    describe('random user tests', () => {
        it('create random user bad password test', () => {
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

            return cryptoUtil.nextRandomUser()
                .then(() => {
                    assert.ok(false, 'Should have thrown an error, please check test.');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'too many tries');
                });
        });

        it('create random user test', () => {
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

            return cryptoUtil.nextRandomUser()
                .then((response) => {
                    assert.deepStrictEqual(response, expectedUser);
                });
        });
    });

    it('set logger test', () => {
        assert.doesNotThrow(() => {
            cryptoUtil.setLogger();
        });
    });
});
