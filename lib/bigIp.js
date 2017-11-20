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
const fs = require('fs');
const childProcess = require('child_process');
const q = require('q');
const IControl = require('./iControl');
const util = require('./util');
const localKeyUtil = require('./localKeyUtil');
const cryptoUtil = require('./cryptoUtil');
const Logger = require('./logger');
const BigIpCluster = require('./bigIpCluster');
const BigIpOnboard = require('./bigIpOnboard');
const ActiveError = require('./activeError');

const KEYS = require('./sharedConstants').KEYS;

/**
 * Creates the BIG-IP client
 * @class
 * @classdesc
 * Provides core functionality (CRUD operations, ready, etc) and maintains
 * references to other modules in f5-cloud-libs.
 *
 * After createing a BigIp with this constructor, you must call the
 * async init() method.
 *
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
*/
function BigIp(options) {

    var dependentOptions = {};

    options = options || {};

    if (options.logger) {
        this.logger = options.logger;
        util.setLogger(options.logger);
        cryptoUtil.setLogger(options.logger);
        localKeyUtil.setLogger(options.logger);
        dependentOptions = {logger: this.logger};
    }
    else {
        options.loggerOptions = options.loggerOptions || {logLevel: 'none'};
        options.loggerOptions.module = module;
        this.logger = Logger.getLogger(options.loggerOptions);
        util.setLoggerOptions(options.loggerOptions);
        cryptoUtil.setLoggerOptions(options.loggerOptions);
        localKeyUtil.setLoggerOptions(options.loggerOptions);
        dependentOptions = {loggerOptions: options.loggerOptions};
    }

    // We're not ready until we have all the info we need (password from URL, for example)
    // Must call init() to set this
    this.isInitialized = false;

    this.cluster = new BigIpCluster(this, dependentOptions);
    this.onboard = new BigIpOnboard(this, dependentOptions);
}

/**
 * Initialize this instance w/ host user password
 *
 * @param {String}  host                        - Host to connect to.
 * @param {String}  user                        - User (with admin rights).
 * @param {String}  password                    - Password for user or URL (file, http, https) to location containing password.
 * @param {Object}  [options]                   - Optional parameters.
 * @param {Number}  [options.port]              - Port to connect to. Default 443.
 * @param {Boolean} [options.passwordIsUrl]     - Indicates that password is a URL for the password
 * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted (with the local cloud public key)
 *
 * @returns {Promise} A promise which is resolved when initialization is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.init = function(host, user, password, options) {
    var passwordPromise;

    this.initOptions = options || {};
    this.initPassword = password;
    this.host = host.trim();
    this.user = user.trim();
    this.port = this.initOptions.port || 443;

    passwordPromise = this.initOptions.passwordIsUrl ? util.getDataFromUrl(password) : q(password);
    return passwordPromise
        .then(function(password) {
            if (this.initOptions.passwordEncrypted) {
                return decryptPassword(password);
            }
            else {
                return q(password);
            }
        }.bind(this))
        .then(function(password) {
            this.password = password;
            this.icontrol = new IControl({
                host: this.host,
                port: this.port,
                user: this.user,
                password: this.password,
                basePath: '/mgmt',
                strict: false
            });
            this.isInitialized = true;
        }.bind(this));
};

/**
 * Low-level interface
 */

/**
 * Submits a list (GET) request
 *
 * @param {String}  path                           - The path to get.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.list = function (path, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("list", this.host, path);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.list(path, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a create (POST) request
 *
 * @param {String}  path                           - The path to post.
 * @param {Object}  body                           - The body for the POST request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.create = function(path, body, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("create", this.host, path, body);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.create(path, body, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a modify (PATCH) request
 *
 * @param {String}  path                           - The path to patch.
 * @param {Object}  body                           - The body for the patch request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.modify = function(path, body, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("modify", this.host, path, body);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.modify(path, body, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a replace (PUT) request
 *
 * @param {String}  path                           - The path to put.
 * @param {Object}  body                           - The body for the patch request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.replace = function(path, body, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("replace", this.host, path, body);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.replace(path, body, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits a delete (DELETE) request
 *
 * @param {String}  path                           - The path to delete.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.delete = function(path, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        this.logger.debug("delete", this.host, path);

        return isInitialized(this)
            .then(function() {
                return this.icontrol.delete(path, options);
            }.bind(this))
            .then(function(response) {
                this.logger.debug(response);
                return response;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Higher level interface
 */

