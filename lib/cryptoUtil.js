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

const assert = require('assert');
const child_process = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const Logger = require('./logger');

var logger = Logger.getLogger({logLevel: 'none', module: module});

/**
 * @module
 */
module.exports = {

    /**
     * Encrypts data with a public key
     *
     * @param {String} publicKeyInFile - Full path to public key
     * @param {String} data            - String version of the data to encrypt
     *
     * @returns {Promise} A promise which is resolved with a base64 encoded version
     *                    of the encrypted data, or rejected if an error occurs.
     */
    encrypt: function(publicKeyInFile, data) {
        return new Promise(function(resolve, reject) {
            assert.strictEqual(typeof data, 'string', 'data must be a string');

            fs.readFile(publicKeyInFile, function(err, publicKey) {
                var encrypted;

                if (err) {
                    logger.warn('Error reading public key:', err);
                    reject(err);
                }
                else {
                    try {
                        encrypted = crypto.publicEncrypt(publicKey, new Buffer(data));
                        resolve(encrypted.toString('base64'));
                    }
                    catch (err) {
                        logger.warn('Error encrypting data:', err);
                        reject(err);
                    }
                }
            });
        });
    },

    /**
     * Decrypts data with a private key
     *
     * @param {String} privateKeyInFile - Full path to private key
     * @param {String} data             - Base64 encoded version of the data to decrypt
     *
     * @returns {Promise} A promise which is resolve with a string version of the decrypted
     *                    data, or rejected if an error occurs.
     */
    decrypt: function(privateKeyInFile, data) {
        return new Promise(function(resolve, reject) {
            assert.strictEqual(typeof data, 'string', 'data must be a string');

            fs.readFile(privateKeyInFile, function(err, privateKey) {
                var decrypted;

                if (err) {
                    logger.warn('Error reading private key:', err);
                    reject(err);
                }
                else {
                    try {
                        decrypted = crypto.privateDecrypt(privateKey, new Buffer(data, 'base64'));
                        resolve(decrypted.toString());
                    }
                    catch (err) {
                        logger.warn('Error decrypting data:', err);
                        reject(err);
                    }
                }
            });
        });
    },

    /**
     * Generates a public/private key pair.
     * @param {String} privateKeyOutFile  - Full path where private key will be written
     * @param {String} publicKeyOutFile - Full path where public key certificate will be written
     *
     * @returns {Promise} A promise which will be resolved when the data is written or rejected
     *                    if an error occurs.
     */
    generateKeyPair: function(privateKeyOutFile, publidKeyOutFile) {
        return new Promise(function(resolve, reject) {
            var genrsaCmd = '/usr/bin/openssl genrsa -out ' + privateKeyOutFile + ' 2048';
            child_process.exec(genrsaCmd, function(error, stdout, stderr) {
                var rsaCmd = '/usr/bin/openssl rsa -in ' + privateKeyOutFile + ' -outform PEM -pubout -out ' + publidKeyOutFile;
                if (error) {
                    logger.warn('Error generating private key:', stderr);
                    reject(error);
                }
                else {
                    child_process.exec(rsaCmd, function(error, stdout, stderr) {
                        if (error) {
                            logger.warn('Error extracting public key:', stderr);
                            reject(error);
                        }
                        else {
                            resolve();
                        }
                    });
                }
            });
        });
    },

    setLogger: function(aLogger) {
        logger = aLogger;
    },

    setLoggerOptions: function(loggerOptions) {
        loggerOptions.module = module;
        logger = Logger.getLogger(loggerOptions);
    }
};