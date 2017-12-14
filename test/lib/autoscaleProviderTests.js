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
var util = require('util');
var AutoscaleProvider = require('../../../f5-cloud-libs').autoscaleProvider;

util.inherits(TestAutoscaleProvider, AutoscaleProvider);
function TestAutoscaleProvider(options) {
    TestAutoscaleProvider.super_.call(this, options);
}

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);
process.setMaxListeners(0);

var instancesCalled = [];
var testAutoscaleProvider;
var bigIqMock;
var poolCalled;

module.exports = {
    setUp: function(callback) {
        testAutoscaleProvider = new TestAutoscaleProvider();
        callback();
    },

    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });

        callback();
    },

    testLogger: function(test) {
        var logger = {
            a: 1,
            b:2
        };
        testAutoscaleProvider = new TestAutoscaleProvider({logger: logger});
        test.deepEqual(testAutoscaleProvider.logger, logger);
        test.done();
    },

    testClOptions: function(test) {
        var clOptions = {
            foo: 'bar',
            hello: 'world'
        };

        testAutoscaleProvider = new TestAutoscaleProvider({clOptions: clOptions});
        test.deepEqual(testAutoscaleProvider.clOptions, clOptions);
        test.done();
    },

    testInit: function(test) {
        test.expect(1);
        testAutoscaleProvider.init()
            .then(function() {
                test.ok(true);
                test.done();
            });
    },

    testUnimplementedBigIpReady: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.bigIpReady();
        });
        test.done();
    },

    testUnimplementedGetDataFromUri: function(test) {
        test.throws(function() {
            testAutoscaleProvider.getDataFromUri();
        });
        test.done();
    },

    testUnimplementedGetInstanceId: function(test) {
        test.throws(function() {
            testAutoscaleProvider.getInstanceId();
        });
        test.done();
    },

    testUnimplementedGetInstances: function(test) {
        test.throws(function() {
            testAutoscaleProvider.getInstances();
        });
        test.done();
    },

    testUnimplementedElectMaster: function(test) {
        test.throws(function() {
            testAutoscaleProvider.electMaster();
        });
        test.done();
    },

    testUnimplementedGetMasterCredentials: {
        tearDown: function(callback) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported: function(test) {
            test.throws(function() {
                testAutoscaleProvider.getMasterCredentials();
            });
            test.done();
        },

        testMessagingSupported: function(test) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_MESSAGING] = true;
            test.doesNotThrow(function() {
                testAutoscaleProvider.getMasterCredentials();
            });
            test.done();
        }
    },

    testUnimplementedGetMasterStatus: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.getMasterStatus();
        });
        test.done();
    },

    testUnimplementedGetPublicKey: {
        tearDown: function(callback) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_ENCRYPTION] = false;
            callback();
        },

        testEncryptionSupported: function(test) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_ENCRYPTION] = true;
            test.throws(function() {
                testAutoscaleProvider.getPublicKey();
            });
            test.done();
        },

        testEncryptionNotSupported: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.getPublicKey();
            });
            test.done();
        }
    },

    testHasFeature: {
        setUp: function(callback) {
            testAutoscaleProvider.features = {};
            callback();
        },

        testHasFeature: function(test) {
            testAutoscaleProvider.features.FOO = true;
            test.expect(1);
            test.strictEqual(testAutoscaleProvider.hasFeature('FOO'), true);
            test.done();
        },

        testDoesNotHaveFeature: function(test) {
            test.expect(1);
            test.strictEqual(testAutoscaleProvider.hasFeature('FOO'), false);
            test.done();
        }
    },

    testUnimplementedPutMasterCredentials: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.putMasterCredentials();
        });
        test.done();
    },

    testUnimplementedPutPublicKey: {
        tearDown: function(callback) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_ENCRYPTION] = false;
            callback();
        },

        testEncryptionSupported: function(test) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_ENCRYPTION] = true;
            test.throws(function() {
                testAutoscaleProvider.putPublicKey();
            });
            test.done();
        },

        testEncryptionNotSupported: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.putPublicKey();
            });
            test.done();
        }
    },

    testUnimplementedGetNicsByTag: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.getNicsByTag();
            });
            test.done();
    },

    testUnimplementedGetVmsByTag: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.getVmsByTag();
            });
            test.done();
    },

    testUnimplementedIsValidMaster: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.isValidMaster();
        });
        test.done();
    },

    testUnimplementedMasterElected: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.masterElected();
        });
        test.done();
    },

    testUnimplementedMasterExpired: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.masterExpired();
        });
        test.done();
    },

    testUnimplementedMasterInvalidated: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.masterInvalidated();
        });
        test.done();
    },

    testUnimplementedGetStoredUcs: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.getStoredUcs();
        });
        test.done();
    },

    testUnimplementedPutInstance: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.putInstance();
        });
        test.done();
    },

    testUnimplementedSendMessage: {
        tearDown: function(callback) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.sendMessage();
            });
            test.done();
        },

        testMessagingSupported: function(test) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_MESSAGING] = true;
            test.throws(function() {
                testAutoscaleProvider.sendMessage();
            });
            test.done();
        }
    },

    testUnimplementedGetMessages: {
        tearDown: function(callback) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.getMessages();
            });
            test.done();
        },

        testMessagingSupported: function(test) {
            testAutoscaleProvider.features[AutoscaleProvider.FEATURE_MESSAGING] = true;
            test.throws(function() {
                testAutoscaleProvider.getMessages();
            });
            test.done();
        }
    },

    testUnimplementedSyncComplete: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.syncComplete();
        });
        test.done();
    },

    testIsInstanceExpired: {
        testExpired: function(test) {
            var instance = {
                lastUpdate: new Date(1970, 1, 1)
            };

            test.strictEqual(testAutoscaleProvider.isInstanceExpired(instance), true);
            test.done();
        },

        testNotExpired: function(test) {
            var instance = {
                lastUpdate: new Date()
            };

            test.strictEqual(testAutoscaleProvider.isInstanceExpired(instance), false);
            test.done();
        }
    },

    testRevokeLicenses: {
        setUp: function(callback) {
            bigIqMock = {
                init: function() {
                    return q();
                },
                revokeLicense: function(poolName, hostname) {
                    poolCalled = poolName;
                    instancesCalled.push(hostname);
                    return q();
                }
            };

            testAutoscaleProvider.bigIq = bigIqMock;
            instancesCalled = [];
            poolCalled = undefined;

            callback();
        },

        testBasic: function(test) {
            var instances = [
                {
                    hostname: 'host1'
                },
                {
                    hostname: 'host2'
                }
            ];
            var licensePool = 'myLicensePool';

            testAutoscaleProvider.clOptions = {
                licensePool: true,
                licensePoolName: licensePool
            };

            test.expect(2);
            testAutoscaleProvider.revokeLicenses(instances, {})
                .then(function() {
                    test.strictEqual(poolCalled, licensePool);
                    test.strictEqual(instancesCalled.length, instances.length);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNoLicensePool: function(test) {
            var instances = [
                {
                    hostname: 'host1'
                },
                {
                    hostname: 'host2'
                }
            ];

            testAutoscaleProvider.clOptions = {};

            test.expect(2);
            testAutoscaleProvider.revokeLicenses(instances, {})
                .then(function() {
                    test.strictEqual(poolCalled, undefined);
                    test.strictEqual(instancesCalled.length, 0);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};
