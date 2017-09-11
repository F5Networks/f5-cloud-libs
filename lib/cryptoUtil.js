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
var q = require('q');

const Logger = require('./logger');

var logger = Logger.getLogger({logLevel: 'none', module: module});

/**
 * @module
 */
module.exports = {

    /**
     * Encrypts data with a public key
     *
     * @param {String} publicKeyDataOrFile - Either the public key, or the full path to
     *                                       a file containing the public key
     * @param {String} data                - String version of the data to encrypt
     *
     * @returns {Promise} A promise which is resolved with a base64 encoded version
     *                    of the encrypted data, or rejected if an error occurs.
     */
    encrypt: function(publicKeyDataOrFile, data) {
        var deferred = q.defer();
        var publicKeyPromise;

        var getPublicKey = function(publicKeyFile) {
            var deferred = q.defer();
            fs.readFile(publicKeyFile, function(err, publicKey) {
                if (err) {
                    logger.warn('Error reading public key:', err);
                    deferred.reject(err);
                }
                else {
                    deferred.resolve(publicKey);
                }
            });

            return deferred.promise;
        };

        assert.strictEqual(typeof data, 'string', 'data must be a string');

        if (publicKeyDataOrFile.startsWith('-----BEGIN PUBLIC KEY-----')) {
            publicKeyPromise = q(publicKeyDataOrFile);
        }
        else {
            publicKeyPromise = getPublicKey(publicKeyDataOrFile);
        }

        publicKeyPromise.
            then(function(publicKey) {
                var encrypted;

                try {
                    encrypted = crypto.publicEncrypt(publicKey, new Buffer(data));
                    deferred.resolve(encrypted.toString('base64'));
                }
                catch (err) {
                    logger.warn('Error encrypting data:', err);
                    deferred.reject(err);
                }
            })
            .catch(function(err) {
                logger.warn('Unable to get public key:', err);
                deferred.reject(err);
            });

        return deferred.promise;
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
        var deferred = q.defer();

        assert.strictEqual(typeof data, 'string', 'data must be a string');

        fs.readFile(privateKeyInFile, function(err, privateKey) {
            var decrypted;

            if (err) {
                logger.warn('Error reading private key:', err);
                deferred.reject(err);
            }
            else {
                try {
                    decrypted = crypto.privateDecrypt(privateKey, new Buffer(data, 'base64'));
                    deferred.resolve(decrypted.toString());
                }
                catch (err) {
                    logger.warn('Error decrypting data:', err);
                    deferred.reject(err);
                }
            }
        });

        return deferred.promise;
    },

    /**
     * Generates a public/private key pair.
     *
     * @param {String} privateKeyOutFile          - Full path where private key will be written
     * @param {Object} [options]                  - Optional arguments
     * @param {String} [options.keyLength]        - Key length. Default is 2048.
     * @param {String} [options.publicKeyOutFile] - Full path where public key certificate will be written.
     *                                              If not provided, this function resolves with the public key.
     *
     * @returns {Promise} A promise which will be resolved when the data is written or rejected
     *                    if an error occurs. If options.publicKeyOutFile is not provided, promise
     *                    is resolved with the public key.
     */
    generateKeyPair: function(privateKeyOutFile, options) {
        options = options || {};

        const genrsaCmd = '/usr/bin/openssl genrsa -out ' + privateKeyOutFile + ' ' + (options.keyLength || '2048');
        var deferred = q.defer();
        var rsaCmd = '/usr/bin/openssl rsa -in ' + privateKeyOutFile + ' -outform PEM -pubout';
        var publicKeyData;

        if (options.publicKeyOutFile) {
            rsaCmd += ' -out ' + options.publicKeyOutFile;
        }

        child_process.exec(genrsaCmd, function(error, stdout, stderr) {
            if (error) {
                logger.warn('Error generating private key:', stderr);
                deferred.reject(error);
            }
            else {
                child_process.exec(rsaCmd, function(error, stdout, stderr) {
                    if (error) {
                        logger.warn('Error extracting public key:', stderr);
                        deferred.reject(error);
                    }
                    else {
                        if (!options.publicKeyOutFile) {
                            publicKeyData = stdout;
                        }
                        deferred.resolve(publicKeyData);
                    }
                });
            }
        });

        return deferred.promise;
    },

    setLogger: function(aLogger) {
        logger = aLogger;
    },

    setLoggerOptions: function(loggerOptions) {
        loggerOptions.module = module;
        logger = Logger.getLogger(loggerOptions);
    }
};