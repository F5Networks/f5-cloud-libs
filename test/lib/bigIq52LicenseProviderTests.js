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

const poolName = 'myLicensePool';
const poolUuid = '1234';
const licenseUuid = '5678';
const bigIpHostname = 'myBigIqHost';
const LICENSE_PATH = '/cm/device/licensing/pool/regkey/licenses/';
const regKey = '1234';
const memberId = '5678';

var util;
var BigIqProvider;
var provider;
var icontrolMock;

module.exports = {
    setUp: function(callback) {
        util = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        icontrolMock.reset();

        BigIqProvider = require('../../lib/bigIq52LicenseProvider');
        provider = new BigIqProvider();
        provider.bigIp = {
            user: 'user',
            password: 'password'
        };
        callback();
    },

    testConstructor: {
        testSetLogger: function(test) {
            const logger = {
                a: 1,
                b: 2
            };

            provider = new BigIqProvider({}, {logger: logger});
            test.deepEqual(provider.logger, logger);
            test.done();
        },

        testLoggerOptions: function(test) {
            const loggerOptions = {
                a: 1,
                b: 2
            };

            test.doesNotThrow(function() {
                new BigIqProvider({loggerOptions: loggerOptions});
            });
            test.done();
        }
    },

    testGetUnmanagedDeviceLicense: {
        setUp: function(callback) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + '?$select=id,name',
                [
                    {
                        name: 'pool1',
                        id: poolUuid
                    }
                ]
            );

            callback();
        },

        testEmptyPools: function(test) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + '?$select=id,name',
                []
            );

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(function() {
                    test.ok(false, "Should have thrown empty pools.");
                })
                .catch(function() {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoPools: function(test) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + '?$select=id,name',
                {}
            );

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(function() {
                    test.ok(false, "Should have thrown no pools.");
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('No license pool'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPoolQueryError: function(test) {
            icontrolMock.fail(
                'list',
                LICENSE_PATH + '?$select=id,name'
            );

            provider.getLicenseTimeout = function() {return util.SHORT_RETRY;};

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'foo')
                .then(function() {
                    test.ok(false, "Should have thrown query error.");
                })
                .catch(function(err) {
                    test.strictEqual(err.message, 'We were told to fail this.');
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoActiveRegKeys: function(test) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings?$select=licenseState',
                [
                    {
                        licenseState: {
                            licenseStartDateTime: undefined,
                            licenseEndDateTime: undefined
                        }
                    }
                ]
            );

            util.MEDIUM_RETRY = {maxRetries: 0, retryIntervalMs: 0};

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(function() {
                    test.ok(false, "Should have thrown no active licenses.");
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('No valid reg keys'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoValidRegKeys: function(test) {
            var regKey = '1234';
            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings?$select=licenseState',
                [
                    {
                        licenseState: {
                            licenseStartDateTime: new Date(1970, 1, 1),
                            licenseEndDateTime: new Date(2999, 12, 31),
                            registrationKey: regKey
                        }
                    }
                ]
            );

            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                [
                    {
                        foo: "bar"
                    }
                ]
            );

            util.MEDIUM_RETRY = {maxRetries: 0, retryIntervalMs: 0};

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(function() {
                    test.ok(false, "Should have thrown no valid licenses.");
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('No valid reg keys'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicenseRequestError: function(test) {
            icontrolMock.fail('list', LICENSE_PATH + poolUuid + '/offerings?$select=licenseState');

            util.MEDIUM_RETRY = {maxRetries: 0, retryIntervalMs: 0};

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(function() {
                    test.ok(false, "Should have thrown license error.");
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('We were told to fail this.'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testGetMembersForKeyError: function(test) {
            var regKey = '1234';
            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings?$select=licenseState',
                [
                    {
                        licenseState: {
                            licenseStartDateTime: new Date(1970, 1, 1),
                            licenseEndDateTime: new Date(2999, 12, 31),
                            registrationKey: regKey
                        }
                    }
                ]
            );

            icontrolMock.fail('list', LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members');

            util.MEDIUM_RETRY = {maxRetries: 0, retryIntervalMs: 0};

            test.expect(1);
            provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1')
                .then(function() {
                    test.ok(false, "Should have thrown license error.");
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('No valid reg keys'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testLicensed: {
            setUp: function(callback) {
                var regKey = '1234';
                icontrolMock.when(
                    'list',
                    LICENSE_PATH + poolUuid + '/offerings?$select=licenseState',
                    [
                        {
                            licenseState: {
                                licenseStartDateTime: new Date(1970, 1, 1),
                                licenseEndDateTime: new Date(2999, 12, 31),
                                registrationKey: regKey
                            }
                        }
                    ]
                );

                icontrolMock.when(
                    'list',
                    LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                    []
                );

                provider.getLicenseTimeout = function() {return util.SHORT_RETRY;};

                callback();
            },

            testLicensedImmediately: function(test) {
                var regKey = '1234';
                icontrolMock.when(
                    'create',
                    LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                    {
                        status: 'LICENSED'
                    }
                );

                provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                   .then(function() {
                        test.deepEqual(icontrolMock.getRequest(
                            'create',
                            LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members'),
                            {
                                deviceAddress: 'bigIpMgmtAddress:443',
                                username: 'user',
                                password: 'password'
                            });
                    })
                    .catch(function(err) {
                        test.ok(false, err.message);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testLicensedImmediately: function(test) {
                var regKey = '1234';
                icontrolMock.when(
                    'create',
                    LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                    {
                        status: 'LICENSED'
                    }
                );

                provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                    .then(function() {
                        test.deepEqual(icontrolMock.getRequest(
                            'create',
                            LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members'),
                            {
                                deviceAddress: 'bigIpMgmtAddress:443',
                                username: 'user',
                                password: 'password'
                            });
                    })
                    .catch(function(err) {
                        test.ok(false, err.message);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testLicensedLater: function(test) {
                var regKey = '1234';
                var memberId = '5678';

                icontrolMock.when(
                    'create',
                    LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                    {
                        id: memberId,
                        status: 'FOOBAR'
                    }
                );

                icontrolMock.when(
                    'list',
                    LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId,
                    {
                        status: 'LICENSED'
                    }
                );

                test.expect(2);
                provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                    .then(function() {
                        test.strictEqual(icontrolMock.lastCall.method, 'list');
                        test.strictEqual(icontrolMock.lastCall.path, LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId);
                    })
                    .catch(function(err) {
                        test.ok(false, err.message);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testNeverLicensed: function(test) {
                var regKey = '1234';
                var memberId = '5678';

                icontrolMock.when(
                    'create',
                    LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                    {
                        id: memberId,
                        status: 'FOOBAR'
                    }
                );

                icontrolMock.when(
                    'list',
                    LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId,
                    {
                        status: 'FOOBAR'
                    }
                );

                util.MEDIUM_RETRY = {maxRetries: 0, retryIntervalMs: 0};

                test.expect(1);
                provider.getUnmanagedDeviceLicense(icontrolMock, 'pool1', 'bigIpMgmtAddress', '443')
                    .then(function() {
                        test.ok(false, 'should thrown not licensed');
                    })
                    .catch(function(err) {
                        test.notStrictEqual(err.message.indexOf('Giving up'), -1);
                    })
                    .finally(function() {
                        test.done();
                    });
            }
        }
    },

    testRevokeLicense: {
        setUp: function(callback) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + '?$select=id,name',
                [
                    {
                        name: 'foo',
                        id: '0001'
                    },
                    {
                        name: poolName,
                        id: poolUuid
                    },
                    {
                        name: 'bar',
                        id: '0002'
                    }
                ]
            );

            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings?$select=licenseState',
                [
                    {
                        licenseState: {
                            registrationKey: '0001'
                        }
                    },
                    {
                        licenseState: {
                            registrationKey: regKey
                        }
                    },
                    {
                        licenseState: {
                            registrationKey: '0002'
                        }
                    }
                ]
            );

            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                [
                    {
                        deviceName: 'foo',
                        id: '1000'
                    },
                    {
                        deviceName: bigIpHostname,
                        id: memberId
                    },
                    {
                        deviceName: 'bar',
                        id: '2000'
                    }
                ]
            );

            icontrolMock.when(
                'delete',
                LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId,
                {}
            );

            callback();
        },

        testBasic: function(test) {
            test.expect(1);
            provider.revoke(icontrolMock, poolName, {hostname: bigIpHostname})
                .then(function() {
                    var request = icontrolMock.getRequest('delete', LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members/' + memberId);
                    test.deepEqual(
                        request,
                        {
                            username: 'user',
                            password: 'password',
                            id: licenseUuid
                        }
                    );
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoLicenseForHost: function(test) {
            icontrolMock.when(
                'list',
                LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members',
                [
                    {
                        deviceName: 'foo',
                        id: '1000'
                    },
                    {
                        deviceName: 'bar',
                        id: '2000'
                    }
                ]
            );


            test.expect(1);
            provider.revoke(icontrolMock, poolName, {hostname: bigIpHostname})
                .then(function() {
                    test.ok(false, 'should have thrown no license for host');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, 'License for host not found.');
                })
                .finally(function() {
                    test.done();
                });
        },

        testGetMembersError: function(test) {
            icontrolMock.fail('list', LICENSE_PATH + poolUuid + '/offerings/' + regKey + '/members');

            test.expect(1);
            provider.revoke(icontrolMock, poolName, {hostname: bigIpHostname})
                .then(function() {
                    test.ok(false, 'should have thrown no license for host');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, 'License for host not found.');
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testGetLicenseTimeout: function(test) {
        test.deepEqual(provider.getLicenseTimeout(), {maxRetries: 40, retryIntervalMs: 5000});
        test.done();
    }
};