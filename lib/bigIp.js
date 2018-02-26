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

const assert = require('assert');
const fs = require('fs');
const q = require('q');
const IControl = require('./iControl');
const util = require('./util');
const localKeyUtil = require('./localKeyUtil');
const cryptoUtil = require('./cryptoUtil');
const Logger = require('./logger');
const BigIpCluster = require('./bigIpCluster');
const BigIpGtm = require('./bigIpGtm');
const BigIpOnboard = require('./bigIpOnboard');
const ActiveError = require('./activeError');

const KEYS = require('./sharedConstants').KEYS;

/**
 * BigIp constructor
 *
 * @class
 * @classdesc
 * Provides core functionality (CRUD operations, ready, etc) and maintains
 * references to other modules in f5-cloud-libs.
 *
 * After createing a BigIp with this constructor, you must call the
 * async init() method.
 *
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to
 *                                           get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
*/
function BigIp(options) {
    const logger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;
    let dependentOptions = {};

    if (logger) {
        this.logger = logger;
        util.setLogger(logger);
        cryptoUtil.setLogger(logger);
        localKeyUtil.setLogger(logger);
        dependentOptions = { logger: this.logger };
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        util.setLoggerOptions(loggerOptions);
        cryptoUtil.setLoggerOptions(loggerOptions);
        localKeyUtil.setLoggerOptions(loggerOptions);
        dependentOptions = { loggerOptions };
    }

    // We're not ready until we have all the info we need (password from URL, for example)
    // Must call init() to set this
    this.isInitialized = false;

    this.cluster = new BigIpCluster(this, dependentOptions);
    this.gtm = new BigIpGtm(this, dependentOptions);
    this.onboard = new BigIpOnboard(this, dependentOptions);
}

/**
 * Initialize this instance w/ host user password
 *
 * @param {String}  host                        - Host to connect to.
 * @param {String}  user                        - User (with admin rights).
 * @param {String}  password                    - Password for user or URL (file, http, https) to
 *                                                location containing password.
 * @param {Object}  [options]                   - Optional parameters.
 * @param {Number}  [options.port]              - Port to connect to. Default 443.
 * @param {Boolean} [options.passwordIsUrl]     - Indicates that password is a URL for the password
 * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted (with
 *                                                the local cloud public key)
 *
 * @returns {Promise} A promise which is resolved when initialization is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.init = function init(host, user, password, options) {
    this.initOptions = options || {};
    this.initPassword = password;
    this.host = host.trim();
    this.user = user.trim();
    this.port = this.initOptions.port || 443;

    const passwordPromise =
        this.initOptions.passwordIsUrl ? util.getDataFromUrl(password) : q(password);

    return passwordPromise
        .then((readPassword) => {
            if (this.initOptions.passwordEncrypted) {
                return decryptPassword(readPassword);
            }
            return q(readPassword);
        })
        .then((actualPassword) => {
            this.password = actualPassword;
            this.icontrol = new IControl({
                host: this.host,
                port: this.port,
                user: this.user,
                password: this.password,
                basePath: '/mgmt',
                strict: false
            });
            this.isInitialized = true;
        });
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
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.list = function list(path, options, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        this.logger.debug('list', this.host, path);

        return isInitialized(this)
            .then(() => {
                return this.icontrol.list(path, options);
            })
            .then((response) => {
                this.logger.debug(response);
                return response;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Submits a create (POST) request
 *
 * @param {String}  path                           - The path to post.
 * @param {Object}  body                           - The body for the POST request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.create = function create(path, body, options, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        this.logger.debug('create', this.host, path, body);

        return isInitialized(this)
            .then(() => {
                return this.icontrol.create(path, body, options);
            })
            .then((response) => {
                this.logger.debug(response);
                return response;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Submits a modify (PATCH) request
 *
 * @param {String}  path                           - The path to patch.
 * @param {Object}  body                           - The body for the patch request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.modify = function modify(path, body, options, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        this.logger.debug('modify', this.host, path, body);

        return isInitialized(this)
            .then(() => {
                return this.icontrol.modify(path, body, options);
            })
            .then((response) => {
                this.logger.debug(response);
                return response;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Submits a replace (PUT) request
 *
 * @param {String}  path                           - The path to put.
 * @param {Object}  body                           - The body for the patch request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.replace = function replace(path, body, options, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        this.logger.debug('replace', this.host, path, body);

        return isInitialized(this)
            .then(() => {
                return this.icontrol.replace(path, body, options);
            })
            .then((response) => {
                this.logger.debug(response);
                return response;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Submits a delete (DELETE) request
 *
 * @param {String}  path                           - The path to delete.
 * @param {Object}  body                           - The body for the delete request.
 * @param {Object}  [options]                      - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.delete = function deletez(path, body, options, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        this.logger.debug('delete', this.host, path, body);

        return isInitialized(this)
            .then(() => {
                return this.icontrol.delete(path, body, options);
            })
            .then((response) => {
                this.logger.debug(response);
                return response;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Higher level interface
 */

