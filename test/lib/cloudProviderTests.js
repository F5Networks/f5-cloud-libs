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
const util = require('util');
const CloudProvider = require('../../../f5-cloud-libs').cloudProvider;

util.inherits(TestCloudProvider, CloudProvider);
function TestCloudProvider(options) {
    TestCloudProvider.super_.call(this, options);
}

// Our tests cause too many event listeners. Turn off the check.
const options = require('commander');

options.setMaxListeners(0);
process.setMaxListeners(0);

let instancesCalled = [];
let testCloudProvider;
let bigIqMock;
let poolCalled;

module.exports = {
    setUp(callback) {
        testCloudProvider = new TestCloudProvider();
        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        callback();
    },

    testLogger(test) {
        const logger = {
            a: 1,
            b: 2
        };
        testCloudProvider = new TestCloudProvider({ logger });
        test.deepEqual(testCloudProvider.logger, logger);
        test.done();
    },

    testClOptions(test) {
        const clOptions = {
            foo: 'bar',
            hello: 'world'
        };

        testCloudProvider = new TestCloudProvider({ clOptions });
        test.deepEqual(testCloudProvider.clOptions, clOptions);
        test.done();
    },

    testInit(test) {
        test.expect(1);
        testCloudProvider.init()
            .then(() => {
                test.ok(true);
                test.done();
            });
    },

    testUnimplementedBigIpReady(test) {
        test.doesNotThrow(() => {
            testCloudProvider.bigIpReady();
        });
        test.done();
    },

    testUnimplementedGetDataFromUri(test) {
        test.throws(() => {
            testCloudProvider.getDataFromUri();
        });
        test.done();
    },

    testUnimplementedGetInstanceId(test) {
        test.throws(() => {
            testCloudProvider.getInstanceId();
        });
        test.done();
    },

    testUnimplementedGetInstances(test) {
        test.throws(() => {
            testCloudProvider.getInstances();
        });
        test.done();
    },

    testUnimplementedElectMaster(test) {
        test.throws(() => {
            testCloudProvider.electMaster();
        });
        test.done();
    },

    testUnimplementedGetMasterCredentials: {
        tearDown(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported(test) {
            test.throws(() => {
                testCloudProvider.getMasterCredentials();
            });
            test.done();
        },

        testMessagingSupported(test) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            test.doesNotThrow(() => {
                testCloudProvider.getMasterCredentials();
            });
            test.done();
        }
    },

    testUnimplementedGetMasterStatus(test) {
        test.doesNotThrow(() => {
            testCloudProvider.getMasterStatus();
        });
        test.done();
    },

    testUnimplementedGetPublicKey: {
        tearDown(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
            callback();
        },

        testEncryptionSupported(test) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            test.throws(() => {
                testCloudProvider.getPublicKey();
            });
            test.done();
        },

        testEncryptionNotSupported(test) {
            test.doesNotThrow(() => {
                testCloudProvider.getPublicKey();
            });
            test.done();
        }
    },

    testHasFeature: {
        setUp(callback) {
            testCloudProvider.features = {};
            callback();
        },

        testHasFeature(test) {
            testCloudProvider.features.FOO = true;
            test.expect(1);
            test.strictEqual(testCloudProvider.hasFeature('FOO'), true);
            test.done();
        },

        testDoesNotHaveFeature(test) {
            test.expect(1);
            test.strictEqual(testCloudProvider.hasFeature('FOO'), false);
            test.done();
        }
    },

    testUnimplementedPutMasterCredentials(test) {
        test.doesNotThrow(() => {
            testCloudProvider.putMasterCredentials();
        });
        test.done();
    },

    testUnimplementedPutPublicKey: {
        tearDown(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
            callback();
        },

        testEncryptionSupported(test) {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            test.throws(() => {
                testCloudProvider.putPublicKey();
            });
            test.done();
        },

        testEncryptionNotSupported(test) {
            test.doesNotThrow(() => {
                testCloudProvider.putPublicKey();
            });
            test.done();
        }
    },

    testUnimplementedGetNicsByTag(test) {
        test.doesNotThrow(() => {
            testCloudProvider.getNicsByTag();
        });
        test.done();
    },

    testUnimplementedGetVmsByTag(test) {
        test.doesNotThrow(() => {
            testCloudProvider.getVmsByTag();
        });
        test.done();
    },

    testUnimplementedIsValidMaster(test) {
        test.doesNotThrow(() => {
            testCloudProvider.isValidMaster();
        });
        test.done();
    },

    testUnimplementedMasterElected(test) {
        test.doesNotThrow(() => {
            testCloudProvider.masterElected();
        });
        test.done();
    },

    testUnimplementedMasterInvalidated(test) {
        test.doesNotThrow(() => {
            testCloudProvider.masterInvalidated();
        });
        test.done();
    },

    testUnimplementedGetStoredUcs(test) {
        test.doesNotThrow(() => {
            testCloudProvider.getStoredUcs();
        });
        test.done();
    },

    testUnimplementedStoreUcs(test) {
        test.doesNotThrow(() => {
            testCloudProvider.storeUcs();
        });
        test.done();
    },

    testUnimplementedPutInstance(test) {
        test.doesNotThrow(() => {
            testCloudProvider.putInstance();
        });
        test.done();
    },

    testUnimplementedSendMessage: {
        tearDown(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported(test) {
            test.doesNotThrow(() => {
                testCloudProvider.sendMessage();
            });
            test.done();
        },

        testMessagingSupported(test) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            test.throws(() => {
                testCloudProvider.sendMessage();
            });
            test.done();
        }
    },

    testUnimplementedGetMessages: {
        tearDown(callback) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
            callback();
        },

        testMessagingNotSupported(test) {
            test.doesNotThrow(() => {
                testCloudProvider.getMessages();
            });
            test.done();
        },

        testMessagingSupported(test) {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            test.throws(() => {
                testCloudProvider.getMessages();
            });
            test.done();
        }
    },

    testUnimplementedSyncComplete(test) {
        test.doesNotThrow(() => {
            testCloudProvider.syncComplete();
        });
        test.done();
    },

    testUnimplementedGetNodesByUri(test) {
        test.doesNotThrow(() => {
            testCloudProvider.getNodesFromUri();
        });
        test.done();
    },

    testIsInstanceExpired: {
        testExpired(test) {
            const instance = {
                lastUpdate: new Date(1970, 1, 1)
            };

            test.strictEqual(testCloudProvider.isInstanceExpired(instance), true);
            test.done();
        },

        testNotExpired(test) {
            const instance = {
                lastUpdate: new Date()
            };

            test.strictEqual(testCloudProvider.isInstanceExpired(instance), false);
            test.done();
        }
    },

    testRevokeLicenses: {
        setUp(callback) {
            bigIqMock = {
                init() {
                    return q();
                },
                revokeLicense(poolName, hostname) {
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

        testBasic(test) {
            const instances = [
                {
                    hostname: 'host1'
                },
                {
                    hostname: 'host2'
                }
            ];
            const licensePool = 'myLicensePool';

            testCloudProvider.clOptions = {
                licensePool: true,
                licensePoolName: licensePool
            };

            test.expect(2);
            testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    test.strictEqual(poolCalled, licensePool);
                    test.strictEqual(instancesCalled.length, instances.length);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoLicensePool(test) {
            const instances = [
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
                .then(() => {
                    test.strictEqual(poolCalled, undefined);
                    test.strictEqual(instancesCalled.length, 0);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRevokeFail(test) {
            const instances = [
                {
                    hostname: 'host1'
                },
                {
                    hostname: 'host2'
                }
            ];
            const licensePool = 'myLicensePool';

            testCloudProvider.clOptions = {
                licensePool: true,
                licensePoolName: licensePool
            };

            bigIqMock.revokeLicense = () => {
                return q.reject(new Error('foo'));
            };

            test.expect(1);
            testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    test.ok(false, 'Revoke should have thrown');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
