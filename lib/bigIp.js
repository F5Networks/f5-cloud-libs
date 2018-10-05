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
const authn = require('./authn');
const localKeyUtil = require('./localKeyUtil');
const cryptoUtil = require('./cryptoUtil');
const Logger = require('./logger');
const BigIpCluster = require('./bigIpCluster');
const BigIpGtm = require('./bigIpGtm');
const BigIpOnboard = require('./bigIpOnboard');
const ActiveError = require('./activeError');

const bigIqOnboardMixins = require('./bigIqOnboardMixins');
const bigIqClusterMixins = require('./bigIqClusterMixins');

const KEYS = require('./sharedConstants').KEYS;

const UCS_TASK_PATH = '/tm/task/sys/ucs';

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
        authn.setLogger(logger);
        dependentOptions = { logger: this.logger };
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        util.setLoggerOptions(loggerOptions);
        cryptoUtil.setLoggerOptions(loggerOptions);
        localKeyUtil.setLoggerOptions(loggerOptions);
        authn.setLoggerOptions(loggerOptions);
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
 * @param {String}  [options.product]           - The product we are running on (BIG-IP | BIG-IQ). Default
 *                                                is to determine the product programmatically.
 * @param {Boolean} [options.setUserPassword]   - Whether the user password should be reset to the
 *                                                specified password
 *
 * @returns {Promise} A promise which is resolved when initialization is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.init = function init(host, user, password, options) {
    this.initOptions = {};
    Object.assign(this.initOptions, options);

    this.initPassword = password;
    this.host = host.trim();
    this.user = user.trim();
    this.port = this.initOptions.port || 443;

    const authnOptions = {
        port: this.port,
        passwordIsUri: this.initOptions.passwordIsUrl,
        passwordEncrypted: this.initOptions.passwordEncrypted,
        setUserPassword: this.initOptions.setUserPassword || false
    };

    // Are we a BIG-IP or BIG-IQ?
    let productPromise;
    if (this.initOptions.product || this.product) {
        productPromise = q.resolve(this.initOptions.product || this.product);
    } else {
        productPromise = util.getProduct();
    }

    return productPromise
        .then((response) => {
            this.product = response;
            this.logger.info('This is a', this.product);
            if (this.isBigIq()) {
                Object.assign(BigIpOnboard.prototype, bigIqOnboardMixins);
                Object.assign(BigIpCluster.prototype, bigIqClusterMixins);
            }
            authnOptions.product = this.product;
            return authn.authenticate(this.host, this.user, password, authnOptions);
        })
        .then((icontrol) => {
            this.icontrol = icontrol;
            this.password = this.icontrol.password;
            this.isInitialized = true;

            this.logger.info('Waiting for device to be ready.');
            return this.ready();
        })
        .catch((err) => {
            this.logger.info('Device initialization failed', err && err.message ? err.message : err);
            return q.reject(err);
        });
};

/**
 * Low-level interface
 */