/**
 * Determines if the BIG-IP status is either active or standby
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the status is either active or standby.
 */
BigIp.prototype.active = function active(retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const deferred = q.defer();

        this.ready()
            .then(() => {
                return this.list('/tm/cm/failover-status', undefined, util.NO_RETRY);
            })
            .then((response) => {
                const state = response.entries['https://localhost/mgmt/tm/cm/failover-status/0']
                    .nestedStats.entries.status.description;
                this.logger.debug('Current state:', state);
                if (state === 'ACTIVE' || state === 'STANDBY') {
                    deferred.resolve();
                } else {
                    deferred.reject(new ActiveError('BIG-IP not active.'));
                }
            })
            .catch((err) => {
                deferred.reject(new ActiveError(err ? err.message : ''));
            })
            .done();

        return deferred.promise;
    };

    return util.tryUntil(this, retry, func);
};

/**
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
BigIp.prototype.createFolder = function createFolder(folder, options) {
    const subPath = options ? options.subPath || '/Common' : '/Common';
    const deviceGroup = options ? options.deviceGroup || 'none' : 'none';
    const trafficGroup = options ? options.trafficGroup || 'none' : 'none';

    return this.ready()
        .then(() => {
            return this.list('/tm/sys/folder');
        })
        .then((folders) => {
            const fullPath = subPath + (subPath.endsWith('/') ? '' : '/') + folder;
            const folderExists = function (element) {
                return element.fullPath === fullPath;
            };

            if (folders.find(folderExists)) {
                return q();
            }

            const body = {
                subPath,
                name: folder,
                deviceGroup: deviceGroup || 'none',
                trafficGroup: trafficGroup || 'none'
            };

            return this.create('/tm/sys/folder', body);
        });
};

/**
 * Gets the => device info
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.deviceInfo = function deviceInfo(retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.list('/shared/identified-devices/config/device-info', undefined, util.NO_RETRY);
    };

    return util.tryUntil(this, retry, func);
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
BigIp.prototype.getPrivateKeyFilePath = function getPrivateKeyFilePath(folder, name) {
    assert.equal(typeof folder, 'string', 'folder must be a string');
    assert.equal(typeof name, 'string', 'name must be a string');

    const PRIVATE_KEY_DIR = `/config/filestore/files_d/${folder}_d/certificate_key_d/`;

    return this.ready()
        .then(() => {
            // List in descending time order, our key will be the first that matches
            // the name
            const commandBody = {
                command: 'run',
                utilCmdArgs: `-c "ls -1t ${PRIVATE_KEY_DIR}"`
            };
            return this.create('/tm/util/bash', commandBody, undefined, util.NO_RETRY);
        })
        .then((response) => {
            const KEY_FILE_PREFIX = `:${folder}:${name}.key`;
            const files = response.commandResult.split('\n');
            const ourKey = files.find((element) => {
                return element.startsWith(KEY_FILE_PREFIX);
            });
            if (!ourKey) {
                return q();
            }
            return PRIVATE_KEY_DIR + ourKey;
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
BigIp.prototype.installPrivateKey = function installPrivateKey(privateKeyFile, folder, name, options) {
    const CRYPTO_PATH = '/tm/sys/crypto/key';

    const deferred = q.defer();

    assert.equal(typeof privateKeyFile, 'string', 'privateKeyFile must be a string');
    assert.equal(typeof folder, 'string', 'folder must be a string');
    assert.equal(typeof name, 'string', 'name must be a string');

    const passphrase = options ? options.passphrase : undefined;

    const installBody = {
        command: 'install',
        name: `/${folder}/${name}`,
        fromLocalFile: privateKeyFile
    };

    if (passphrase) {
        installBody.passphrase = passphrase;
    }

    const checkForKey = function checkForKey() {
        return this.list(`${CRYPTO_PATH}/~${folder}~${name}.key`);
    };

    this.ready()
        .then(() => {
            return this.createFolder(folder, { subPath: '/' });
        })
        .then(() => {
            return this.create(CRYPTO_PATH, installBody, undefined, util.NO_RETRY);
        })
        .then(() => {
            // wait for the key to be installed
            return util.tryUntil(this, util.MEDIUM_RETRY, checkForKey);
        })
        .then(() => {
            fs.unlink(privateKeyFile, (err) => {
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
BigIp.prototype.getPrivateKeyMetadata = function getPrivateKeyMetadata(folder, name) {
    return this.ready()
        .then(() => {
            return this.list(`/tm/sys/file/ssl-key/~${folder}~${name}.key`);
        });
};

/**
 * Returns this intance's password
 *
 * @returns {Promise} A promise that is resolved with this instances password
 *                    or rejected if an error occurs
 */
