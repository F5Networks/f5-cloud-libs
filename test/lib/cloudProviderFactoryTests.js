/**
 * Copyright 2018 F5 Networks, Inc.
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

const Module = require('module');
const path = require('path');
const cloudProviderFactory = require('../../../f5-cloud-libs').cloudProviderFactory;

let realResolve;
let constructorCalled;
let calledPath;

module.exports = {
    setUp(callback) {
        // eslint-disable-next-line no-underscore-dangle
        realResolve = Module._resolveFilename;
        constructorCalled = false;

        // eslint-disable-next-line no-underscore-dangle
        Module._resolveFilename = function _resolveFilename() {
            calledPath = arguments[0];
            return calledPath;
        };
        callback();
    },

    tearDown(callback) {
        // eslint-disable-next-line no-underscore-dangle
        Module._resolveFilename = realResolve;
        callback();
    },

    testSupported: (test) => {
        const providerName = 'foo';
        const requestedFile = path.normalize(`${__dirname}/../../../f5-cloud-libs-${providerName}/index.js`);

        // eslint-disable-next-line no-underscore-dangle
        Module._resolveFilename = () => {
            return requestedFile;
        };

        test.expect(2);
        require.cache[requestedFile] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };
        test.doesNotThrow(() => {
            cloudProviderFactory.getCloudProvider(providerName);
        });
        test.ok(constructorCalled, 'constructor was not called');
        test.done();
    },

    testMatchAzureStorage(test) {
        const expectedPath = '../../f5-cloud-libs-azure';
        require.cache[expectedPath] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };

        test.expect(3);
        test.doesNotThrow(() => {
            const matchOptions = {
                storageUri: 'https://testing.blob.core.windows.net/container/file.text'
            };
            cloudProviderFactory.getCloudProvider(null, {}, matchOptions);
        });
        test.ok(constructorCalled, 'constructor was not called');
        test.strictEqual(calledPath, expectedPath);
        test.done();
    },

    testMatchAWSStorage(test) {
        const expectedPath = '../../f5-cloud-libs-aws';
        require.cache[expectedPath] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };

        test.expect(3);
        test.doesNotThrow(() => {
            const matchOptions = {
                storageUri: 'arn:::foo:bar/password'
            };
            cloudProviderFactory.getCloudProvider(null, {}, matchOptions);
        });
        test.ok(constructorCalled, 'constructor was not called');
        test.strictEqual(calledPath, expectedPath);
        test.done();
    },

    testMatchGCEStorage(test) {
        const expectedPath = '../../f5-cloud-libs-gce';
        require.cache[expectedPath] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };

        test.expect(3);
        test.doesNotThrow(() => {
            const matchOptions = {
                storageUri: 'gs://myBucket/myFilename'
            };
            cloudProviderFactory.getCloudProvider(null, {}, matchOptions);
        });
        test.ok(constructorCalled, 'constructor was not called');
        test.strictEqual(calledPath, expectedPath);
        test.done();
    },

    testNotSupported(test) {
        test.expect(1);
        test.throws(() => {
            cloudProviderFactory.getCloudProvider('bar');
        });
        test.done();
    }
};