/**
 * Submits a list (GET) request
 *
 * @param {String}  path                           - The path to get.
 * @param {Object}  [iControlOptions]              - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Object}  [options]                      - Options for this method.
 * @param {Boolen}  [options.silent]               - Do not log any info (for requests/repsonses that
 *                                                   may contain sensitive information).
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.list = function list(path, iControlOptions, retryOptions, options) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    const methodOptions = {};
    Object.assign(methodOptions, options);

    const func = function () {
        if (!methodOptions.silent) {
            this.logger.debug('list', this.host, path);
        }

        return isInitialized(this)
            .then(() => {
                return this.icontrol.list(path, iControlOptions);
            })
            .then((response) => {
                if (!methodOptions.silent) {
                    this.logger.debug(response);
                }
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
 * @param {Object}  [iControlOptions]              - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Object}  [options]                      - Options for this method.
 * @param {Boolen}  [options.silent]               - Do not log any info (for requests/repsonses that
 *                                                   may contain sensitive information).
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.create = function create(path, body, iControlOptions, retryOptions, options) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    const methodOptions = {};
    Object.assign(methodOptions, options);

    const func = function () {
        if (!methodOptions.silent) {
            this.logger.debug('create', this.host, path, body);
        }

        return isInitialized(this)
            .then(() => {
                return this.icontrol.create(path, body, iControlOptions);
            })
            .then((response) => {
                if (!methodOptions.silent) {
                    this.logger.debug(response);
                }
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
 * @param {Object}  [iControlOptions]              - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Object}  [options]                      - Options for this method.
 * @param {Boolen}  [options.silent]               - Do not log any info (for requests/repsonses that
 *                                                   may contain sensitive information).
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.modify = function modify(path, body, iControlOptions, retryOptions, options) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    const methodOptions = {};
    Object.assign(methodOptions, options);

    const func = function () {
        if (!methodOptions.silent) {
            this.logger.debug('modify', this.host, path, body);
        }

        return isInitialized(this)
            .then(() => {
                return this.icontrol.modify(path, body, iControlOptions);
            })
            .then((response) => {
                if (!methodOptions.silent) {
                    this.logger.debug(response);
                }
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
 * @param {Object}  [iControlOptions]              - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Object}  [options]                      - Options for this method.
 * @param {Boolen}  [options.silent]               - Do not log any info (for requests/repsonses that
 *                                                   may contain sensitive information).
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.replace = function replace(path, body, iControlOptions, retryOptions, options) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    const methodOptions = {};
    Object.assign(methodOptions, options);

    const func = function () {
        if (!methodOptions.silent) {
            this.logger.debug('replace', this.host, path, body);
        }

        return isInitialized(this)
            .then(() => {
                return this.icontrol.replace(path, body, iControlOptions);
            })
            .then((response) => {
                if (!methodOptions.silent) {
                    this.logger.debug(response);
                }
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
 * @param {Object}  [iControlOptions]              - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Object}  [options]                      - Options for this method.
 * @param {Boolen}  [options.silent]               - Do not log any info (for requests/repsonses that
 *                                                   may contain sensitive information).
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.delete = function deletez(path, body, iControlOptions, retryOptions, options) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    const methodOptions = {};
    Object.assign(methodOptions, options);

    const func = function () {
        if (!methodOptions.silent) {
            this.logger.debug('delete', this.host, path, body);
        }

        return isInitialized(this)
            .then(() => {
                return this.icontrol.delete(path, body, iControlOptions);
            })
            .then((response) => {
                if (!methodOptions.silent) {
                    this.logger.debug(response);
                }
                return response;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Creates or modifies an object
 *
 * @param {String}  path                           - The path to patch.
 * @param {Object}  body                           - The body for the patch request.
 * @param {String}  body.name                      - The name used to determine if the object exists.
 * @param {Object}  [iControlOptions]              - Options for IControl.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 * @param {Object}  [options]                      - Options for this method.
 * @param {Boolen}  [options.silent]               - Do not log any info (for requests/repsonses that
 *                                                   may contain sensitive information).
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.createOrModify = function createOrModify(path, body, iControlOptions, retryOptions, options) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    const methodOptions = {};
    Object.assign(methodOptions, options);
    let finalPath = path;
    let partitionPath;
    if (body.partition) {
        partitionPath = `~${body.partition}~`;
    } else {
        partitionPath = '~Common~';
    }

    assert.equal(typeof body.name, 'string', 'body.name is required');

    const func = function () {
        return isInitialized(this)
            .then(() => {
                const deferred = q.defer();

                this.icontrol.list(`${path}/${partitionPath}${body.name}`)
                    .then(() => {
                        finalPath = `${path}/${partitionPath}${body.name}`;
                        if (!methodOptions.silent) {
                            this.logger.silly(`${finalPath} exists, modifying`);
                            this.logger.debug('modify', this.host, finalPath, body);
                        }
                        deferred.resolve('modify');
                    })
                    .catch((err) => {
                        if (err.code === 404) {
                            if (!methodOptions.silent) {
                                this.logger.silly(
                                    `${path}/${partitionPath}${body.name} does not exist, creating`
                                );
                                this.logger.debug('create', this.host, finalPath, body);
                            }
                            deferred.resolve('create');
                        } else {
                            deferred.reject(err);
                        }
                    });
                return deferred.promise;
            })
            .then((method) => {
                return this.icontrol[method](finalPath, body, iControlOptions);
            })
            .then((response) => {
                if (!methodOptions.silent) {
                    this.logger.debug(response);
                }
                return response;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Higher level interface
 */

