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
var CloudProvider = require('../../../f5-cloud-libs').cloudProvider;

util.inherits(TestCloudProvider, CloudProvider);
function TestCloudProvider(options) {
    TestCloudProvider.super_.call(this, options);
}

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);
process.setMaxListeners(0);

var instancesCalled = [];
var testCloudProvider;
var bigIqMock;
var poolCalled;

module.exports = {
    setUp: function(callback) {
        testCloudProvider = new TestCloudProvider();
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
        testCloudProvider = new TestCloudProvider({logger: logger});
        test.deepEqual(testCloudProvider.logger, logger);
        test.done();
    },

    testClOptions: function(test) {
        var clOptions = {
            foo: 'bar',
            hello: 'world'
        };

        testCloudProvider = new TestCloudProvider({clOptions: clOptions});
        test.deepEqual(testCloudProvider.clOptions, clOptions);
        test.done();
    },

    testInit: function(test) {
        test.expect(1);
        testCloudProvider.init()
            .then(function() {
                test.ok(true);
                test.done();
            });
    },

    testUnimplementedBigIpReady: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.bigIpReady();
        });
        test.done();
    },

    testUnimplementedGetDataFromUri: function(test) {
        test.throws(function() {
            testCloudProvider.getDataFromUri();
        });
        test.done();
    },

    testUnimplementedGetInstanceId: function(test) {
        test.throws(function() {
            testCloudProvider.getInstanceId();
        });
        test.done();
    },

    testUnimplementedGetInstances: function(test) {
        test.throws(function() {
            testCloudProvider.getInstances();
        });
        test.done();
    },

    testUnimplementedElectMaster: function(test) {
        test.throws(function() {
            testCloudProvider.electMaster();
        });
        test.done();
    },

    testUnimplementedGetMasterCredentials: {
        tearDown: function(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported: function(test) {
            test.throws(function() {
                testCloudProvider.getMasterCredentials();
            });
            test.done();
        },

        testMessagingSupported: function(test) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            test.doesNotThrow(function() {
                testCloudProvider.getMasterCredentials();
            });
            test.done();
        }
    },

    testUnimplementedGetMasterStatus: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.getMasterStatus();
        });
        test.done();
    },

    testUnimplementedGetPublicKey: {
        tearDown: function(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
            callback();
        },

        testEncryptionSupported: function(test) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            test.throws(function() {
                testCloudProvider.getPublicKey();
            });
            test.done();
        },

        testEncryptionNotSupported: function(test) {
            test.doesNotThrow(function() {
                testCloudProvider.getPublicKey();
            });
            test.done();
        }
    },

    testHasFeature: {
        setUp: function(callback) {
            testCloudProvider.features = {};
            callback();
        },

        testHasFeature: function(test) {
            testCloudProvider.features.FOO = true;
            test.expect(1);
            test.strictEqual(testCloudProvider.hasFeature('FOO'), true);
            test.done();
        },

        testDoesNotHaveFeature: function(test) {
            test.expect(1);
            test.strictEqual(testCloudProvider.hasFeature('FOO'), false);
            test.done();
        }
    },

    testUnimplementedPutMasterCredentials: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.putMasterCredentials();
        });
        test.done();
    },

    testUnimplementedPutPublicKey: {
        tearDown: function(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
            callback();
        },

        testEncryptionSupported: function(test) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            test.throws(function() {
                testCloudProvider.putPublicKey();
            });
            test.done();
        },

        testEncryptionNotSupported: function(test) {
            test.doesNotThrow(function() {
                testCloudProvider.putPublicKey();
            });
            test.done();
        }
    },

    testUnimplementedGetNicsByTag: function(test) {
            test.doesNotThrow(function() {
                testCloudProvider.getNicsByTag();
            });
            test.done();
    },

    testUnimplementedGetVmsByTag: function(test) {
            test.doesNotThrow(function() {
                testCloudProvider.getVmsByTag();
            });
            test.done();
    },

    testUnimplementedIsValidMaster: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.isValidMaster();
        });
        test.done();
    },

    testUnimplementedMasterElected: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.masterElected();
        });
        test.done();
    },

    testUnimplementedMasterInvalidated: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.masterInvalidated();
        });
        test.done();
    },

    testUnimplementedGetStoredUcs: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.getStoredUcs();
        });
        test.done();
    },

    testUnimplementedStoreUcs: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.storeUcs();
        });
        test.done();
    },

    testUnimplementedPutInstance: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.putInstance();
        });
        test.done();
    },

    testUnimplementedSendMessage: {
        tearDown: function(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported: function(test) {
            test.doesNotThrow(function() {
                testCloudProvider.sendMessage();
            });
            test.done();
        },

        testMessagingSupported: function(test) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            test.throws(function() {
                testCloudProvider.sendMessage();
            });
            test.done();
        }
    },

    testUnimplementedGetMessages: {
        tearDown: function(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported: function(test) {
            test.doesNotThrow(function() {
                testCloudProvider.getMessages();
            });
            test.done();
        },

        testMessagingSupported: function(test) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            test.throws(function() {
                testCloudProvider.getMessages();
            });
            test.done();
        }
    },

    testUnimplementedSyncComplete: function(test) {
        test.doesNotThrow(function() {
            testCloudProvider.syncComplete();
        });
        test.done();
    },

    testIsInstanceExpired: {
        testExpired: function(test) {
            var instance = {
                lastUpdate: new Date(1970, 1, 1)
            };

            test.strictEqual(testCloudProvider.isInstanceExpired(instance), true);
            test.done();
        },

        testNotExpired: function(test) {
            var instance = {
                lastUpdate: new Date()
            };

            test.strictEqual(testCloudProvider.isInstanceExpired(instance), false);
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

            testCloudProvider.bigIq = bigIqMock;
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

            testCloudProvider.clOptions = {
                licensePool: true,
                licensePoolName: licensePool
            };

            test.expect(2);
            testCloudProvider.revokeLicenses(instances, {})
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

            testCloudProvider.clOptions = {};

            test.expect(2);
            testCloudProvider.revokeLicenses(instances, {})
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
        },

        testRevokeFail: function(test) {
            var instances = [
                {
                    hostname: 'host1'
                },
                {
                    hostname: 'host2'
                }
            ];
            var licensePool = 'myLicensePool';

            testCloudProvider.clOptions = {
                licensePool: true,
                licensePoolName: licensePool
            };

            bigIqMock.revokeLicense = function(poolName, hostname) {
                return q.reject(new Error('foo'));
            }

            test.expect(1);
            testCloudProvider.revokeLicenses(instances, {})
                .then(function() {
                    test.ok(false, 'Revoke should have thrown');
                })
                .catch(function(err) {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};
