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
const fs = require('fs');
const childProcess = require('child_process');
const q = require('q');
const cryptoUtil = require('../lib/cryptoUtil');
const util = require('../lib/util');

var Logger = require('./logger');
var logger = Logger.getLogger({logLevel: 'none', module: module});

/**
 * This routines are utilities for setting up public/private keys.
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
     * Generates and installs a public/private key pair if not already installed
     *
     * @param {String} publicKeyDirctory - Directory into which to write the public key
     * @param {String} publicKeyOutFile  - Filename for publick key
     * @param {String} privateKeyFolder  - BIG-IP folder into which to install the private key
     * @param {String} privateKeyName    - Name for private key on BIG-IP
     *
     * @returns {Promise} A promise which is resolved when the operation is complete
     *                    or rejected if an error occurs.
     */
    generateAndInstallKeyPair: function(publicKeyDirectory, publicKeyOutFile, privateKeyFolder, privateKeyName) {
        const PASSPHRASE_LENGTH = 18;
        const PRIVATE_KEY_TEMP_FILE = '/tmp/cloudLibsPrivate' + Date.now() + '.pem';

        var passphrase;

        assert.equal(typeof publicKeyDirectory, 'string', 'publicKeyDirectory must be a string');
        assert.equal(typeof publicKeyOutFile, 'string', 'publicKeyOutFile must be a string');
        assert.equal(typeof privateKeyFolder, 'string', 'privateKeyFolder must be a string');
        assert.equal(typeof privateKeyName, 'string', 'privateKeyName must be a string');

        // Check to see if we have a key pair yet
        return privateKeyExists(privateKeyFolder, privateKeyName)
            .then(function(hasPrivateKey) {
                if (hasPrivateKey) {
                    logger.debug('private key already exists');
                    return q();
                }
                else {
                    logger.debug('No private key found - generating key pair');
                    return createDirectory(publicKeyDirectory)
                        .then(function() {
                            return cryptoUtil.generateRandomBytes(PASSPHRASE_LENGTH, 'base64');
                        })
                        .then(function(response) {
                            passphrase = response;
                            return cryptoUtil.generateKeyPair(
                                PRIVATE_KEY_TEMP_FILE,
                                {
                                    publicKeyOutFile: publicKeyOutFile,
                                    passphrase: passphrase,
                                    keyLength: '3072'
                                });
                        })
                        .then(function() {
                            return installPrivateKey(PRIVATE_KEY_TEMP_FILE, privateKeyFolder, privateKeyName, {passphrase: passphrase});
                        })
                        .then(function() {
                            return util.runTmshCommand('save sys config');
                        });
                }
            });
    },

    getPrivateKeyFilePath: function(folder, name) {

        const PRIVATE_KEY_DIR = '/config/filestore/files_d/' + folder + '_d/certificate_key_d/';

        assert.equal(typeof folder, 'string', 'folder must be a string');
        assert.equal(typeof name, 'string', 'name must be a string');

        return util.runShellCommand('ls -1t ' + PRIVATE_KEY_DIR)
            .then(function(response) {
                const KEY_FILE_PREFIX = ':' + folder + ':' + name + '.key';
                var files = response.split('\n');
                var ourKey = files.find(function(element) {
                    return element.startsWith(KEY_FILE_PREFIX);
                });
                if (ourKey) {
                    return PRIVATE_KEY_DIR + ourKey;
                }
            });
    },

    /**
     * Gets the local private key
     *
     * @returns {Promise} A promise which is resolved with the key metadata or
     *                    rejected if an error occurs
     */
    getPrivateKeyMetadata: function(folder, name) {

        assert.equal(typeof folder, 'string', 'folder must be a string');
        assert.equal(typeof name, 'string', 'name must be a string');

        return util.runTmshCommand('list sys file ssl-key /' + folder + '/' + name + '.key')
            .then(function(response) {
                var keyVals = response.split(/\s+/);
                var result = {};
                var openingBraceIndex;
                var closingBraceIndex;
                var i;

                // find the parts inside the {}
                openingBraceIndex = keyVals.indexOf('{');
                closingBraceIndex = keyVals.lastIndexOf('}');

                for (i = openingBraceIndex + 1; i < closingBraceIndex - 1; i += 2) {
                    result[keyVals[i]] = keyVals[i + 1];
                }

                return result;
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

var installPrivateKey = function(privateKeyFile, folder, name, options) {
    var deferred = q.defer();
    var installCmd;

    options = options || {};

    installCmd = 'install sys crypto key ' + '/' + folder + '/' + name + ' from-local-file ' + privateKeyFile;
    if (options.passphrase) {
        installCmd += ' passphrase ' + options.passphrase;
    }

    ready()
        .then(function() {
            return createBigIpFolder('/' + folder);
        }.bind(this))
        .then(function() {
            return util.runTmshCommand(installCmd);
        }.bind(this))
        .then(function() {
            fs.unlink(privateKeyFile, function(err) {
                if (err) {
                    logger.debug('Failed to delete private key:', err);
                }

                deferred.resolve();
            });
        })
        .catch(function(err) {
            deferred.reject(err);
        });

    return deferred.promise;
};

var ready = function() {
    var deferred = q.defer();

    childProcess.execFile(__dirname + '/../scripts/waitForMcp.sh', function(error) {
        if (error) {
            deferred.reject(error);
        }
        else {
            deferred.resolve();
        }
    });

    return deferred.promise;
};

var createDirectory = function(directory) {
    var deferred = q.defer();

    fs.access(directory, function(err) {
        if (err) {
            fs.mkdir(directory, function(err) {
                if (err) {
                    deferred.reject(err);
                }
                else {
                    deferred.resolve();
                }
            });
        }
        else {
            deferred.resolve();
        }
    });

    return deferred.promise;
};

var createBigIpFolder = function(folder) {
    return folderExists(folder)
        .then(function(exists) {
            if (exists) {
                return q();
            }
            else {
                return util.runTmshCommand('create sys folder ' + folder + ' device-group none traffic-group none');
            }
        }.bind(this));
};

var folderExists = function(folder) {
    // tmsh returns an error if trying to list a non-existent folder
    return util.runTmshCommand('list sys folder ' + folder)
        .then(function() {
            return q(true);
        })
        .catch(function() {
            return q(false);
        });
};

var privateKeyExists = function(folder, name) {
    return util.runTmshCommand('list sys crypto key /' + folder + '/' + name + '.key')
        .then(function(response) {
            if (response) {
                return q(true);
            }
            else {
                return q(false);
            }
        });
};
