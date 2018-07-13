/**
 * Copyright 2017-2018 F5 Networks, Inc.
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
const childProcess = require('child_process');
const q = require('q');
const util = require('./util');
const cryptoUtil = require('./cryptoUtil');
const localKeyUtil = require('./localKeyUtil');
const Logger = require('./logger');

let logger = Logger.getLogger({
    logLevel: 'none',
    module
});

const KEYS = require('./sharedConstants').KEYS;

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
     * Decrypts data
     *
     * @param {String} data                   - Data to decrypt
     * @param {String} privateKeyFolder       - BIG-IP folder in which private key is installed
     * @param {String} privateKeyName         - Name of private key installed on BIG-IP
     * @param {Object} [options]              - Optional parameters
     * @param {String} [options.encryptedKey] - The encrypted symmetric key. Required if symmetric encryption
     *                                          was used.
     * @param {String | Buffer} [options.iv]  - The initialization vector that was used for
     *                                          encryption. Required if symmetric encryption was used.
     *
     * @returns {Promise} A promise which is resolved with the decrypted data or
     *                    rejected if an error occurs.
     */
    decryptData(data, privateKeyFolder, privateKeyName, options) {
        assert.ok(privateKeyFolder, 'privateKeyFolder is required');
        assert.ok(privateKeyName, 'privateKeyName is required');
        assert.ok(data, 'data is required');

        let privateKeyFile;

        return localKeyUtil.getPrivateKeyFilePath(privateKeyFolder, privateKeyName)
            .then((privateKeyFilePath) => {
                if (!privateKeyFilePath) {
                    return q.reject(new Error('No private key found'));
                }

                privateKeyFile = privateKeyFilePath;
                return localKeyUtil.getPrivateKeyMetadata(privateKeyFolder, privateKeyName);
            })
            .then((metadata) => {
                if (!metadata) {
                    return q.reject(new Error('No private key metadata'));
                }

                const decryptOptions = {
                    passphrase: metadata.passphrase,
                    passphraseEncrypted: !!metadata.passphrase
                };

                if (options && options.encryptedKey && options.iv) {
                    return cryptoUtil.symmetricDecrypt(
                        privateKeyFile,
                        options.encryptedKey,
                        options.iv,
                        data,
                        decryptOptions
                    );
                }
                return cryptoUtil.decrypt(privateKeyFile, data, decryptOptions);
            })
            .then((decryptedData) => {
                return decryptedData;
            })
            .catch((err) => {
                logger.info('Error decrypting data', err && err.message ? err.message : err);
                return q.reject(err);
            });
    },

    /**
     * Decrypts a secret, typically a password that was encrypted with our
     * local private keys.
     *
     * This is just a shortcut for {@link decryptData}
     *
     * @static
     *
     * @param {String} password - secret to decrypt
     *
     * @returns {Promise} A promise which is resolved with the decrypted
     *                    secret or rejected if an error occurs
     */
    decryptPassword(password) {
        return this.decryptData(password, KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY);
    },

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
    decryptDataFromFile(dataFile, privateKeyFolder, privateKeyName) {
        let dataToDecrypt;

        assert.ok(privateKeyFolder, 'privateKeyFolder is required');
        assert.ok(privateKeyName, 'privateKeyName is required');
        assert.ok(dataFile, 'dataFile is required');

        return util.readDataFromFile(dataFile)
            .then((data) => {
                dataToDecrypt = data.toString();
                return this.decryptData(dataToDecrypt, privateKeyFolder, privateKeyName);
            })
            .catch((err) => {
                logger.info('Error decrypting data from file', err && err.message ? err.message : err);
                return q.reject(err);
            });
    },

    /**
     * Decrypts a BIG-IP configuration value.
     *
     * Must be run on a BIG-IP.
     *
     * @param {String} value - The configuragtion value to decrypt
     *
     * @returns {Promse} A promise which is resolved with the decrypted configuration
     *                   value or rejected if an error occurs.
     */
    decryptConfValue(value) {
        const deferred = q.defer();

        childProcess.execFile(
            `${__dirname}/../scripts/decryptConfValue`,
            [value],
            (error, stdout, stderr) => {
                if (error) {
                    logger.info(
                        'Error decrypting conf value',
                        error && error.message ? error.message : error
                    );
                    deferred.reject(new Error(stderr));
                } else {
                    deferred.resolve(stdout);
                }
            }
        );

        return deferred.promise;
    },

    setLoggerOptions(loggerOptions) {
        const loggerOpts = Object.assign({}, loggerOptions);
        loggerOpts.module = module;
        logger = Logger.getLogger(loggerOpts);
    },
};