/**
 * Determines if the BIG-IP status is either active or standby
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the status is either active or standby.
 */
BigIp.prototype.active = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var deferred = q.defer();

        this.ready()
            .then(function() {
                return this.list('/tm/cm/failover-status', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var state = response.entries["https://localhost/mgmt/tm/cm/failover-status/0"].nestedStats.entries.status.description;
                this.logger.debug("Current state:", state);
                if (state === 'ACTIVE' || state === 'STANDBY') {
                    deferred.resolve();
                }
                else {
                    deferred.reject(new ActiveError("BIG-IP not active."));
                }
            }.bind(this))
            .catch(function(err) {
                deferred.reject(new ActiveError(err ? err.message : ''));
            })
            .done();

        return deferred.promise;
    };

    return util.tryUntil(this, retryOptions, func);
};

/*
 * Creates a folder if it does not exists
 *
 * @param {String} folder                 - Name of folder
 * @param {Object} [options]              - Optional parameters
 * @param {String} [options.subPath]      - The folder subPath. Use '/' for top level folders.
 *                                          Default '/Common'
 * @param {String} [options.deviceGroup]  - Device group for folder. Default 'none'
 * @param {String} [options.trafficGroup] - Traffic group for folder. Default 'none'
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.createFolder = function(folder, options) {

    options = options || {};
    options.subPath = options.subPath || '/Common';

    return this.ready()
        .then(function() {
            return this.list('/tm/sys/folder');
        }.bind(this))
        .then(function(folders) {
            var fullPath = options.subPath + (options.subPath.endsWith('/') ? '' : '/') + folder;
            var folderExists = function(element) {
                return element.fullPath === fullPath;
            };

            if (folders.find(folderExists)) {
                return q();
            }
            else {
                var body = {
                    name: folder,
                    subPath: options.subPath,
                    deviceGroup: options.deviceGroup || 'none',
                    trafficGroup: options.trafficGroup || 'none'
                };

                return this.create('/tm/sys/folder', body);
            }
        }.bind(this));
};

/**
 * Gets the device info
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.deviceInfo = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.list('/shared/identified-devices/config/device-info', undefined, util.NO_RETRY);
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Gets the path to the latest private key
 *
 * @param {String} folder - Folder in which to search for the key
 * @param {String} name   - Name of the key
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.getPrivateKeyFilePath = function(folder, name) {

    const PRIVATE_KEY_DIR = '/config/filestore/files_d/' + folder + '_d/certificate_key_d/';

    assert.equal(typeof folder, 'string', 'folder must be a string');
    assert.equal(typeof name, 'string', 'name must be a string');

    return this.ready()
        .then(function() {
            // List in descending time order, our key will be the first that matches
            // the name
            var commandBody = {
                "command": "run",
                "utilCmdArgs": "-c 'ls -1t " + PRIVATE_KEY_DIR + "'"
            };
            return this.create('/tm/util/bash', commandBody, undefined, util.NO_RETRY);
        }.bind(this))
        .then(function(response) {
            const KEY_FILE_PREFIX = ':' + folder + ':' + name + '.key';
            var files = response.commandResult.split('\n');
            var ourKey = files.find(function(element) {
                return element.startsWith(KEY_FILE_PREFIX);
            });
            if (ourKey) {
                return PRIVATE_KEY_DIR + ourKey;
            }
        });
};

/**
 * Installs a private key and then deletes the original private key file.
 *
 * @param {String} privateKeyFile       - Full path to private key file. This file
 *                                        must be on the BIG-IP disk and will be deleted
 *                                        upon successful installation to MCP
 * @param {String} folder               - Folder in which to put key
 * @param {String} name                 - Name for key
 * @param {Object} [options]            - Optional parameters
 * @param {String} [options.passphrase] - Optional passphrase for key
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.installPrivateKey = function(privateKeyFile, folder, name, options) {
    const CRYPTO_PATH = '/tm/sys/crypto/key';

    var deferred = q.defer();

    assert.equal(typeof privateKeyFile, 'string', 'privateKeyFile must be a string');
    assert.equal(typeof folder, 'string', 'folder must be a string');
    assert.equal(typeof name, 'string', 'name must be a string');

    options = options || {};

    var installBody = {
        command: 'install',
        name: '/' + folder + '/' + name,
        fromLocalFile: privateKeyFile
    };

    if (options.passphrase) {
        installBody.passphrase = options.passphrase;
    }

    var checkForKey = function() {
        return this.list(CRYPTO_PATH + '/~' + folder + '~' + name + '.key');
    };

    this.ready()
        .then(function() {
            return this.createFolder(folder, {subPath: '/'});
        }.bind(this))
        .then(function() {
            return this.create(CRYPTO_PATH, installBody, undefined, util.NO_RETRY);
        }.bind(this))
        .then(function() {
            // wait for the key to be installed
            return util.tryUntil(this, util.MEDIUM_RETRY, checkForKey);
        }.bind(this))
        .then(function() {
            fs.unlink(privateKeyFile, function(err) {
                if (err) {
                    this.logger.debug('Failed to delete private key:', err);
                }

                deferred.resolve();
            });
        });

    return deferred.promise;
};

/**
 * Get the metadata for the cloud libs private key
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.getPrivateKeyMetadata = function(folder, name) {
    return this.ready()
        .then(function() {
            return this.list('/tm/sys/file/ssl-key/~' + folder + '~' + name + '.key');
        }.bind(this));
};

/**
 * Returns this intance's password
 *
 * @returns {Promise} A promise that is resolved with this instances password
 *                    or rejected if an error occurs
 */
