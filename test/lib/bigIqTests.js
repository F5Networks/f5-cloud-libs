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

const q = require('q');

const host = 'myHost';
const user = 'myUser';
const password = 'myPassword';

var bigIqVersion = '5.2';
var BigIq;
var bigIq;
var utilMock;
var icontrolMock;
var revokeCalled;

module.exports = {
    setUp: function(callback) {
        utilMock = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');

        icontrolMock.reset();

        icontrolMock.when(
            'create',
            '/shared/authn/login',
            {}
        );

        icontrolMock.when(
            'list',
            '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
            [
                {
                    version: bigIqVersion
                }
            ]
        );

        BigIq = require('../../../f5-cloud-libs').bigIq;
        bigIq = new BigIq();
        bigIq.icontrol = icontrolMock;

        callback();
    },

    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });

        callback();
    },

    testConstructor: {
        testSetLogger: function(test) {
            const logger = {
                a: 1,
                b: 2
            };

            bigIq = new BigIq({logger: logger});
            test.deepEqual(bigIq.logger, logger);
            test.done();
        },

        testLoggerOptions: function(test) {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            test.doesNotThrow(function() {
                new BigIq({loggerOptions: loggerOptions});
            });
            test.done();
        }
    },

    testInit: {
        testBasic: function(test) {
            test.expect(4);
            bigIq.init(host, user, password)
                .then(function() {
                    var loginRequest = icontrolMock.getRequest('create', '/shared/authn/login');

                    test.strictEqual(bigIq.host, host);
                    test.strictEqual(bigIq.user, user);
                    test.strictEqual(bigIq.version, bigIqVersion);
                    test.strictEqual(loginRequest.password, password);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPasswordUrl: function(test) {
            const passwordFile = '/tmp/passwordFromUrlTest';
            const passwordUri = 'file://' + passwordFile;

            utilMock.getDataFromUrl = function() {
                return q(password);
            };

            test.expect(1);
            bigIq.init(host, user, passwordUri, {passwordIsUri: true})
                .then(function() {
                    var loginRequest = icontrolMock.getRequest('create', '/shared/authn/login');

                    test.strictEqual(loginRequest.password, password);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPasswordArn: function(test) {
            const passwordUri = 'arn:::foo:bar/password';

            bigIq.provider = {
                init: function() {
                    return q();
                },
                getDataFromUri: function() {
                    return q(password);
                }
            };

            test.expect(1);
            bigIq.init(host, user, passwordUri, {passwordIsUri: true})
                .then(function() {
                    var loginRequest = icontrolMock.getRequest('create', '/shared/authn/login');

                    test.strictEqual(loginRequest.password, password);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoPasswordRetrieved: function(test) {
            const passwordFile = '/tmp/passwordFromUrlTest';
            const passwordUri = 'file://' + passwordFile;

            utilMock.getDataFromUrl = function() {
                return q();
            };

            test.expect(1);
            bigIq.init(host, user, passwordUri, {passwordIsUri: true})
                .then(function() {
                    test.ok(false, 'Should have thrown no password');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('Failed to retrieve'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testGetVersionError: function(test) {
            icontrolMock.fail('list', '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version');

            test.expect(1);
            bigIq.init(host, user, password)
                .then(function() {
                    test.ok(false, 'should have thrown init error');
                })
                .catch(function() {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });

        },

        testGetDataFromUrlError: function(test) {
            const passwordFile = '/tmp/passwordFromUrlTest';
            const passwordUri = 'file://' + passwordFile;
            const errorMessage = 'getDataFromUrl error';

            utilMock.getDataFromUrl = function() {
                return q.reject(new Error(errorMessage));
            };

            test.expect(1);
            bigIq.init(host, user, passwordUri, {passwordIsUri: true})
                .then(function() {
                    test.ok(false, 'should have thrown getDataFromUri error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, errorMessage);
                })
                .finally(function() {
                    test.done();
                });
        },

        testGetDataFromUriError: function(test) {
            const passwordUri = 'arn:::foo:bar/password';
            const errorMessage = 'getDataFromUri error';

            bigIq.provider = {
                init: function() {
                    return q();
                },
                getDataFromUri: function() {
                    return q.reject(new Error(errorMessage));
                }
            };

            test.expect(1);
            bigIq.init(host, user, passwordUri, {passwordIsUri: true})
                .then(function() {
                    test.ok(false, 'should have thrown getDataFromUri error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, errorMessage);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testRevokeLicense: {
        setUp: function(callback) {
            revokeCalled = false;
            callback();
        },

        test5_0: function(test) {
            var licenseProvider = require('../../../f5-cloud-libs').bigIq50LicenseProvider;

            licenseProvider.revoke = function() {
                return q();
            };

            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '5.0.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(function() {
                    bigIq.revokeLicense()
                    .then(function() {
                        test.strictEqual(revokeCalled, true);
                    })
                    .catch(function() {
                        test.ok(true);
                    })
                    .finally(function() {
                        test.done();
                    });
                });
        },

        test5_2: function(test) {
            var licenseProvider = require('../../../f5-cloud-libs').bigIq52LicenseProvider;

            licenseProvider.revoke = function() {
                return q();
            };

            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '5.2.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(function() {
                    bigIq.revokeLicense()
                    .then(function() {
                        test.strictEqual(revokeCalled, true);
                    })
                    .catch(function() {
                        test.ok(true);
                    })
                    .finally(function() {
                        test.done();
                    });
                });
        },

        test5_3: function(test) {
            var licenseProvider = require('../../../f5-cloud-libs').bigIq53LicenseProvider;

            licenseProvider.revoke = function() {
                return q();
            };

            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '5.3.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(function() {
                    bigIq.revokeLicense()
                    .then(function() {
                        test.strictEqual(revokeCalled, true);
                    })
                    .catch(function() {
                        test.ok(true);
                    })
                    .finally(function() {
                        test.done();
                    });
                });
        },

        testPre5_0: function(test) {
            icontrolMock.when(
                'list',
                '/shared/resolver/device-groups/cm-shared-all-big-iqs/devices?$select=version',
                [
                    {
                        version: '4.9.0'
                    }
                ]
            );

            test.expect(1);
            bigIq.init('host', 'user', 'password')
                .then(function() {
                    bigIq.revokeLicense()
                    .then(function() {
                        test.ok(false, 'should have thrown not supported');
                    })
                    .catch(function(err) {
                        test.notStrictEqual(err.message.indexOf('BIG-IQ versions'), -1);
                    })
                    .finally(function() {
                        test.done();
                    });
                });
        }
    }
};
