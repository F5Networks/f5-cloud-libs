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
var BigIp = require('../../lib/bigIp');
var icontrolMock = require('../testUtil/icontrolMock');

var bigIp = new BigIp('host', 'user', 'password', {icontrol: icontrolMock});
bigIp.ready = function() {
    return q();
};

module.exports = {
    testHostName: function(test) {
        var oldHostname = 'yourOldHostname';
        var newHostname = 'myNewHostName';

        var TRANSACTION_PATH = '/tm/transaction/';
        var TRANSACTION_ID = '1234';

        icontrolMock.when(
            'create',
            TRANSACTION_PATH,
            {
                transId: TRANSACTION_ID
            }
        );

        icontrolMock.when(
            'modify',
            TRANSACTION_PATH + TRANSACTION_ID,
            {
                state: 'COMPLETED'
            }
        );

        icontrolMock.when(
            'list',
            '/tm/cm/device',
            [
                {
                    name: oldHostname
                }
            ]
        );

        bigIp.onboard.hostname(newHostname)
            .then(function() {
                test.deepEqual(icontrolMock.getRequest(
                    'create',
                    '/tm/cm/device'),
                    {
                        command: 'mv',
                        name: oldHostname,
                        target: newHostname
                    });
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testPasswordNonRoot: function(test) {
        var user = 'someuser';
        var newPassword = 'abc123';

        bigIp.onboard.password(user, newPassword)
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.method, 'modify');
                test.strictEqual(icontrolMock.lastCall.path, '/tm/auth/user/' + user);
                test.strictEqual(icontrolMock.lastCall.body.password, newPassword);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testPasswordRoot: function(test) {
        var user = 'root';
        var newPassword = 'abc123';
        var oldPassword = 'def456';

        bigIp.onboard.password(user, newPassword, oldPassword)
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.method, 'create');
                test.strictEqual(icontrolMock.lastCall.path, '/shared/authn/root');
                test.strictEqual(icontrolMock.lastCall.body.newPassword, newPassword);
                test.strictEqual(icontrolMock.lastCall.body.oldPassword, oldPassword);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testProvision: {
        setUp: function(callback) {
            var TRANSACTION_PATH = '/tm/transaction/';
            var TRANSACTION_ID = '1234';

            icontrolMock.when(
                'create',
                TRANSACTION_PATH,
                {
                    transId: TRANSACTION_ID
                }
            );

            icontrolMock.when(
                'modify',
                TRANSACTION_PATH + TRANSACTION_ID,
                {
                    state: 'COMPLETED'
                }
            );
            callback();
        },

        testBasic: function(test) {
            var provisionSettings = {
                mod1: 'level2',
                mod2: 'level2'
            };

            icontrolMock.when(
                'list',
                '/tm/sys/provision/',
                [
                    {
                        name: 'mod1',
                        level: 'level1'
                    },
                    {
                        name: 'mod2',
                        level: 'level2'
                    }
                ]
            );

            bigIp.onboard.provision(provisionSettings)
                .then(function() {
                    test.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/provision/mod1'),
                        {
                            level: 'level2'
                        }
                    );
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNotProvisionable: function(test) {
            var provisionSettings = {
                foo: 'bar'
            };

            icontrolMock.when(
                'list',
                '/tm/sys/provision/',
                [
                    {
                        name: 'mod1',
                        level: 'level1'
                    }
                ]
            );

            bigIp.onboard.provision(provisionSettings)
                .then(function() {
                    test.ok(false, "Should have thrown as not provisionable.");
                })
                .catch(function(err) {
                    test.notEqual(err.message.indexOf('foo'), -1);
                    test.notEqual(err.message.indexOf('not provisionable'), -1);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};