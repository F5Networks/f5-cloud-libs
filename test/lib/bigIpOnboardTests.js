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
var util = require('../../lib/util');
var icontrolMock = require('../testUtil/icontrolMock');

var bigIp = new BigIp('host', 'user', 'password');
bigIp.icontrol = icontrolMock;
bigIp.ready = function() {
    return q();
};

module.exports = {
    testHostName: function(test) {
        var oldHostname = 'yourOldHostname';
        var newHostname = 'myNewHostName';

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
                    }
                );
                test.deepEqual(icontrolMock.getRequest(
                    'modify',
                    '/tm/sys/global-settings'),
                    {
                        hostname: newHostname
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

    testLicense: {
        testIdentical: function(test) {
            var regKey = "1234-5678-ABCD-EFGH";
            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: regKey
                });

            bigIp.onboard.license({registrationKey: regKey})
                .then(function(response) {
                    test.notStrictEqual(response.indexOf("Identical license"), -1);
                })
                .catch(function(err) {
                    test.ok(false, err.message);
                })
                .finally(function() {
                    test.done();
                });
        }
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

            icontrolMock.reset();
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
                '/tm/cm/failover-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/failover-status/0': {
                            nestedStats: {
                                entries: {
                                    status: {
                                        description: 'ACTIVE'
                                    }
                                }
                            }
                        }
                    }
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

            bigIp.onboard.provision(provisionSettings, util.NO_RETRY)
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
    },

    testSslPort: {
        setUp: function(callback) {
            icontrolMock.when(
                'list',
                '/tm/net/self-allow',
                {
                    defaults: [
                        'tcp:123'
                    ]
                }
            );
            callback();
        },

        testNotInDefaults: function(test) {
            var portToAdd = 456;
            bigIp.onboard.sslPort(portToAdd, null, true)
            .then(function() {
                var newDefaults = icontrolMock.getRequest('modify', '/tm/net/self-allow').defaults;
                test.notStrictEqual(newDefaults.indexOf('tcp:' + portToAdd), -1);
                test.notStrictEqual(newDefaults.indexOf('tcp:123'), -1);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
        },

        testAlreadyInDefaults: function(test) {
            var portToAdd = 123;
            bigIp.onboard.sslPort(portToAdd, null, true)
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.method, 'list');
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
        },

        testRemove443: function(test) {
            var portToAdd = 456;

            icontrolMock.when(
                'list',
                '/tm/net/self-allow',
                {
                    defaults: [
                        'tcp:443'
                    ]
                }
            );

            bigIp.onboard.sslPort(portToAdd, null, true)
            .then(function() {
                var newDefaults = icontrolMock.getRequest('modify', '/tm/net/self-allow').defaults;
                test.strictEqual(newDefaults.indexOf('tcp:443'), -1);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
        }
    },

    testUpdateUser: {
        testCreate: function(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'admin'
                    }
                ]
            );
            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole')
            .then(function() {
                var userParams = icontrolMock.getRequest('create', '/tm/auth/user');
                test.strictEqual(userParams.name, 'myUser');
                test.strictEqual(userParams.password, 'myPass');
                test.strictEqual(userParams["partition-access"]["all-partitions"].role, 'myRole');
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
        },

        testCreateNoExistingUsers: function(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                {}
            );
            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole', 'myShell')
            .then(function() {
                var userParams = icontrolMock.getRequest('create', '/tm/auth/user');
                test.strictEqual(userParams.name, 'myUser');
                test.strictEqual(userParams.password, 'myPass');
                test.strictEqual(userParams.shell, 'myShell');
                test.strictEqual(userParams["partition-access"]["all-partitions"].role, 'myRole');
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
        },

        testCreateNoRole: function(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'admin'
                    }
                ]
            );
            bigIp.onboard.updateUser('myUser', 'myPass')
            .then(function() {
                test.ok(false, "Should have thrown that we are creating with no role.");
            })
            .catch(function() {
                test.ok(true);
            })
            .finally(function() {
                test.done();
            });
        },

        testUpdate: function(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'myUser'
                    }
                ]
            );
            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole')
            .then(function() {
                var userParams = icontrolMock.getRequest('modify', '/tm/auth/user/myUser');
                test.strictEqual(userParams.name, undefined);
                test.strictEqual(userParams.password, 'myPass');
                test.strictEqual(userParams["partition-access"], undefined);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
        }
    }
};