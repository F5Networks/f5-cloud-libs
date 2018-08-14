/**
 * Copyright 2018 F5 Networks, Inc.
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

const q = require('q');
const IControl = require('./iControl');
const util = require('./util');
const cloudProviderFactory = require('./cloudProviderFactory');
const localCryptoUtil = require('./localCryptoUtil');
const Logger = require('./logger');
const PRODUCTS = require('./sharedConstants').PRODUCTS;

let logger = Logger.getLogger({
    logLevel: 'none',
    module
});

/**
 * @module
 */
module.exports = {
    /**
     * Implements token auth
     *
     * @param {String}  host                        - Host to connect to.
     * @param {String}  user                        - User (with admin rights).
     * @param {String}  passwordOrUri               - Password for user or URL (file, http, https) to
     *                                                location containing password.
     * @param {Object}  [options]                   - Optional parameters.
     * @param {String}  [options.product]           - Prouct we are running on. See
     *                                                {@link module:sharedConstants}. Default is to determine
     *                                                the product.
     * @param {Number}  [options.port]              - Port to connect to. Default 443.
     * @param {Boolean} [options.passwordIsUri]     - Indicates that password is a URI for the password
     * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted
     * @param {Object}  [options.clOptions]         - Command line options if called from a script.
     * @param {Object}  [options.logger]            - Logger to use. Or, pass loggerOptions to
     *                                                get your own logger.
     * @param {Object}  [options.loggerOptions]     - Options for the logger.
     *                                                See {@link module:logger.getLogger} for details.
     *
     * @returns {Promise} A promise which is resolved with an {@link iControl} object to use
     *                    for future requests or rejected if an error occurs.
     */
    authenticate(host, user, passwordOrUri, options) {
        const optionalArgs = {};
        let password;

        Object.assign(optionalArgs, options);

        return readData.call(
            this,
            passwordOrUri,
            optionalArgs.passwordIsUri,
            {
                clOptions: optionalArgs.clOptions,
                logger: optionalArgs.logger,
                loggerOptions: optionalArgs.loggerOptions
            }
        )
            .then((data) => {
                // check if password needs to be decrypted
                if (optionalArgs.passwordEncrypted) {
                    return localCryptoUtil.decryptPassword(data);
                }
                return q(data);
            })
            .then((data) => {
                password = data.trim();

                if (!password) {
                    return q.reject(new Error('Failed to retrieve actual password'));
                }

                if (optionalArgs.product) {
                    return q(optionalArgs.product);
                }
                return util.getProduct();
            })
            .then((product) => {
                if (product === PRODUCTS.BIGIQ) {
                    return tokenAuth.call(
                        this,
                        host,
                        optionalArgs.port,
                        user,
                        password,
                        optionalArgs.loggerOptions
                    );
                }
                return basicAuth.call(
                    this,
                    host,
                    optionalArgs.port,
                    user,
                    password,
                    optionalArgs.loggerOptions
                );
            })
            .catch((err) => {
                logger.info('Unable to initialize device', err && err.message ? err.message : err);
                return q.reject(err);
            });
    },

    setLogger(aLogger) {
        logger = aLogger;
    },

    setLoggerOptions(loggerOptions) {
        const loggerOpts = {};
        Object.keys(loggerOptions).forEach((option) => {
            loggerOpts[option] = loggerOptions[option];
        });
        loggerOpts.module = module;
        logger = Logger.getLogger(loggerOpts);
        util.setLoggerOptions(loggerOpts);
        localCryptoUtil.setLoggerOptions(loggerOpts);
    }
};

/**
 * Disambiguates data that is either raw data or in a URI.
 *
 * @param {String}  dataOrUri               - Data URI (file, http, https, AWS arn) to
 *                                            location containing data.
 * @param {Boolean} dataIsUri               - Indicates that password is a URI for the password
 * @param {Object}  [options]               - Optional parameters.
 * @param {Object}  [options.clOptions]     - Command line options if called from a script.
 *                                            Required for URIs that are AWS ARNs
 * @param {Object}  [options.logger]        - Logger to use. Or, pass loggerOptions to
 *                                            get your own logger.
 * @param {Object}  [options.loggerOptions] - Options for the logger.
 *                                            See {@link module:logger.getLogger} for details.
 */
function readData(dataOrUri, dataIsUri, options) {
    const deferred = q.defer();

    if (dataIsUri) {
        if (dataOrUri.startsWith('arn')) {
            // AWS arn
            // this.provider can be injected by test code
            if (!this.provider) {
                this.provider = cloudProviderFactory.getCloudProvider('aws', options);
            }

            this.provider.init()
                .then(() => {
                    return this.provider.getDataFromUri(dataOrUri);
                })
                .then((data) => {
                    deferred.resolve(data);
                })
                .catch((err) => {
                    deferred.reject(err);
                });
        } else {
            // Plain old url
            util.getDataFromUrl(dataOrUri)
                .then((data) => {
                    deferred.resolve(data);
                })
                .catch((err) => {
                    deferred.reject(err);
                });
        }
    } else {
        // Plain old data
        deferred.resolve(dataOrUri);
    }

    return deferred.promise;
}

function tokenAuth(host, port, user, password, loggerOptions) {
    let icontrol;

    const login = function () {
        return icontrol.create(
            '/shared/authn/login',
            {
                password,
                username: user,
            }
        );
    };

    // this.icontrol can be set by test code
    icontrol = this.icontrol || new IControl(
        {
            loggerOptions,
            port,
            host: host.trim(),
            user: user.trim(),
            password: password.trim(),
            basePath: '/mgmt',
            strict: false,
        }
    );
    icontrol.authToken = null;

    logger.debug('Getting auth token.');
    const retryConfig = {
        maxRetries: util.DEFAULT_RETRY.maxRetries,
        retryIntervalMs: util.DEFAULT_RETRY.retryIntervalMs,
        continueOnError: true
    };
    return util.tryUntil(this, retryConfig, login)
        .then((response) => {
            // Don't log the response here - it has the auth token in it

            if (response && response.token && response.token.token) {
                icontrol.setAuthToken(response.token.token);
                if (response.refreshToken) {
                    icontrol.setRefreshToken(response.refreshToken.token);
                }
                return q(icontrol);
            }

            const message = 'Did not receive auth token';
            logger.info(message);
            return q.reject(new Error(message));
        });
}

function basicAuth(host, port, user, password, loggerOptions) {
    return new IControl({
        loggerOptions,
        port,
        host: host.trim(),
        user: user.trim(),
        password: password.trim(),
        basePath: '/mgmt',
        strict: false
    });
}
