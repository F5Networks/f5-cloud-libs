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

    it('logger test', (done) => {
        const logger = {
            a: 1,
            b: 2
        };
        testCloudProvider = new TestCloudProvider({ logger });
        assert.deepEqual(testCloudProvider.logger, logger);
        done();
    });

    it('cl options test', (done) => {
        const clOptions = {
            foo: 'bar',
            hello: 'world'
        };

        testCloudProvider = new TestCloudProvider({ clOptions });
        assert.deepEqual(testCloudProvider.clOptions, clOptions);
        done();
    });

    it('init test', (done) => {
        testCloudProvider.init()
            .then(() => {
                assert.ok(true);
                done();
            });
    });

    it('unimplemented bigip ready test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.bigIpReady();
        });
        done();
    });

    it('unimplemented get data from uri test', (done) => {
        assert.throws(() => {
            testCloudProvider.getDataFromUri();
        });
        done();
    });

    it('unimplemented get instance id test', (done) => {
        assert.throws(() => {
            testCloudProvider.getInstanceId();
        });
        done();
    });

    it('unimplemented get instances test', (done) => {
        assert.throws(() => {
            testCloudProvider.getInstances();
        });
        done();
    });

    it('unimplemented elect primary test', (done) => {
        assert.throws(() => {
            testCloudProvider.electPrimary();
        });
        done();
    });

    describe('unimplemented get primary credentials tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
        });

        it('messaging not supported test', (done) => {
            assert.throws(() => {
                testCloudProvider.getPrimaryCredentials();
            });
            done();
        });

        it('messaging supported test', (done) => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            assert.doesNotThrow(() => {
                testCloudProvider.getPrimaryCredentials();
            });
            done();
        });
    });

    it('unimplemented get primary status test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.getPrimaryStatus();
        });
        done();
    });

    describe('unimplemented get primary credentials tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
        });

        it('encryption supported test', (done) => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            assert.throws(() => {
                testCloudProvider.getPublicKey();
            });
            done();
        });

        it('encryption not supported test', (done) => {
            assert.doesNotThrow(() => {
                testCloudProvider.getPublicKey();
            });
            done();
        });
    });

    describe('unimplemented get public key tests', () => {
        it('encryption not supported test', (done) => {
            assert.doesNotThrow(() => {
                testCloudProvider.getPublicKey();
            });
            done();
        });
    });

    describe('has feature tests', () => {
        beforeEach(() => {
            testCloudProvider.features = {};
        });

        it('has feature test', (done) => {
            testCloudProvider.features.FOO = true;
            assert.strictEqual(testCloudProvider.hasFeature('FOO'), true);
            done();
        });

        it('does not have feature test', (done) => {
            assert.strictEqual(testCloudProvider.hasFeature('FOO'), false);
            done();
        });
    });

    it('unimplemented put primary credentials test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.putPrimaryCredentials();
        });
        done();
    });

    describe('unimplemented put public key tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = false;
        });

        it('encryption supported test', (done) => {
            testCloudProvider.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            assert.throws(() => {
                testCloudProvider.putPublicKey();
            });
            done();
        });

        it('encryption not supported test', (done) => {
            assert.doesNotThrow(() => {
                testCloudProvider.putPublicKey();
            });
            done();
        });
    });

    it('unimplemented get nics by tag test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.getNicsByTag();
        });
        done();
    });

    it('unimplemented get vms by tag test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.getVmsByTag();
        });
        done();
    });

    it('unimplemented is valid primary test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.isValidPrimary();
        });
        done();
    });

    it('unimplemented primary elected test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.primaryElected();
        });
        done();
    });

    it('unimplemented primary invalidated test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.primaryInvalidated();
        });
        done();
    });

    it('unimplemented get Stored Ucs test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.getStoredUcs();
        });
        done();
    });

    it('unimplemented store Ucs test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.storeUcs();
        });
        done();
    });

    it('unimplemented put Instance test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.putInstance();
        });
        done();
    });

    describe('unimplemented send message tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
        });

        it('messaging not supported test', (done) => {
            assert.doesNotThrow(() => {
                testCloudProvider.sendMessage();
            });
            done();
        });

        it('messaging supported test', (done) => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            assert.throws(() => {
                testCloudProvider.sendMessage();
            });
            done();
        });
    });

    describe('unimplemented get message tests', () => {
        afterEach(() => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = false;
        });

        it('messaging not supported test', (done) => {
            assert.doesNotThrow(() => {
                testCloudProvider.getMessages();
            });
            done();
        });

        it('messaging supported test', (done) => {
            testCloudProvider.features[CloudProvider.FEATURE_MESSAGING] = true;
            assert.throws(() => {
                testCloudProvider.getMessages();
            });
            done();
        });
    });

    it('unimplemented sync complete test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.syncComplete();
        });
        done();
    });

    it('unimplemented get nodes by uri test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.getNodesFromUri();
        });
        done();
    });

    it('unimplemented get nodes by resource id test', (done) => {
        assert.doesNotThrow(() => {
            testCloudProvider.getNodesByResourceId();
        });
        done();
    });

    describe('is instance expired tests', () => {
        it('expired test', (done) => {
            const instance = {
                lastUpdate: new Date(1970, 1, 1)
            };

            assert.strictEqual(testCloudProvider.isInstanceExpired(instance), true);
            done();
        });

        it('not expired test', (done) => {
            const instance = {
                lastUpdate: new Date()
            };

            assert.strictEqual(testCloudProvider.isInstanceExpired(instance), false);
            done();
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

        it('basic test', (done) => {
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

            testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    assert.strictEqual(poolCalled, licensePool);
                    assert.strictEqual(instancesCalled.length, instances.length);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('no license pool test', (done) => {
            const instances = [
                {
                    hostname: 'host1'
                },
                {
                    hostname: 'host2'
                }
            ];

            testCloudProvider.clOptions = {};

            testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    assert.strictEqual(poolCalled, undefined);
                    assert.strictEqual(instancesCalled.length, 0);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('revoke fail test', (done) => {
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

            testCloudProvider.revokeLicenses(instances, {})
                .then(() => {
                    assert.ok(false, 'Revoke should have thrown');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });
    });
});

