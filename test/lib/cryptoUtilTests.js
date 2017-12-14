/**
 * Copyright 2016-2017 F5 Networks, Inc.
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
const crypto = require('crypto');
const childProcess = require('child_process');

const now = Date.now();
const publicKeyFile = '/tmp/public_' + now + '.pem';
const privateKeyFile = '/tmp/private_' + now + '.pem';

const cryptoUtil = require('../../../f5-cloud-libs').cryptoUtil;

const fsReadFile = fs.readFile;

const testData = {
    foo: 'bar',
    hello: 'world',
    a: {
        x: 1,
        y: 2
    }
};

module.exports = {
    tearDown: function(callback) {
        try {
            fs.readFile = fsReadFile;

            fs.unlinkSync(publicKeyFile);
            fs.unlinkSync(privateKeyFile);
        }
        catch (err) {
        }
        callback();
    },

    testRoundTrip: {
        testPublicKeyInFile: function(test) {
            const options = {
                publicKeyOutFile: publicKeyFile
            };

            test.expect(1);
            cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(function() {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then(function(encryptedData) {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then(function(decryptedData) {
                    test.deepEqual(JSON.parse(decryptedData), testData);
                    test.done();
                })
                .catch(function(error) {
                    test.ok(false, error);
                    test.done();
                });
        },

        testPublicKeyInFilePassphrase: function(test) {
            const options = {
                publicKeyOutFile: publicKeyFile,
                passphrase: 'foobar'
            };

            test.expect(1);
            cryptoUtil.generateKeyPair(privateKeyFile, options)
                .then(function() {
                    return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData));
                })
                .then(function(encryptedData) {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData, {passphrase: 'foobar'});
                })
                .then(function(decryptedData) {
                    test.deepEqual(JSON.parse(decryptedData), testData);
                    test.done();
                })
                .catch(function(error) {
                    test.ok(false, error);
                    test.done();
                });
        },

        testPublicKeyInData: function(test) {
            test.expect(1);
            cryptoUtil.generateKeyPair(privateKeyFile)
                .then(function(publicKey) {
                    return cryptoUtil.encrypt(publicKey, JSON.stringify(testData));
                })
                .then(function(encryptedData) {
                    return cryptoUtil.decrypt(privateKeyFile, encryptedData);
                })
                .then(function(decryptedData) {
                    test.deepEqual(JSON.parse(decryptedData), testData);
                    test.done();
                })
                .catch(function(error) {
                    test.ok(false, error);
                    test.done();
                });
        }
    },

    testGenerateKeyPair: {
        testGenRsaError: function(test) {
            const message = 'genrsa error';
            childProcess.exec = function(command, cb) {
                cb(new Error(message));
            };

            cryptoUtil.generateKeyPair()
                .then(function() {
                    test.ok(false, 'should have thrown genrsa error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testRsaError: function(test) {
            const message = 'rsa error';
            childProcess.exec = function(command, cb) {
                if (command.startsWith('/usr/bin/openssl genrsa')) {
                    cb();
                }
                else if (command.startsWith('/usr/bin/openssl rsa')) {
                    cb(new Error(message));
                }
            };

            cryptoUtil.generateKeyPair()
                .then(function() {
                    test.ok(false, 'should have thrown rsa error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testEncrypt: {
        testBadData: function(test) {
            test.expect(1);
            return cryptoUtil.encrypt('publicKey', testData)
                .then(function() {
                    test.ok(false, 'should have thrown bad data');
                })
                .catch(function(error) {
                    test.notStrictEqual(error.message.indexOf('must be a string'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testReadPublicKeyError: function(test) {
            const message = 'read file error';

            fs.readFile = function(file, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            return cryptoUtil.encrypt(publicKeyFile, JSON.stringify(testData))
                .then(function() {
                    test.ok(false, 'should have thrown read error');
                })
                .catch(function(error) {
                    test.strictEqual(error.message, message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testCryptoEncryptError: function(test) {
            const message = 'crypto encrypt error';

            crypto.publicEncrypt = function() {
                throw new Error(message);
            };

            test.expect(1);
            return cryptoUtil.encrypt('-----BEGIN PUBLIC KEY-----', JSON.stringify(testData))
                .then(function() {
                    test.ok(false, 'should have thrown crypto encrypt error');
                })
                .catch(function(error) {
                    test.strictEqual(error.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testDecrypt: {
        testBadData: function(test) {
            test.expect(1);
            return cryptoUtil.decrypt('privateKey', testData)
                .then(function() {
                    test.ok(false, 'should have thrown bad data');
                })
                .catch(function(error) {
                    test.notStrictEqual(error.message.indexOf('must be a string'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testReadPrivateKeyError: function(test) {
            const message = 'read file error';

            fs.readFile = function(file, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            return cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData))
                .then(function() {
                    test.ok(false, 'should have thrown read error');
                })
                .catch(function(error) {
                    test.strictEqual(error.message, message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testWaitForMcpError: function(test) {
            const message = 'waitForMcp error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            childProcess.execFile = function(file, optionsOrCb) {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb(new Error(message));
                }
            };

            fs.readFile = function(file, cb) {
                cb();
            };

            test.expect(1);
            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(function() {
                    test.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPassphraseDecryptError: function(test) {
            const message = 'decrypt conf value error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            childProcess.execFile = function(file, optionsOrCb, cb) {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb();
                }

                if (file.endsWith('decryptConfValue')) {
                    cb(new Error(message));
                }
            };

            fs.readFile = function(file, cb) {
                cb();
            };

            test.expect(1);
            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(function() {
                    test.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testCryptoDecryptError: function(test) {
            const message = 'crypto private decrypt error';
            const options = {
                passphrase: '123',
                passphraseEncrypted: true
            };

            childProcess.execFile = function(file, optionsOrCb, cb) {
                if (file.endsWith('waitForMcp.sh')) {
                    optionsOrCb();
                }

                if (file.endsWith('decryptConfValue')) {
                    cb();
                }
            };

            fs.readFile = function(file, cb) {
                cb();
            };

            crypto.privateDecrypt = function() {
                throw new Error(message);
            };

            test.expect(1);
            cryptoUtil.decrypt(publicKeyFile, JSON.stringify(testData), options)
                .then(function() {
                    test.ok(false, 'should have thrown decrypt conf value error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testGenerateRandomBytes: {
        testBasic: function(test) {
            test.expect(1);
            cryptoUtil.generateRandomBytes(4, 'hex')
                .then(function(bytes) {
                    test.strictEqual(bytes.length, 8);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testCryptoRandomBytesError: function(test) {
            const message = 'crypto randomBytes error';
            crypto.randomBytes = function(length, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            cryptoUtil.generateRandomBytes(4, 'hex')
                .then(function() {
                    test.ok(false, 'should have thrown random bytes error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testSetLogger: function(test) {
        test.doesNotThrow(function() {
            cryptoUtil.setLogger();
        });
        test.done();
    }
};