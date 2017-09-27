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

const childProcess = require('child_process');
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

        if (typeof data !== 'string') {
            deferred.reject('data must be a string');
            return;
        }

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
     * If there is an encrypted passphrase, this only works when running on the BIG-IP on
     * which the private key was installed.
     *
     * @param {String}  privateKeyInFile              - Full path to private key
     * @param {String}  data                          - Base64 encoded version of the data to decrypt
     * @param {Object}  [options]                     - Optional arguments
     * @param {String}  [options.passphrase]          - Passphrase for private key. Default no passphrase.
     * @param {Boolean} [options.passphraseEncrypted] - If there is a passphrase, whether or not it
     *                                                  is encrypted (by MCP). Default false.
     *
     * @returns {Promise} A promise which is resolve with a string version of the decrypted
     *                    data, or rejected if an error occurs.
     */
    decrypt: function(privateKeyInFile, data, options) {
        var deferred = q.defer();

        options = options || {};

        if (typeof data !== 'string') {
            deferred.reject('data must be a string');
            return;
        }

        fs.readFile(privateKeyInFile, function(err, privateKey) {
            var decrypted;
            var passphraseDeferred;

            if (err) {
                logger.warn('Error reading private key:', err);
                deferred.reject(err);
            }
            else {
                if (options.passphrase) {
                    passphraseDeferred = q.defer();
                    if (options.passphraseEncrypted) {
                        childProcess.execFile(__dirname + '/../scripts/decryptConfValue', [options.passphrase], function(error, stdout, stderr) {
                            if (error) {
                                logger.warn('Error decrypting value:', stderr);
                                deferred.reject(error);
                            }
                            else {
                                passphraseDeferred.resolve(stdout);
                            }
                        });
                    }
                    else {
                        passphraseDeferred.resolve(options.passphrase);
                    }
                }
                else {
                    passphraseDeferred = q.defer();
                    passphraseDeferred.resolve();
                }

                passphraseDeferred.promise
                    .then(function(passphrase) {
                        try {
                            decrypted = crypto.privateDecrypt(
                                {
                                    key: privateKey,
                                    passphrase: passphrase
                                },
                                new Buffer(data, 'base64')
                            );
                            deferred.resolve(decrypted.toString());
                        }
                        catch (err) {
                            logger.warn('Error decrypting data:', err);
                            deferred.reject(err);
                        }
                    });
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
     * @param {String} [options.passphrase]       - Passphrase for private key. Default no passphrase.
     *
     * @returns {Promise} A promise which will be resolved when the data is written or rejected
     *                    if an error occurs. If options.publicKeyOutFile is not provided, promise
     *                    is resolved with the public key.
     */
    generateKeyPair: function(privateKeyOutFile, options) {
        options = options || {};

        var genrsaCmd = '/usr/bin/openssl genrsa -out ' + privateKeyOutFile;
        var deferred = q.defer();
        var rsaCmd = '/usr/bin/openssl rsa -in ' + privateKeyOutFile + ' -outform PEM -pubout';
        var genrsaChild;
        var rsaChild;
        var publicKeyData;

        if (options.passphrase) {
            genrsaCmd += ' -aes256 -passout stdin';
            rsaCmd += ' -passin stdin';
        }

        genrsaCmd += ' ' + (options.keyLength || '2048');

        if (options.publicKeyOutFile) {
            rsaCmd += ' -out ' + options.publicKeyOutFile;
        }

        genrsaChild = childProcess.exec(genrsaCmd, function(error, stdout, stderr) {
            if (error) {
                logger.warn('Error generating private key:', stderr);
                deferred.reject(error);
            }
            else {
                rsaChild = childProcess.exec(rsaCmd, function(error, stdout, stderr) {
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

                if (options.passphrase) {
                    rsaChild.stdin.write(options.passphrase + '\n');
                    rsaChild.stdin.end();
                }
            }
        });

        if (options.passphrase) {
            genrsaChild.stdin.write(options.passphrase + '\n');
            genrsaChild.stdin.end();
        }

        return deferred.promise;
    },

    /**
     * Generates random bytes of a certain length and encoding
     *
     * Note: If encoding is 'base64' and length is not a multiple of 6,
     *       the returned bytes will always end in '=' or '==', which decreases
     *       randomness.
     *
     * @param {Number} length - Number of random bytes to generate.
     * @param {String} encoding - Encoding to use ('ascii', 'base64', 'hex', etc)
     *
     * @returns {Promise} A promise which is resolved with the random bytes or
     *                    rejected if an error occurs
     */
    generateRandomBytes: function(length, encoding) {
        var deferred = q.defer();

        crypto.randomBytes(length, function(err, buf) {
            if (err) {
                logger.warn('Error generating random bytes:', err);
                deferred.reject(err);
            }
            else {
                deferred.resolve(buf.toString(encoding));
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