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

class BigIp {

    constructor(host, user, password) {
        this.bigIp = new IControl({
            host: host,
            user: user,
            pass: password,
            strict: false
        });
    }

    ready() {
        const MAX_RETRIES = 10;
        const RETRY_INTERVAL = 1000;

        var isReady = function() {
            return new Promise(
                function(resolve, reject) {
                    this.bigIp.list('/shared/echo-js', function(err, response) {
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
                }.bind(this)
            );
        }.bind(this);

        return new Promise(
            function(resolve, reject) {
                util.tryUntil(MAX_RETRIES, RETRY_INTERVAL, isReady)
                    .then(function() {
                        resolve();
                    })
                    .catch(function(err) {
                        reject(err);
                    });
            }
        );
    }
}

module.exports = BigIp;