BigIp.prototype.getPassword = function getPassword() {
    return q(this.password);
};

/**
 * Loads sys config
 *
 * @param {String}  [file]                         - Full path on BIG-IP of file to load. Default is
 *                                                   to load the default config.
 * @param {Object}  [options]                      - Object map of load options
 *                                                   (for example, {merge: true})
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the config has been
 *                    loaded or rejected if an error occurs.
 */
BigIp.prototype.loadConfig = function loadConfig(file, options, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.ready()
            .then(() => {
                const commandBody = {
                    command: 'load',
                    options: []
                };
                let optionBody;
                if (file) {
                    commandBody.options.push({ file });
                } else {
                    commandBody.name = 'default';
                }
                if (options) {
                    Object.keys(options).forEach((option) => {
                        optionBody = {};
                        optionBody[option] = options[option];
                        commandBody.options.push(optionBody);
                    });
                }
                return this.create('/tm/sys/config', commandBody, undefined, util.NO_RETRY);
            });
    };

    return util.tryUntil(this, retry, func);
};


/**
 * Loads sys UCS
 *
 * @param {String}  file                           - Full path on BIG-IP of file to load.
 * @param {Object}  [loadOptions]                  - Options for the load ucs task
 *                                                   (for example, {noLicense: true, resetTrust: true})
 * @param {Object}  [options]                      - Options for this command (not the load task itself)
 * @param {Boolaen} [options.initLocalKeys]        - Re-create and install local public/private key pair
 *                                                   used for password encryption
 * @param {Boolean} [options.restoreUser]          - Restore the current user after loading
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the config has been
 *                    loaded or rejected if an error occurs.
 */
