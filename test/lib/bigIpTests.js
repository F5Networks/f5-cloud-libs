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

var bigIp = new BigIp('host', 'user', 'password', null, {icontrol: icontrolMock});
bigIp.ready = function() {
    return q();
};

module.exports = {
    setUp: function(callback) {
        icontrolMock.reset();
        callback();
    },

    testActive: function(test) {
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

        bigIp.active()
            .then(function() {
                test.ok(true);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testNotActive: function(test) {
        icontrolMock.when(
            'list',
            '/tm/cm/failover-status',
            {
                entries: {
                    'https://localhost/mgmt/tm/cm/failover-status/0': {
                        nestedStats: {
                            entries: {
                                status: {
                                    description: 'FOOBAR'
                                }
                            }
                        }
                    }
                }
            }
        );

        bigIp.active(util.NO_RETRY)
            .then(function() {
                test.ok(false, "BIG-IP should not be active.");
            })
            .catch(function() {
                test.ok(true);
            })
            .finally(function() {
                test.done();
            });
    },

    testListSuccess: function(test) {
        bigIp.list();
        test.strictEqual(icontrolMock.lastCall.method, 'list');
        test.done();
    },

    testLoadNoFile: function(test) {
        bigIp.load()
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.method, 'create');
                test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                test.strictEqual(icontrolMock.lastCall.body.command, 'load');
                test.strictEqual(icontrolMock.lastCall.body.name, 'default');
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testLoadFile: function(test) {
        var fileName = 'foobar';

        bigIp.load(fileName)
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.body.options[0].file, fileName);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testLoadOptions: function(test) {
        var options = {
            foo: 'bar',
            hello: 'world'
        };

        bigIp.load(null, options)
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.body.options[0].foo, options.foo);
                test.strictEqual(icontrolMock.lastCall.body.options[1].hello, options.hello);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testPing: {
        testPacketsReceived: function(test) {
            icontrolMock.when('create',
                              '/tm/util/ping',
                              {
                                  commandResult: "PING 104.219.104.168 (104.219.104.168) 56(84) bytes of data.\n64 bytes from 104.219.104.168: icmp_seq=1 ttl=240 time=43.5 ms\n\n--- 104.219.104.168 ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss, time 43ms\nrtt min/avg/max/mdev = 43.593/43.593/43.593/0.000 ms\n"
                              });
            bigIp.ping('1.2.3.4')
            .then(function() {
                test.ok(true);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
        },

        testNoPacketsReceived: function(test) {
            icontrolMock.when('create',
                              '/tm/util/ping',
                              {
                                  commandResult: "PING 1.2.3.4 (1.2.3.4) 56(84) bytes of data.\n\n--- 1.2.3.4 ping statistics ---\n2 packets transmitted, 0 received, 100% packet loss, time 2000ms\n\n"
                              });
            bigIp.ping('1.2.3.4', util.NO_RETRY)
            .then(function() {
                test.ok(false, "Ping should have failed");
            })
            .catch(function() {
                test.ok(true);
            })
            .finally(function() {
                test.done();
            });
        },

        testUnknownHost: function(test) {
            icontrolMock.when('create',
                              '/tm/util/ping',
                              {
                                  commandResult: "ping: unknown host f5.com\n"
                              });
            bigIp.ping('1.2.3.4', util.NO_RETRY)
            .then(function() {
                test.ok(false, "Ping should have failed");
            })
            .catch(function() {
                test.ok(true);
            })
            .finally(function() {
                test.done();
            });
        }
    }
};