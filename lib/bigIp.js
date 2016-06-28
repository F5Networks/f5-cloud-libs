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

var IControl = require('icontrol');
var util = require('./util');
var icontrol;

class BigIp {

    constructor(host, user, password) {
        icontrol = new IControl({
            host: host,
            user: user,
            pass: password,
            basePath: '/mgmt',
            strict: false
        });
    }

    list(path) {
        return new Promise(function(resolve, reject) {
            icontrol.list(path, function(err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            });
        });
    }

    create(path, body) {
        return new Promise(function(resolve, reject) {
            icontrol.create(path, body, function(err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            });
        });
    }

    modify(path, body) {
        return new Promise(function(resolve, reject) {
            icontrol.modify(path, body, function(err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            });
        });
    }

    delete(path) {
        return new Promise(function(resolve, reject) {
            icontrol.delete(path, function(err, response) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Resolves when BIG-IP is ready.
     *
     * BIG-IP is determined to be ready when the nodejs echo-js worker
     * is ready.
     *
     * @returns {Promise} A Promise which is resolved when BIG-IP is ready
     *                    or rejected after trying a fixed number of times.
     */
    ready() {
        const MAX_RETRIES = 10;
        const RETRY_INTERVAL = 1000;

        var isReady = function() {
            return new Promise(function(resolve, reject) {
                icontrol.list('/shared/echo-js', function(err, response) {
                    if (err) {
                        reject('Error calling /shared/echo-js');
                    }
                    else {
                        if (!response.selfLink) {
                            reject('No selfLink in response');
                        }
                        else {
                           resolve();
                        }
                    }
                });
            });
        };

        return util.tryUntil(MAX_RETRIES, RETRY_INTERVAL, isReady);
    }

    initialSetup(options) {
        var commands = [];

        if (options.dns) {
            commands.push(
                {
                    promise: this.modify,
                    arguments: [
                        '/tm/sys/dns',
                        {
                            'name-servers': options.dns.nameServers
                        }
                    ]
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
                    ]
                }
            );
        }

        if (commands.length > 0) {
            return util.callInSerial(this, commands);
        }
        else {
            return Promise.resolve();
        }
    }
}

module.exports = BigIp;