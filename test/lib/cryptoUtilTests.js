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

const now = Date.now();
const publicKeyFile = '/tmp/public_' + now + '.pem';
const privateKeyFile = '/tmp/private_' + now + '.pem';

const cryptoUtil = require('../../../f5-cloud-libs').cryptoUtil;

module.exports = {
    tearDown: function(callback) {
        try {
            fs.unlinkSync(publicKeyFile);
            fs.unlinkSync(privateKeyFile);
        }
        catch (err) {
        }
        callback();
    },

    testRoundTripPublicKeyInFile: function(test) {
        var testData = {
            foo: 'bar',
            hello: 'world',
            a: {
                x: 1,
                y: 2
            }
        };

        var options = {
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

    testRoundTripPublicKeyInFilePassphrase: function(test) {
        var testData = {
            foo: 'bar',
            hello: 'world',
            a: {
                x: 1,
                y: 2
            }
        };

        var options = {
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

    testRoundTripPublicKeyInData: function(test) {
        var testData = {
            foo: 'bar',
            hello: 'world',
            a: {
                x: 1,
                y: 2
            }
        };

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
    },

    testGenerateRandomBytes: function(test) {
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
    }
};