BigIp.prototype.loadUcs = function loadUcs(file, loadOptions, options, retryOptions) {
    const TASK_PATH = '/tm/task/sys/ucs';
    let taskId;

    const initLocalKeys = options ? options.initLocalKeys : undefined;
    const restoreUser = options ? options.restoreUser : undefined;
    const ucsLoadOptions = loadOptions || {};
    const retry = retryOptions || util.DEFAULT_RETRY;

    const checkTask = function checkTask(taskIdToCheck) {
        const func = function () {
            const deferred = q.defer();
            this.list(`${TASK_PATH}/${taskIdToCheck}/result`, undefined, util.NO_RETRY)
                .then((response) => {
                    if (response._taskState === 'COMPLETED') { // eslint-disable-line no-underscore-dangle
                        deferred.resolve(true);
                    } else if (response._taskState === 'FAILED') { // eslint-disable-line no-underscore-dangle
                        deferred.resolve(false);
                    } else {
                        deferred.reject();
                    }
                })
                .catch(() => {
                    // if this throws, assume it is because restjavad has been restarted
                    // and we are done for now - just need to wait for bigIp.ready
                    deferred.resolve(true);
                });

            return deferred.promise;
        };

        return util.tryUntil(this, retry, func);
    }.bind(this);

    const restorePlainTextPasswordFromUrl = function restorePlainTextPasswordFromUrl() {
        const deferred = q.defer();

        util.getDataFromUrl(this.initPassword)
            .then((password) => {
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
            })
            .then(() => {
                deferred.resolve();
            })
            .catch((err) => {
                return deferred.reject(err);
            });

        return deferred.promise;
    }.bind(this);

    const restoreEncryptedPassword = function restoreEncryptedPassword() {
        const deferred = q.defer();

        cryptoUtil.encrypt(KEYS.LOCAL_PUBLIC_KEY_PATH, this.password)
            .then((encryptedPassword) => {
                return util.writeDataToUrl(encryptedPassword, this.initPassword);
            })
            .then(() => {
                deferred.resolve();
            })
            .catch((err) => {
                this.logger.info('error restoring user', err);
                deferred.reject(err);
            });

        return deferred.promise;
    }.bind(this);

    return this.ready()
        .then(() => {
            const commandBody = {
                command: 'load',
                name: file
            };
            const commandOptions = [];
            let commandOption;

            Object.keys(ucsLoadOptions).forEach((option) => {
                commandOption = {};
                commandOption[option] = ucsLoadOptions[option];
                commandOptions.push(commandOption);
            });

            if (commandOptions.length > 0) {
                commandBody.options = commandOptions;
            }

            return this.create(TASK_PATH, commandBody, undefined, util.NO_RETRY);
        })
        .then((response) => {
            taskId = response._taskId; // eslint-disable-line no-underscore-dangle
            this.logger.silly('loadUcs taskId:', taskId);
            return this.replace(
                `${TASK_PATH}/${taskId}`,
                {
                    _taskState: 'VALIDATING'
                },
                undefined,
                util.NO_RETRY
            );
        })
        .then(() => {
            return checkTask(taskId);
        })
        .then((status) => {
            if (status !== true) {
                return q.reject(new Error('load UCS task failed'));
            }
            return this.ready();
        })
        .then(() => {
            this.logger.silly('bigip ready');

            if (initLocalKeys) {
                this.logger.silly('Generating local key pair');
                return localKeyUtil.generateAndInstallKeyPair(
                    KEYS.LOCAL_PUBLIC_KEY_DIR,
                    KEYS.LOCAL_PUBLIC_KEY_PATH,
                    KEYS.LOCAL_PRIVATE_KEY_FOLDER,
                    KEYS.LOCAL_PRIVATE_KEY,
                    {
                        force: true
                    }
                );
            }
            return q();
        })
        .then(() => {
            let promise;

            if (this.initOptions.passwordIsUrl && !this.initOptions.passwordEncrypted) {
                // Our password may have changed due to the UCS load. If we
                // were given a password-url, we can get the new password
                this.logger.silly('restoring plain text password file');
                promise = restorePlainTextPasswordFromUrl();
            } else if (this.initOptions.passwordIsUrl &&
                       this.initOptions.passwordEncrypted &&
                       options.initLocalKeys) {
                // Otherwise, we can restore the old password (which we were called with) via tmsh
                this.logger.silly('restoring encrypted password');
                promise = restoreEncryptedPassword();
            }
            return promise;
        })
        .then(() => {
            if (restoreUser) {
                return util.runTmshCommand(`modify auth user ${this.user} password ${this.password}`);
            }
            return q();
        });
};

/**
 * Pings a given address once
 *
 * @param {String}  address                        - IP address or hostname to ping.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved if the ping succeeds
 *                    or rejected if an error occurs.
 */
