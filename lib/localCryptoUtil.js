/**
 * Copyright 2017 F5 Networks, Inc.
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

const assert = require('assert');
const util = require('./util');
const cryptoUtil = require('./cryptoUtil');
const localKeyUtil = require('./localKeyUtil');

/**
 * This routines are utilities for decrypting data from files on disk
 *
 * These routines are meant to be used locally on a BIG-IP and operate via tmsh
 * rather than iControl REST. This is so that we do not need to take in
 * unencrypted passwords as parameters either on the command line or via
 * the filesystem.
 *
 * Notes:
 *    + Only runs locally on a BIG-IP. Cannot run on a remote BIG-IP.
 *    + Uses tmsh rather than iControl REST so that we do not need to take in a password
 *
 * @module
 */
module.exports = {
    /**
     * Decrypts data from a file on disk
     *
     * @param {String} dataFile - File to decrypt
     * @param {String} privateKeyFolder - BIG-IP folder in which private key is installed
     * @param {String} privateKeyName - Name of private key installed on BIG-IP
     *
     * @returns {Promise} A promise which is resolved with the decrypted data or
     *                    rejected if an error occurs.
     */
    decryptDataFromFile: function(dataFile, privateKeyFolder, privateKeyName) {
        var dataToDecrypt;
        var privateKeyFile;

        assert.ok(privateKeyFolder, 'privateKeyFolder is required');
        assert.ok(privateKeyName, 'privateKeyName is required');
        assert.ok(dataFile, 'dataFile is required');

        return util.readDataFromFile(dataFile)
            .then(function(data) {
                dataToDecrypt = data.toString();
                return localKeyUtil.getPrivateKeyFilePath(privateKeyFolder, privateKeyName);
            })
            .then(function(privateKeyFilePath) {
                privateKeyFile = privateKeyFilePath;
                return localKeyUtil.getPrivateKeyMetadata(privateKeyFolder, privateKeyName);
            })
            .then(function(metadata) {
                var options = {
                    passphrase: metadata.passphrase,
                    passphraseEncrypted: (metadata.passphrase ? true : false)
                };
                return cryptoUtil.decrypt(privateKeyFile, dataToDecrypt, options);
            })
            .then(function(data) {
                return data;
            });
    }
};