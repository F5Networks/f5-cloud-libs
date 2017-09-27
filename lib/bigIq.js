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

var q = require('q');
var IControl = require('./iControl');
var util = require('./util');
var Logger = require('./logger');
var Provider;
var icontrol;

/**
 * Creates the BIG-IQ client
 * @class
 * @classdesc
 * Provides core functionality (CRUD operations, ready, etc) and maintains
 * references to other modules in f5-cloud-libs.
 *
 * After creating a BigIq with this constructor, you must call the
 * async init() method.
 *
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.clOptions]     - Command line options if called from a script.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
 */
function BigIq(options) {

    options = options || {};
    this.constructorOptions = options;

    if (options.logger) {
        this.logger = options.logger;
        util.setLogger(options.logger);
    }
    else {
        options.loggerOptions = options.loggerOptions || {logLevel: 'none'};
        options.loggerOptions.module = module;
        this.logger = Logger.getLogger(options.loggerOptions);
        util.setLoggerOptions(options.loggerOptions);
    }

    // We're not ready until we have all the info we need (password from URL, for example)
    // Must call init() to set this
    this.isInitialized = false;
}

/**
 * Initialize this instance w/ host user password
 *
 * @param {String}  host                    - Host to connect to.
 * @param {String}  user                    - User (with admin rights).
 * @param {String}  passwordOrUri           - Password for user or URL (file, http, https) to location containing password.
 * @param {Object}  [options]               - Optional parameters.
 * @param {Boolean} [options.passwordIsUri] - Indicates that password is a URI for the password
 * @param {Object}  [options.bigIp]         - {@link BigIp} object. BigIp to control.
 *
 * @returns {Promise} A promise which is resolved when initialization is complete
 *                    or rejected if an error occurs.
 */
BigIq.prototype.init = function(host, user, passwordOrUri, options) {
    this.initOptions = options || {};
    this.host = host.trim();
    this.user = user.trim();

    return getActualPassword.call(this, passwordOrUri, this.initOptions, this.constructorOptions)
        .then(function(password) {
            var func = function() {
                return icontrol.create(
                    '/shared/authn/login',
                    {
                        username: user,
                        password: password
                    }
                );
            };

            if (password) {
                password = password.trim();
            }

            icontrol = this.icontrol || new IControl(
                {
                    host: host.trim(),
                    user: user.trim(),
                    password: password,
                    strict: false
                }
            );

            this.bigIp = options.bigIp || {};

            // Token auth is required for BIG-IQ licensing, so get the token
            this.logger.debug('Getting BIG-IQ auth token.');
            return util.tryUntil(this, {maxRetries: 72, retryIntervalMs: 5000}, func);
        }.bind(this))
        .then(function(response) {

            // Don't log the response here - it has the auth token in it

            // Setup bigIqControl with auth token
            icontrol = this.icontrol || new IControl(
                {
                    host: host,
                    authToken: response.token.token,
                    strict: false
                }
            );

            this.logger.debug('Getting BIG-IQ version.');
            return icontrol.list('/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version');
        }.bind(this))
        .then(function(response) {
            this.logger.debug(response);
            this.version = response[0].version;
        }.bind(this))
        .catch(function(err) {
            return q.reject(err);
        });
};

/**
 * Revokes a license for a BIG-IP
 * @param {String} poolName         - The name of the license pool to revoke from
 * @param {String} bigIpMgmtAddress - IP address of the BIG-IP to revoke the license from
 * @param {String} bigIpHostname    - Hostname of the BIG-IP to revoke the license from
 */
BigIq.prototype.revokeLicense = function(poolName, bigIpMgmtAddress, bigIpHostname) {
    var licenseProvider = getLicenseProvider.call(this, this.version);
    return licenseProvider.revoke(icontrol, poolName, bigIpMgmtAddress, bigIpHostname);
};

var getActualPassword = function(passwordOrUri, initOptions, constructorOptions) {
    var deferred = q.defer();

    if (initOptions.passwordIsUri) {
        if (passwordOrUri.startsWith('arn')) {
            // AWS arn
            // this.provider can be injected by test code
            if (!this.provider) {
                Provider = require('f5-cloud-libs-aws').provider;
                this.provider = new Provider(constructorOptions);
            }

            this.provider.init()
                .then(function() {
                    return this.provider.getDataFromUri(passwordOrUri);
                }.bind(this))
                .then(function(data) {
                    deferred.resolve(data);
                })
                .catch(function(err) {
                    deferred.reject(err);
                });
        }
        else {
            // Plain old url
            util.getDataFromUrl(passwordOrUri)
                .then(function(data) {
                    deferred.resolve(data);
                })
                .catch(function(err) {
                    deferred.reject(err);
                });
        }
    }
    else {
        // Plain old password
        deferred.resolve(passwordOrUri);
    }

    return deferred.promise;
};

var getLicenseProvider = function(version) {
    var BigIq5_0LicenseProvider = require('./bigIq5_0LicenseProvider');
    var BigIq5_2LicenseProvider = require('./bigIq5_2LicenseProvider');
    var BigIq5_3LicenseProvider = require('./bigIq5_3LicenseProvider');

    if (util.versionCompare(version, '5.0.0') < 0) {
         throw new Error('Licensing via BIG-IQ is only supported on BIG-IQ versions 5.0.x and greater');
    }

    if (util.versionCompare(version, '5.0.0') >= 0 && util.versionCompare(version, '5.2.0') < 0) {
        return new BigIq5_0LicenseProvider(this.bigIp, this.options);
    }
    else if (util.versionCompare(version, '5.2.0') >= 0 && util.versionCompare(version, '5.3.0') < 0) {
        return new BigIq5_2LicenseProvider(this.bigIp, this.options);
    }
    else if (util.versionCompare(version, '5.3.0') >= 0) {
        return new BigIq5_3LicenseProvider(this.bigIp, this.options);
    }
    else {
        throw new Error('No license provider found for BIG-IQ', version);
    }
};

module.exports = BigIq;