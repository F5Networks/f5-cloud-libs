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
const assert = require('assert');
const CloudProvider = require('../../../f5-cloud-libs').cloudProvider;

describe('bigip tests', () => {
    util.inherits(TestCloudProvider, CloudProvider);
    function TestCloudProvider(options) {
        TestCloudProvider.super_.call(this, options);
    }

    // Our tests cause too many event listeners. Turn off the check.
    /* eslint-disable global-require */
    const options = require('commander');

    options.setMaxListeners(0);
    process.setMaxListeners(0);

    let instancesCalled = [];
    let testCloudProvider;
    let bigIqMock;
    let poolCalled;

    beforeEach(() => {
        testCloudProvider = new TestCloudProvider();
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('logger test', () => {
        const logger = {
            a: 1,
            b: 2
        };
        testCloudProvider = new TestCloudProvider({ logger });
        assert.deepStrictEqual(testCloudProvider.logger, logger);
    });

    it('cl options test', () => {
        const clOptions = {
            foo: 'bar',
            hello: 'world'
        };

        testCloudProvider = new TestCloudProvider({ clOptions });
        assert.deepStrictEqual(testCloudProvider.clOptions, clOptions);
    });

    it('init test', () => {
        return testCloudProvider.init()
            .then(() => {
                assert.ok(true);
            });
    });

    it('unimplemented bigip ready test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.bigIpReady();
        });
    });

    it('unimplemented get data from uri test', () => {
        assert.throws(() => {
            testCloudProvider.getDataFromUri();
        }, /Error: Unimplemented abstract method CloudProvider.getDataFromUri/);
    });

    it('unimplemented get instance id test', () => {
        assert.throws(() => {
            testCloudProvider.getInstanceId();
        }, /Error: Unimplemented abstract method CloudProvider.getInstanceId/);
    });

    it('unimplemented get instances test', () => {
        assert.throws(() => {
            testCloudProvider.getInstances();
        }, /Error: Unimplemented abstract method CloudProvider.getInstances/);
    });

    it('unimplemented elect primary test', () => {
        assert.throws(() => {
            testCloudProvider.electPrimary();
        }, /Error: Unimplemented abstract method CloudProvider.electPrimary/);
    });

    describe('unimplemented get primary credentials tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
        });

        it('messaging not supported test', () => {
            assert.throws(() => {
                testCloudProvider.getPrimaryCredentials();
            }, /Error: Unimplemented abstract method CloudProvider.getPrimaryCredentials/);
        });

        it('messaging supported test', () => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            return testCloudProvider.getPrimaryCredentials()
                .then((results) => {
                    assert.strictEqual(results, true);
                });
        });
    });

    it('unimplemented get primary status test', () => {
        return assert.doesNotThrow(() => {
            testCloudProvider.getPrimaryStatus();
        });
    });

    describe('unimplemented get primary credentials tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
        });

        it('encryption supported test', () => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            assert.throws(() => {
                testCloudProvider.getPublicKey();
            }, /Error: Unimplemented abstract method CloudProvider.getPublicKey/);
        });

        it('encryption not supported test', () => {
            // What is this testing?
            return testCloudProvider.getPublicKey()
                .then((res) => {
                    assert.strictEqual(res, true);
                });
        });
    });

    describe('unimplemented get public key tests', () => {
        it('encryption not supported test', () => {
            // What is this testing?
            return testCloudProvider.getPublicKey()
                .then((res) => {
                    assert.strictEqual(res, true);
                });
        });
    });

    describe('has feature tests', () => {
        beforeEach(() => {
            testCloudProvider.features = {};
        });

        it('has feature test', () => {
            testCloudProvider.features.FOO = true;
            assert.strictEqual(testCloudProvider.hasFeature('FOO'), true);
        });

        it('does not have feature test', () => {
            assert.strictEqual(testCloudProvider.hasFeature('FOO'), false);
        });
    });

    it('unimplemented put primary credentials test', () => {
        return assert.doesNotThrow(() => {
            testCloudProvider.putPrimaryCredentials();
        });
    });

    describe('unimplemented put public key tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
        });

        it('encryption supported test', () => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            assert.throws(() => {
                testCloudProvider.putPublicKey();
            }, /Error: Unimplemented abstract method CloudProvider.putPublicKey/);
        });

        it('encryption not supported test', () => {
            return testCloudProvider.putPublicKey()
                .then((res) => {
                    assert.strictEqual(res, true);
                });
        });
    });

    it('unimplemented get nics by tag test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.getNicsByTag();
        });
    });

    it('unimplemented get vms by tag test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.getVmsByTag();
        });
    });

    it('unimplemented is valid primary test', () => {
        return testCloudProvider.isValidPrimary()
            .then((r) => {
                assert.strictEqual(r, true);
            });
    });

    it('unimplemented primary elected test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.primaryElected();
        });
    });

    it('unimplemented primary invalidated test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.primaryInvalidated();
        });
    });

    it('unimplemented get Stored Ucs test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.getStoredUcs();
        });
    });

    it('unimplemented get Stored Object test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.deleteStoredObject();
        });
    });

    it('unimplemented store Ucs test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.storeUcs();
        });
    });

    it('unimplemented put Instance test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.putInstance();
        });
    });

    describe('unimplemented send message tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
        });

        it('messaging not supported test', () => {
            assert.doesNotThrow(() => {
                testCloudProvider.sendMessage();
            });
        });

        it('messaging supported test', () => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            assert.throws(() => {
                testCloudProvider.sendMessage();
            }, /Error: Unimplemented abstract method CloudProvider.sendMessage/);
        });
    });

    describe('unimplemented get message tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
        });

        it('messaging not supported test', () => {
            return testCloudProvider.getMessages()
                .then((r) => {
                    assert.strictEqual(r, true);
                });
        });

        it('messaging supported test', () => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            assert.throws(() => {
                testCloudProvider.getMessages();
            }, /Error: Unimplemented abstract method CloudProvider.getMessages/);
        });
    });

    it('unimplemented sync complete test', () => {
        return testCloudProvider.syncComplete()
            .then((r) => {
                assert.strictEqual(r, true);
            });
    });

    it('unimplemented get nodes by uri test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.getNodesFromUri();
        });
    });

    it('unimplemented get nodes by resource id test', () => {
        assert.doesNotThrow(() => {
            testCloudProvider.getNodesByResourceId();
        });
    });

    describe('is instance expired tests', () => {
        it('expired test', () => {
            const instance = {
                lastUpdate: new Date(1970, 1, 1)
            };

            assert.strictEqual(testCloudProvider.isInstanceExpired(instance), true);
        });

        it('not expired test', () => {
            const instance = {
                lastUpdate: new Date()
            };

            assert.strictEqual(testCloudProvider.isInstanceExpired(instance), false);
        });
    });

    describe('revoke licenses tests', () => {
        beforeEach(() => {
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
        });

        it('basic test', () => {
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

            return testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    assert.strictEqual(poolCalled, 'myLicensePool');
                    assert.strictEqual(instancesCalled.length, instances.length);
                });
        });

        it('no license pool test', () => {
            const instances = [
                {
                    hostname: 'host1'
                },
                {
                    hostname: 'host2'
                }
            ];

            testCloudProvider.clOptions = {};

            return testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    assert.strictEqual(poolCalled, undefined);
                    assert.strictEqual(instancesCalled.length, 0);
                });
        });

        it('revoke fail test', () => {
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

            return testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    assert.ok(false, 'Revoke should have thrown');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'foo');
                });
        });
    });
});