BigIp.prototype.getPassword = function() {
    return q(this.password);
};

/**
 * Loads sys config
 *
 * @param {String}  [file]                         - Full path on BIG-IP of file to load. Default is to load the default config.
 * @param {Object}  [options]                      - Object map of load options (for example, {merge: true})
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the config has been
 *                    loaded or rejected if an error occurs.
 */
BigIp.prototype.loadConfig = function(file, options, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.ready()
            .then(function() {
                var commandBody = {
                    command: "load",
                    options: []
                };
                var option;
                var optionBody;
                if (file) {
                    commandBody.options.push({file: file});
                }
                else {
                    commandBody.name = 'default';
                }
                if (options) {
                    for (option in options) {
                        if (options.hasOwnProperty(option)) {
                            optionBody = {};
                            optionBody[option] = options[option];
                            commandBody.options.push(optionBody);
                        }
                    }
                }
                return this.create('/tm/sys/config', commandBody, undefined, util.NO_RETRY);
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};


/**
 * Loads sys UCS
 *
 * @param {String}  file                           - Full path on BIG-IP of file to load.
 * @param {Object}  [loadOptions]                  - Options for the load ucs task (for example, {noLicense: true, resetTrust: true})
 * @param {Object}  [options]                      - Options for this command (not the load task itself)
 * @param {Boolaen} [options.initLocalKeys]        - Re-create and install local public/private key pair used for password encryption
 * @param {Boolean} [options.restoreUser]          - Restore the current user after loading
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the config has been
 *                    loaded or rejected if an error occurs.
 */
BigIp.prototype.loadUcs = function(file, loadOptions, options, retryOptions) {
    var taskId;

    const TASK_PATH = '/tm/task/sys/ucs';

    options = options || {};
    loadOptions = loadOptions || {};
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var checkTask = function(taskId) {
        var func = function() {
            var deferred = q.defer();
            this.list(TASK_PATH + '/' + taskId + '/result', undefined, util.NO_RETRY)
                .then(function(response) {
                    if (response._taskState === 'COMPLETED') {
                        deferred.resolve(true);
                    }
                    else if (response._taskState === 'FAILED') {
                        deferred.resolve(false);
                    }
                    else {
                        deferred.reject();
                    }
                })
                .catch(function() {
                    // if this throws, assume it is because restjavad has been restarted
                    // and we are done for now - just need to wait for bigIp.ready
                    deferred.resolve(true);
                });

            return deferred.promise;
        };

        return util.tryUntil(this, retryOptions, func);
    }.bind(this);

    var restorePlainTextPasswordFromUrl = function() {
        var deferred = q.defer();

        util.getDataFromUrl(this.initPassword)
            .then(function(password) {
                this.password = password;
                this.icontrol = new IControl({
                    host: this.host,
                    port: this.port,
                    user: this.user,
                    password: this.password,
                    basePath: '/mgmt',
                    strict: false
                });
                this.isInitialized = true;
                return this.ready();
            }.bind(this))
            .then(function() {
                deferred.resolve();
            })
            .catch(function(err) {
                return deferred.reject(err);
            });

        return deferred.promise;
    };

    var restoreEncryptedPassword = function() {
        var deferred = q.defer();

        cryptoUtil.encrypt(KEYS.LOCAL_PUBLIC_KEY_PATH, this.password)
            .then(function(encryptedPassword) {
                return util.writeDataToUrl(encryptedPassword, this.initPassword);
            }.bind(this))
            .then(function() {
                deferred.resolve();
            }.bind(this))
            .catch(function(err) {
                this.logger.info('error restoring user', err);
                deferred.reject(err);
            }.bind(this));

        return deferred.promise;
    };

    return this.ready()
        .then(function() {
            var commandBody = {
                command: "load",
                name: file
            };
            var commandOptions = [];
            var commandOption;
            var option;

            for (option in loadOptions) {
                commandOption = {};
                commandOption[option] = loadOptions[option];
                commandOptions.push(commandOption);
            }

            if (commandOptions.length > 0) {
                commandBody.options = commandOptions;
            }

            return this.create(TASK_PATH, commandBody, undefined, util.NO_RETRY);
        }.bind(this))
        .then(function(response) {
            taskId = response._taskId;
            this.logger.silly('loadUcs taskId:', taskId);
            return this.replace(
                TASK_PATH + '/' + taskId,
                {
                    _taskState: "VALIDATING"
                },
                undefined,
                util.NO_RETRY
            );
        }.bind(this))
        .then(function() {
            return checkTask(taskId);
        }.bind(this))
        .then(function(status) {
            var deferred;

            if (status === true) {
                this.logger.silly('checkTask done. wait for mcp.');
                deferred = q.defer();
                childProcess.execFile(__dirname + '/../scripts/waitForMcp.sh', function(error) {
                    if (error) {
                        this.logger.debug('MCP not ready:', error);
                        return q.reject(error);
                    }
                    else {
                        this.logger.silly('MCP ready.');
                        deferred.resolve();
                    }
                }.bind(this));

                return deferred.promise;
            }
            else {
                return q.reject(new Error('load UCS task failed'));
            }
        }.bind(this))
        .then(function() {
            this.logger.silly('done waiting');
            if (options.initLocalKeys) {
                this.logger.silly('Generating local key pair');
                return localKeyUtil.generateAndInstallKeyPair(KEYS.LOCAL_PUBLIC_KEY_DIR, KEYS.LOCAL_PUBLIC_KEY_PATH, KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY);
            }
        }.bind(this))
        .then(function() {
            // Our password may have changed due to the UCS load. If we
            // were given a password-url, we can get the new password
            if (this.initOptions.passwordIsUrl && !this.initOptions.passwordEncrypted) {
                this.logger.silly('restoring plain text password file');
                return restorePlainTextPasswordFromUrl.call(this);
            }

            // Otherwise, we can restore the old password (which we were called with) via tmsh
            else if (this.initOptions.passwordIsUrl && this.initOptions.passwordEncrypted && options.initLocalKeys) {
                this.logger.silly('restoring encrypted password');
                return restoreEncryptedPassword.call(this);
            }
        }.bind(this))
        .then(function() {
            if (options.restoreUser) {
                return util.runTmshCommand('modify auth user ' + this.user + ' password ' + this.password);
            }
        }.bind(this));
};

/**
 * Pings a given address once
 *
 * @param {String}  address                        - IP address or hostname to ping.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved if the ping succeeds
 *                    or rejected if an error occurs.
 */
BigIp.prototype.ping = function(address, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    if (!address) {
        return q.reject(new Error('Address is required for ping.'));
    }

    var func = function() {
        return this.ready()
            .then(function() {
                var pingCommand = {
                    command: 'run',
                    utilCmdArgs: address + ' -c 1'
                };
                return this.create('/tm/util/ping', pingCommand, undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                if (!response) {
                    this.logger.debug('No response from ping');
                    return q.reject();
                }

                var receivedRegex = new RegExp(/transmitted, (\d+) received/);
                var receivedCheck = receivedRegex.exec(response.commandResult);
                var packetsReceived;

                if (receivedCheck && receivedCheck.length > 0) {
                    packetsReceived = receivedCheck[1];
                    this.logger.verbose("Ping received", packetsReceived, "packet(s).");
                    if (packetsReceived > 0) {
                        return true;
                    }
                    else {
                        return q.reject();
                    }
                }
                else {
                    return q.reject();
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Resolves when BIG-IP is ready.
 *
 * BIG-IP is determined to be ready when the nodejs echo-js worker
 * is ready.
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A Promise which is resolved when BIG-IP is ready
 *                    or rejected after trying a fixed number of times.
 */
BigIp.prototype.ready = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var promises = [];

        var availabilityChecks = [
            '/shared/echo-js/available',
            '/shared/identified-devices/config/device-info/available',
            '/tm/sys/available',
            '/tm/cm/available'
        ];

        var mcpCheck = function() {
            var deferred = q.defer();

            this.list('/tm/sys/mcp-state/', undefined, util.NO_RETRY)
                .then(function(response) {
                    var entries = response.entries;
                    var allRunning = true;
                    var entry;
                    for (entry in entries) {
                        if (entries.hasOwnProperty(entry)) {
                            if (entries[entry].nestedStats.entries.phase.description !== 'running') {
                                allRunning = false;
                            }
                        }
                    }

                    if (allRunning) {
                        deferred.resolve();
                    }
                    else {
                        deferred.reject(new Error('MCP not ready yet.'));
                    }
                })
                .catch(function(err) {
                    deferred.reject(err);
                })
                .done();

            return deferred.promise;
        }.bind(this);

        var i;

        for (i = 0; i < availabilityChecks.length; ++i) {
            promises.push(
                {
                    promise: this.list,
                    arguments: [availabilityChecks[i], undefined, util.NO_RETRY]
                }
            );
        }

        promises.push(
            {
                promise: mcpCheck
            }
        );

        return isInitialized(this)
            .then(function() {
                return util.callInSerial(this, promises);
            }.bind(this));

    }.bind(this);

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Reboots the BIG-IP
 */
BigIp.prototype.reboot = function() {
    return this.create('/tm/sys', {command: "reboot"}, undefined, util.NO_RETRY);
};

/**
 * Checks to see if the BIG-IP needs to be rebooted
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with 'true' if reboot is
 * required and resolved with 'false' otherwise.
 */
BigIp.prototype.rebootRequired = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var deferred = q.defer();

        this.ready()
            .then(function() {
                this.list('/tm/sys/db/provision.action', undefined, util.NO_RETRY)
                    .then(function(response) {
                        if (response.value) {
                            deferred.resolve(response.value === 'reboot');
                        }
                        else {
                            deferred.reject(new Error('no value in response'));
                        }
                    })
                    .catch(function(err) {
                        deferred.reject(err);
                    })
                    .done();
            }.bind(this));

        return deferred.promise;
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Saves sys config
 *
 * @param {String}  [file]                         - File to save to. Default is bigip.conf
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIp.prototype.save = function(file, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.ready()
            .then(function() {
                var commandBody = {
                    command: "save"
                };

                if (file) {
                    commandBody.options = [
                        {
                            file: file
                        }
                    ];
                }

                return this.create('/tm/sys/config', commandBody, undefined, util.NO_RETRY);
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Submits commands in a transaction
 *
 * @param {Object[]} commands - Array of command definitions. Each command should be:
 *                              {
 *                                  method: 'list' | 'create' | 'modify' | 'delete',
 *                                  path: path for command,
 *                                  body: optional body for command
 *                              }
 * @returns {Promise} A promise which is resolved when the transaction is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.transaction = function(commands) {
    var TRANSACTION_PATH = '/tm/transaction/';
    var transactionId;
    var promises = [];
    var i;

    var startTransaction = function() {
        return this.create(TRANSACTION_PATH, {}, undefined, util.NO_RETRY)
            .then(function(response) {
                return response.transId;
            });
    }.bind(this);

    var commitTransaction = function() {
        return this.modify(TRANSACTION_PATH + transactionId, { "state":"VALIDATING" }, undefined, util.NO_RETRY)
            .then(function(response) {
                if (response.state !== 'COMPLETED') {
                    return q.reject(new Error('Transaction state not completed (' + response.state + ')'));
                }
                return q(response);
            });
    }.bind(this);

    var getPromise = function(method) {
        switch(method.toUpperCase()) {
            case 'LIST':
                return this.list;
            case 'CREATE':
                return this.create;
            case 'MODIFY':
                return this.modify;
            case 'DELETE':
                return this.delete;
        }
    }.bind(this);

    commands = commands || [];
    if (commands.length === 0) {
        return q();
    }

    return this.ready()
        .then(function() {
            return startTransaction();
        }.bind(this))
        .then(function(transId) {
            transactionId = transId;

            for (i = 0; i < commands.length; ++i) {
                promises.push(
                    {
                        promise: getPromise(commands[i].method),
                        arguments: [
                            commands[i].path,
                            commands[i].body,
                            {
                                headers: {
                                    'X-F5-REST-Coordination-Id': transactionId
                                }
                            }
                        ]
                    }
                );
            }

            return util.callInSerial(this, promises);
        }.bind(this))
        .then(function() {
            return commitTransaction();
        });
};

/**
 * Decrypts the password
 *
 * @static
 *
 * @param {String} password - password to decrypt
 *
 * @returns {Promise} A promise which is resolved with the decrypted
 *                    password or rejected if an error occurs
 */
var decryptPassword = function(password) {
    var privateKeyPath;

    // use localKeyUtil here as we may not have a user yet
    return localKeyUtil.getPrivateKeyFilePath(KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY)
        .then(function(response) {
            if (!response) {
                return q.reject(new Error('No private key found'));
            }
            else {
                privateKeyPath = response;
                return localKeyUtil.getPrivateKeyMetadata(KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY);
            }
        })
        .then(function(response) {
            var options;

            if (!response) {
                return q.reject(new Error('No private key metadata'));
            }

            else {
                options = {
                    passphrase: response.passphrase,
                    passphraseEncrypted: (response.passphrase ? true : false)
                };

                return cryptoUtil.decrypt(privateKeyPath, password, options);
            }
        });
};

var isInitialized = function(bigIp) {
    if (bigIp.isInitialized) {
        return q();
    }
    return q.reject();
};

module.exports = BigIp;