BigIp.prototype.ping = function ping(address, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    if (!address) {
        return q.reject(new Error('Address is required for ping.'));
    }

    const func = function () {
        return this.ready()
            .then(() => {
                const pingCommand = {
                    command: 'run',
                    utilCmdArgs: `${address} -c 1`
                };
                return this.create('/tm/util/ping', pingCommand, undefined, util.NO_RETRY);
            })
            .then((response) => {
                if (!response) {
                    this.logger.debug('No response from ping');
                    return q.reject();
                }

                const receivedRegex = new RegExp(/transmitted, (\d+) received/);
                const receivedCheck = receivedRegex.exec(response.commandResult);
                let packetsReceived;

                if (receivedCheck && receivedCheck.length > 0) {
                    packetsReceived = receivedCheck[1];
                    this.logger.verbose('Ping received', packetsReceived, 'packet(s).');
                    if (packetsReceived > 0) {
                        return true;
                    }
                    return q.reject();
                }
                return q.reject();
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Resolves when BIG-IP is ready.
 *
 * BIG-IP is determined to be ready when the nodejs echo-js worker
 * is ready.
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A Promise which is resolved when BIG-IP is ready
 *                    or rejected after trying a fixed number of times.
 */
BigIp.prototype.ready = function ready(retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const promises = [];

        const availabilityChecks = [
            '/shared/echo-js/available',
            '/shared/identified-devices/config/device-info/available',
            '/tm/sys/available',
            '/tm/cm/available'
        ];

        const mcpCheck = function () {
            const deferred = q.defer();

            this.list('/tm/sys/mcp-state/', undefined, util.NO_RETRY)
                .then((response) => {
                    const entries = response.entries;
                    let allRunning = true;
                    Object.keys(entries).forEach((entry) => {
                        if (entries[entry].nestedStats.entries.phase.description !== 'running') {
                            allRunning = false;
                        }
                    });

                    if (allRunning) {
                        deferred.resolve();
                    } else {
                        deferred.reject(new Error('MCP not ready yet.'));
                    }
                })
                .catch((err) => {
                    deferred.reject(err);
                })
                .done();

            return deferred.promise;
        };

        availabilityChecks.forEach((availabilityCheck) => {
            promises.push({
                promise: this.list,
                arguments: [availabilityCheck, undefined, util.NO_RETRY]
            });
        });

        promises.push({
            promise: mcpCheck
        });

        return isInitialized(this)
            .then(() => {
                return util.callInSerial(this, promises);
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Reboots the BIG-IP
 */
BigIp.prototype.reboot = function reboot() {
    return this.create('/tm/sys', { command: 'reboot' }, undefined, util.NO_RETRY);
};

/**
 * Checks to see if the BIG-IP needs to be rebooted
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with 'true' if reboot is
 * required and resolved with 'false' otherwise.
 */
BigIp.prototype.rebootRequired = function rebootRequired(retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const deferred = q.defer();

        this.ready()
            .then(() => {
                return this.list('/tm/sys/db/provision.action', undefined, util.NO_RETRY);
            })
            .then((response) => {
                if (response.value) {
                    deferred.resolve(response.value === 'reboot');
                } else {
                    deferred.reject(new Error('no value in response'));
                }
            })
            .catch((err) => {
                deferred.reject(err);
            })
            .done();

        return deferred.promise;
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Saves sys config
 *
 * @param {String}  [file]                         - File to save to. Default is bigip.conf
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIp.prototype.save = function save(file, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.ready()
            .then(() => {
                const commandBody = {
                    command: 'save'
                };

                if (file) {
                    commandBody.options = [{ file }];
                }

                return this.create('/tm/sys/config', commandBody, undefined, util.NO_RETRY);
            });
    };

    return util.tryUntil(this, retry, func);
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
BigIp.prototype.transaction = function transaction(commands) {
    const TRANSACTION_PATH = '/tm/transaction/';
    const promises = [];
    let transactionId;

    const startTransaction = function startTransaction() {
        return this.create(TRANSACTION_PATH, {}, undefined, util.NO_RETRY)
            .then((response) => {
                return response.transId;
            });
    }.bind(this);

    const commitTransaction = function commitTransaction() {
        return this.modify(
            TRANSACTION_PATH + transactionId,
            { state: 'VALIDATING' },
            undefined,
            util.NO_RETRY
        )
            .then((response) => {
                if (response.state !== 'COMPLETED') {
                    return q.reject(new Error(`Transaction state not completed (${response.state})`));
                }
                return q(response);
            });
    }.bind(this);

    const getPromise = function getPromise(method) {
        switch (method.toUpperCase()) {
        case 'LIST':
            return this.list;
        case 'CREATE':
            return this.create;
        case 'MODIFY':
            return this.modify;
        case 'DELETE':
            return this.delete;
        default:
            return q();
        }
    }.bind(this);

    if (!commands || commands.length === 0) {
        return q();
    }

    return this.ready()
        .then(() => {
            return startTransaction();
        })
        .then((transId) => {
            transactionId = transId;

            commands.forEach((command) => {
                promises.push({
                    promise: getPromise(command.method),
                    arguments: [
                        command.path,
                        command.body,
                        {
                            headers: {
                                'X-F5-REST-Coordination-Id': transactionId
                            }
                        }
                    ]
                });
            });

            return util.callInSerial(this, promises);
        })
        .then(() => {
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
function decryptPassword(password) {
    let privateKeyPath;

    // use localKeyUtil here as we may not have a user yet
    return localKeyUtil.getPrivateKeyFilePath(KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY)
        .then((response) => {
            if (!response) {
                return q.reject(new Error('No private key found'));
            }

            privateKeyPath = response;
            return localKeyUtil.getPrivateKeyMetadata(KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY);
        })
        .then((response) => {
            if (!response) {
                return q.reject(new Error('No private key metadata'));
            }

            const options = {
                passphrase: response.passphrase,
                passphraseEncrypted: !!response.passphrase
            };

            return cryptoUtil.decrypt(privateKeyPath, password, options);
        });
}

function isInitialized(bigIp) {
    if (bigIp.isInitialized) {
        return q();
    }
    return q.reject();
}

module.exports = BigIp;
