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

const q = require('q');

var localKeyUtilMock;
var cryptoUtilMock;
var utilMock;
var localCryptoUtil;

var dataSent;
var optionsSent;
var dataToDecrypt;
var decryptedData;

module.exports = {
    setUp: function(callback) {
        utilMock = require('../../lib/util');
        localKeyUtilMock = require('../../lib/localKeyUtil');
        cryptoUtilMock = require('../../lib/cryptoUtil');

        localCryptoUtil = require('../../lib/localCryptoUtil');

        localKeyUtilMock.getPrivateKeyFilePath = function() {
            return q('/foo/bar');
        };

        localKeyUtilMock.getPrivateKeyMetadata = function() {
            return q({});
        };

        utilMock.readDataFromFile = function() {
            return q(dataToDecrypt);
        };

        cryptoUtilMock.decrypt = function(privateKey, data, options) {
            dataSent = data;
            optionsSent = options;
            return q(decryptedData);
        };

        callback();
    },

    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });

        callback();
    },

    testDecryptDataFromFile: {
        testNoFile: function(test) {
            test.expect(1);
            test.throws(function() {
                localCryptoUtil.decryptDataFromFile(null, 'foo', 'bar');
            });
            test.done();
        },

        testNoPrivateKeyFolder: function(test) {
            test.expect(1);
            test.throws(function() {
                localCryptoUtil.decryptDataFromFile('/foo/bar', null, 'bar');
            });
            test.done();
        },

        testNoPrivateKeyName: function(test) {
            test.expect(1);
            test.throws(function() {
                localCryptoUtil.decryptDataFromFile('/foo/bar', 'bar');
            });
            test.done();
        },

        testBasic: function(test) {
            dataToDecrypt = "abcd";
            decryptedData = "hello, world";

            test.expect(2);
            localCryptoUtil.decryptDataFromFile('/foo/bar', 'foo', 'bar')
                .then(function(response) {
                    test.strictEqual(dataSent, dataToDecrypt);
                    test.strictEqual(response, decryptedData);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoPassphrase: function(test) {
            test.expect(2);
            localCryptoUtil.decryptDataFromFile('/foo/bar/', 'foo', 'bar')
                .then(function() {
                    test.strictEqual(optionsSent.passphrase, undefined);
                    test.strictEqual(optionsSent.passphraseEncrypted, false);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPassphrase: function(test) {
            var passphrase = 'mypassphrase';

            localKeyUtilMock.getPrivateKeyMetadata = function() {
                return q({passphrase: passphrase});
            };

            test.expect(2);
            localCryptoUtil.decryptDataFromFile('/foo/bar/', 'foo', 'bar')
                .then(function() {
                    test.strictEqual(optionsSent.passphrase, passphrase);
                    test.strictEqual(optionsSent.passphraseEncrypted, true);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};