/**
 * Determines if the device status is either active or standby
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the status is either active or standby.
 */
BigIp.prototype.active = function active(retryOptions) {
    const retry = {};
    Object.assign(retry, retryOptions || util.DEFAULT_RETRY);

    // While waiting for active, we may get errors but we want to keep trying
    retry.continueOnError = true;

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
                    deferred.reject(new ActiveError('Device not active.'));
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
            const KEY_FILE_PREFIX = `:${folder}:${name}`;
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

    const checkForKey = function checkForKey(keySuffix) {
        return this.list(`${CRYPTO_PATH}/~${folder}~${name}${keySuffix}`);
    };

    this.ready()
        .then(() => {
            return this.createFolder(folder, { subPath: '/' });
        })
        .then(() => {
            return this.create(CRYPTO_PATH, installBody, undefined, util.NO_RETRY);
        })
        .then(() => {
            return getPrivateKeySuffix(this);
        })
        .then((keySuffix) => {
            // wait for the key to be installed
            return util.tryUntil(this, util.MEDIUM_RETRY, checkForKey, [keySuffix]);
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
            return getPrivateKeySuffix(this);
        })
        .then((keySuffix) => {
            return this.list(`/tm/sys/file/ssl-key/~${folder}~${name}${keySuffix}`);
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
 * Returns whether or not the device is a BIG-IP
 *
 * @returns {Boolean} Whether or not this device is a BIG-IP
 */
BigIp.prototype.isBigIp = function isBigIp() {
    return this.product === 'BIG-IP';
};

/**
 * Returns whether or not the device is a BIG-IQ
 *
 * @returns {Boolean} Whether or not this device is a BIG-IQ
 */
BigIp.prototype.isBigIq = function isBigIq() {
    return this.product === 'BIG-IQ';
};

/**
 * Loads sys config
 *
 * @param {String}  [file]                         - Full path on device of file to load. Default is
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
 * @param {String}  file                           - Full path on device of file to load.
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
BigIp.prototype.loadUcs = function loadUcs(file, loadOptions, options) {
    const initLocalKeys = options ? options.initLocalKeys : undefined;
    const restoreUser = options ? options.restoreUser : undefined;
    const ucsLoadOptions = loadOptions || {};

    const restorePlainTextPasswordFromUrl = function restorePlainTextPasswordFromUrl() {
        const deferred = q.defer();

        util.getDataFromUrl(this.initPassword)
            .then((password) => {
                this.password = password.trim();
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

    this.logger.silly('loadUcs: calling ready before runLoadUcs');
    return this.ready()
        .then(() => {
            this.logger.silly('loadUcs: calling runLoadUcs');
            return runLoadUcs.call(this, file, ucsLoadOptions);
        })
        .then(() => {
            this.logger.silly('loadUcs: runLoadUcs success');
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
        })
        .catch((err) => {
            this.logger.info('loadUcs failed', err);
            return q.reject(err);
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
 * Resolves when device is ready.
 *
 * Device is determined to be ready when the nodejs echo-js worker
 * is ready.
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A Promise which is resolved when device is ready
 *                    or rejected after trying a fixed number of times.
 */
BigIp.prototype.ready = function ready(retryOptions) {
    const retry = {};
    Object.assign(retry, retryOptions || util.DEFAULT_RETRY);

    // While waiting for ready, we may get errors but we want to keep trying
    retry.continueOnError = true;

    const func = function () {
        const promises = [];

        const availabilityChecks = [
            '/shared/echo/available',
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
 * Reboots the device
 */
BigIp.prototype.reboot = function reboot() {
    return this.create('/tm/sys', { command: 'reboot' }, undefined, util.NO_RETRY);
};

/**
 * Checks to see if the device needs to be rebooted
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

BigIp.prototype.runTask = function runTask(taskPath, taskConfig) {
    let taskId;

    return this.ready()
        .then(() => {
            return this.create(taskPath, taskConfig, undefined, util.NO_RETRY);
        })
        .then((response) => {
            taskId = response._taskId; // eslint-disable-line no-underscore-dangle
            this.logger.silly('taskId:', taskId);
            return this.replace(
                `${taskPath}/${taskId}`,
                {
                    _taskState: 'VALIDATING'
                },
                undefined,
                util.NO_RETRY
            );
        })
        .then(() => {
            return checkTask.call(this, taskPath, taskId);
        })
        .then((status) => {
            if (status !== true) {
                return q.reject(new Error(`task at ${taskPath} failed`));
            }
            return q();
        })
        .catch((err) => {
            return q.reject(err);
        });
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
 * Save a ucs file in /var/local/ucs
 *
 * @param {String} file - Base name of ucs file
 *
 * @returns {Promise} - A promise which is resolve when the ucs is saved
 *                      or rejected if an error occurs
 */
BigIp.prototype.saveUcs = function saveUcs(file) {
    return this.ready()
        .then(() => {
            const commandBody = {
                command: 'save',
                name: file
            };

            return this.runTask(UCS_TASK_PATH, commandBody);
        })
        .then(() => {
            // the UCS file can take a while to show up...
            const fullPath = `/var/local/ucs/${file}.ucs`;
            const checkFile = function () {
                const deferred = q.defer();
                fs.access(fullPath, (err) => {
                    if (err) {
                        deferred.reject();
                    } else {
                        deferred.resolve();
                    }
                });
                return deferred.promise;
            };

            return util.tryUntil(
                this,
                {
                    maxRetries: 60,
                    retryIntervalMs: 2000
                },
                checkFile
            );
        })
        .catch((err) => {
            this.logger.info('saveUcs failed', err);
            return q.reject(err);
        });
};

/**
 * Sets the management ip port
 *
 * @param {Number} port - port to use for management IP
 *
 * @returns {Promise} A promise which is resolved when the operation is complete
 *                    or rejected if an error occurs.
 */
BigIp.prototype.setPort = function setPort(port) {
    this.port = port;
    this.icontrol.port = port;

    return q();
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
 * Checks status of iControl REST task
 *
 * @param {String} taskPath - URL that created the task
 * @param {String} taskIdToCheck - ID of task as returned by create
 *
 * @returns {Promise} A promise which is resolved with true if the task completes
 *                    successfully, resolved with false if task goes to error state
 *                    or rejected if some other error occurs.
 */
function checkTask(taskPath, taskIdToCheck) {
    const func = function () {
        const deferred = q.defer();
        this.list(`${taskPath}/${taskIdToCheck}/result`, undefined, util.NO_RETRY)
            .then((response) => {
                const taskState = response._taskState; // eslint-disable-line no-underscore-dangle
                if (taskState === 'VALIDATING') {
                    // this is a normal state, just not done yet - keep waiting
                    deferred.reject();
                } else if (taskState === 'COMPLETED') {
                    deferred.resolve(true);
                } else if (taskState === 'FAILED') {
                    deferred.resolve(false);
                } else {
                    deferred.reject(new Error(`checkTask: unexpected command status: ${taskState}`));
                }
            })
            .catch(() => {
                // if this throws, assume it is because restjavad has been restarted
                // and we are done for now
                deferred.resolve(true);
            });

        return deferred.promise;
    };

    return util.tryUntil(this, util.DEFAULT_RETRY, func);
}

// Prior to 14.0, private keys end in '.key'. On 14.0 and up, they do not
function getPrivateKeySuffix(bigIp) {
    return bigIp.deviceInfo()
        .then((deviceInfo) => {
            if (util.versionCompare(deviceInfo.version, '14.0.0') < 0) {
                return '.key';
            }
            return '';
        });
}

function isInitialized(bigIp) {
    if (bigIp.isInitialized) {
        return q();
    }
    return q.reject();
}

function restoreMasterKey(ucsFile) {
    const logId = 'restoreMasterKey:';
    const tempUcsDir = '/config/tempUcs';

    this.logger.silly(logId, 'calling bigstart stop');
    return util.runShellCommand('bigstart stop')
        .then(() => {
            this.logger.silly(logId, 'bigstart stopped');
            const deferred = q.defer();
            fs.mkdir(tempUcsDir, (err) => {
                if (err) {
                    this.logger.debug(
                        logId,
                        'error making temp ucs dir',
                        err && err.message ? err.message : err
                    );
                    deferred.reject(err);
                } else {
                    this.logger.silly(logId, 'mkdir succeeded');
                    deferred.resolve();
                }
            });
            return deferred.promise;
        })
        .then(() => {
            this.logger.silly(logId, 'untarring ucs', ucsFile);
            return util.runShellCommand(`tar --warning=no-timestamp -xf ${ucsFile} -C ${tempUcsDir}`);
        })
        .then(() => {
            this.logger.silly(logId, 'untar success, reading key');
            return util.readDataFromFile(`${tempUcsDir}/config/bigip/kstore/master`);
        })
        .then((oldMasterKey) => {
            this.logger.silly(logId, 'read success, writing key');
            return util.writeDataToFile(oldMasterKey, '/config/bigip/kstore/master');
        })
        .then(() => {
            this.logger.silly(logId, 'wrote master key, reading unit key');
            return util.readDataFromFile(`${tempUcsDir}/config/bigip/kstore/.unitkey`);
        })
        .then((oldUnitKey) => {
            this.logger.silly(logId, 'read unitkey success, writing unit key');
            return util.writeDataToFile(oldUnitKey, '/config/bigip/kstore/.unitkey');
        })
        .then(() => {
            this.logger.silly(logId, 'cleaning up');
            return util.runShellCommand(`rm -rf ${tempUcsDir}`);
        })
        .then(() => {
            this.logger.silly(logId, 'calling bigstart restart');
            return util.runShellCommand('bigstart start');
        })
        .catch((err) => {
            this.logger.debug('error restoring master key', err && err.message ? err.message : err);
            return q.reject(err);
        });
}

function runLoadUcs(file, ucsLoadOptions) {
    const deferred = q.defer();

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

    this.logger.silly('runLoadUcs: calling runTask');
    this.runTask(UCS_TASK_PATH, commandBody)
        .then(() => {
            this.logger.silly('runLoadUcs: runTask success');
            return this.ready(util.LONG_RETRY);
        })
        .then(() => {
            this.logger.silly('runLoadUcs: bigIp ready');
            deferred.resolve();
        })
        .catch((err) => {
            // load may have failed because of encrypted private keys
            // workaround this issue
            this.logger.debug(
                'Initial load of UCS failed',
                err && err.message ? err.message : err,
                'trying to work around'
            );
            restoreMasterKey.call(this, file)
                .then(() => {
                    this.logger.silly('master key restored, waiting for ready');
                    return this.ready();
                })
                .then(() => {
                    this.logger.silly('big ip ready after master key restore');
                    deferred.resolve();
                })
                .catch((copyErr) => {
                    deferred.reject(copyErr);
                });
        });

    return deferred.promise;
}

module.exports = BigIp;
