/**
 * Copyright 2016 F5 Networks, Inc.
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
var IControl = require('icontrol');
var util = require('./util');

var icontrol;

function BigIp(host, user, password) {

    icontrol = new IControl({
        host: host,
        user: user,
        pass: password,
        basePath: '/mgmt',
        strict: false
    });
}

BigIp.prototype.list = function (path) {
    var deferred = q.defer();

    icontrol.list(path, function(err, response) {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(response);
        }
    });

    return deferred.promise;
};

BigIp.prototype.create = function(path, body) {
    var deferred = q.defer();

    icontrol.create(path, body, function(err, response) {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(response);
        }
    });

    return deferred.promise;
};

BigIp.prototype.modify = function(path, body) {
    var deferred = q.defer();

    icontrol.modify(path, body, function(err, response) {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(response);
        }
    });

    return deferred.promise;
};

BigIp.prototype.delete = function(path) {
    var deferred = q.defer();

    icontrol.delete(path, function(err, response) {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(response);
        }
    });

    return deferred.promise;
};

/**
 * Resolves when BIG-IP is ready.
 *
 * BIG-IP is determined to be ready when the nodejs echo-js worker
 * is ready.
 *
 * @returns {Promise} A Promise which is resolved when BIG-IP is ready
 *                    or rejected after trying a fixed number of times.
 */
BigIp.prototype.ready = function() {
    var MAX_RETRIES = 10;
    var RETRY_INTERVAL = 1000;

    var isReady = function() {
        var deferred = q.defer();
        icontrol.list('/shared/echo-js', function(err, response) {
            if (err) {
                deferred.reject('Error calling /shared/echo-js');
            }
            else {
                if (!response.selfLink) {
                    deferred.reject('No selfLink in response');
                }
                else {
                   deferred.resolve();
                }
            }
        });

        return deferred.promise;
    };

    return util.tryUntil(MAX_RETRIES, RETRY_INTERVAL, isReady);
};

/**
 * Do some basic initial configuration of BIG-IP
 *
 * @param {Object}   options - Initial configuration optons.
 * @param {Boolean}  [options.guiSetup] - Whether or not to enable gui setup.
 * @param {Object}   [options.dns] - DNS configuration options
 * @param {String[]} [options.dns.name-servers] - Array of name servers.
 * @param {Object}   [options.ntp] - NTP configuration options.
 * @param {String}   [options.ntp.timezone] - Local timezone.
 * @param {String[]} [options.ntp.servers] - Array of NTP servers.
 *
 * @returns {Promise} A promise which is resolved when the initial
 *                    configuration is complete or rejected if an
 *                    error occurs.
 */
BigIp.prototype.initialSetup = function(options) {
    var commands = [];

    if (typeof options.guiSetup !== undefined) {
        commands.push(
            {
                promise: this.modify,
                arguments: [
                    '/tm/sys/global-settings',
                    {
                        'guiSetup': options.guiSetup ? "enabled" : "disabled"
                    }
                ],
                message: (options.guiSetup ? "Enabling" : "Disabling") + " gui-setup."
            }
        );
    }

    if (options.dns) {
        commands.push(
            {
                promise: this.modify,
                arguments: [
                    '/tm/sys/dns',
                    {
                        'name-servers': options.dns.nameServers
                    }
                ],
                message: 'Setting up DNS.'
            }
        );
    }

    if (options.hostname) {
        commands.push(
            {
                promise: this.modify,
                arguments: [
                    '/tm/sys/global-settings',
                    {
                        'hostname': options.hostname
                    }
                ],
                message: 'Setting hostname.'
            }
        );
    }

    if (options.ntp) {
        commands.push(
            {
                promise: this.modify,
                arguments: [
                    '/tm/sys/ntp',
                    {
                        'timezone': options.ntp.timezone,
                        'servers': options.ntp.servers
                    }
                ],
                message: 'Setting up NTP.'
            }
        );
    }

    if (commands.length > 0) {
        return util.callInSerial(this, commands);
    }
    else {
        return q(true);
    }
};

/**
 * Licenses the BIG-IP
 *
 * @param {Object}   options - Licensing options
 * @param {Boolean}  [options.overwrite] - Whether or not to overwrite an
 *                                         existing license file if it exists.
 *                                         Default is false
 * @param {String}   [options.registrationKey] - The registration key
 * @param {String[]} [options.addOnKeys] - Array of add on keys.
 *
 * @returns {Promise} A promise which is resolved when the licensing
 *                    is complete or rejected if an error occurs.
 */
BigIp.prototype.license = function(options) {
    var alreadyLicensed;

    if (!(options.registrationKey || options.addOnKeys)) {
        return q('No registration key or add on keys. Nothing to do.');
    }

    return this.list('/tm/shared/licensing/registration')
        .then(function(response) {
            var licenseBody;

            if (response.registrationKey && !options.addOnKeys.length && !options.overwrite) {
                alreadyLicensed = true;
                return q();
            }

            licenseBody = {
                command: 'install'
            };

            if (options.registrationKey) {
                licenseBody.registrationKey = options.registrationKey;
            }

            if (options.addOnKeys.length > 0) {
                licenseBody.addOnKeys = options.addOnKeys;
            }

            return this.create('/tm/sys/license', licenseBody);
        }.bind(this))
        .then(function() {
            var message;

            if (alreadyLicensed) {
                message = 'BIG-IP already licensed. Use overwrite option to re-license.';
            }
            else {
                message = 'Licensing successful.';
            }
            return message;
        })
        .catch(function(error) {
            throw error;
        });
};

module.exports = BigIp;