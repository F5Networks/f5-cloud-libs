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

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const q = require('q');

const Logger = require('./logger');

let logger = Logger.getLogger({
    logLevel: 'none',
    module
});

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
    encrypt: function encrypt(publicKeyDataOrFile, data) {
        const deferred = q.defer();
        let publicKeyPromise;

        const getPublicKey = function getPublicKey(publicKeyFile) {
            const publicKeyDeferred = q.defer();
            fs.readFile(publicKeyFile, (err, publicKey) => {
                if (err) {
                    logger.warn('Error reading public key:', err);
                    publicKeyDeferred.reject(err);
                } else {
                    publicKeyDeferred.resolve(publicKey);
                }
            });

            return publicKeyDeferred.promise;
        };

        if (typeof data !== 'string') {
            deferred.reject(new Error('data must be a string'));
            return deferred.promise;
        }

        if (publicKeyDataOrFile.startsWith('-----BEGIN PUBLIC KEY-----')) {
            publicKeyPromise = q(publicKeyDataOrFile);
        } else {
            publicKeyPromise = getPublicKey(publicKeyDataOrFile);
        }

        publicKeyPromise
            .then((publicKey) => {
                let encrypted;

                try {
                    encrypted = crypto.publicEncrypt(publicKey, Buffer.from(data));
                    deferred.resolve(encrypted.toString('base64'));
                } catch (err) {
                    logger.warn('Error encrypting data:', err);
                    deferred.reject(err);
                }
            })
            .catch((err) => {
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
    decrypt(privateKeyInFile, data, options) {
        const deferred = q.defer();

        const passphrase = options ? options.passphrase : undefined;
        const passphraseEncrypted = options ? options.passphraseEncrypted : false;

        if (typeof data !== 'string') {
            deferred.reject(new Error('data must be a string'));
            return deferred.promise;
        }

        fs.readFile(privateKeyInFile, (readFileErr, privateKey) => {
            let decrypted;
            let passphraseDeferred;

            if (readFileErr) {
                logger.warn('Error reading private key:', readFileErr);
                deferred.reject(readFileErr);
            } else {
                if (passphrase) {
                    passphraseDeferred = q.defer();
                    if (passphraseEncrypted) {
                        ready()
                            .then(() => {
                                childProcess.execFile(
                                    `${__dirname}/../scripts/decryptConfValue`,
                                    [passphrase],
                                    (error, stdout, stderr) => {
                                        if (error) {
                                            logger.warn('Error decrypting value:', stderr);
                                            deferred.reject(error);
                                        } else {
                                            passphraseDeferred.resolve(stdout);
                                        }
                                    }
                                );
                            })
                            .catch((err) => {
                                deferred.reject(err);
                            });
                    } else {
                        passphraseDeferred.resolve(passphrase);
                    }
                } else {
                    passphraseDeferred = q.defer();
                    passphraseDeferred.resolve();
                }

                passphraseDeferred.promise
                    .then((decryptedPassphrase) => {
                        try {
                            decrypted = crypto.privateDecrypt(
                                {
                                    key: privateKey,
                                    passphrase: decryptedPassphrase
                                },
                                Buffer.from(data, 'base64')
                            );
                            deferred.resolve(decrypted.toString());
                        } catch (err) {
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
     *                                              Default is to resolve with the public key.
     * @param {String} [options.passphrase]       - Passphrase for private key. Default no passphrase.
     *
     * @returns {Promise} A promise which will be resolved when the data is written or rejected
     *                    if an error occurs. If options.publicKeyOutFile is not provided, promise
     *                    is resolved with the public key.
     */
    generateKeyPair(privateKeyOutFile, options) {
        const passphrase = options ? options.passphrase : undefined;
        const keyLength = options ? options.keyLength : undefined;
        const publicKeyOutFile = options ? options.publicKeyOutFile : undefined;

        const deferred = q.defer();
        let genrsaCmd = `/usr/bin/openssl genrsa -out ${privateKeyOutFile}`;
        let rsaCmd = `/usr/bin/openssl rsa -in ${privateKeyOutFile} -outform PEM -pubout`;
        let rsaChild;
        let publicKeyData;

        if (passphrase) {
            genrsaCmd += ' -aes256 -passout stdin';
            rsaCmd += ' -passin stdin';
        }

        genrsaCmd += ` ${keyLength || '2048'}`;

        if (publicKeyOutFile) {
            rsaCmd += ` -out ${publicKeyOutFile}`;
        }

        const genrsaChild = childProcess.exec(genrsaCmd, (genRsaError, genrsaStdout, genrsaStderr) => {
            if (genRsaError) {
                logger.warn('Error generating private key:', genrsaStderr);
                deferred.reject(genRsaError);
            } else {
                rsaChild = childProcess.exec(rsaCmd, (rsaError, rsaStdout, rsaStderr) => {
                    if (rsaError) {
                        logger.warn('Error extracting public key:', rsaStderr);
                        deferred.reject(rsaError);
                    } else {
                        if (!publicKeyOutFile) {
                            publicKeyData = rsaStdout;
                        }
                        deferred.resolve(publicKeyData);
                    }
                });

                if (passphrase) {
                    rsaChild.stdin.write(`${passphrase}\n`);
                    rsaChild.stdin.end();
                }
            }
        });

        if (passphrase) {
            genrsaChild.stdin.write(`${passphrase}\n`);
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
    generateRandomBytes(length, encoding) {
        const deferred = q.defer();

        crypto.randomBytes(length, (err, buf) => {
            if (err) {
                logger.warn('Error generating random bytes:', err);
                deferred.reject(err);
            } else {
                deferred.resolve(buf.toString(encoding));
            }
        });

        return deferred.promise;
    },

    setLogger(aLogger) {
        logger = aLogger;
    },

    setLoggerOptions(loggerOptions) {
        const loggerOpts = Object.assign({}, loggerOptions);
        loggerOpts.module = module;
        logger = Logger.getLogger(loggerOpts);
    }
};

function ready() {
    const deferred = q.defer();

    childProcess.execFile(`${__dirname}/../scripts/waitForMcp.sh`, (error) => {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve();
        }
    });

    return deferred.promise;
}
