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

const path = require('path');
const assert = require('assert');
const Module = require('module');
const cloudProviderFactory = require('../../../f5-cloud-libs').cloudProviderFactory;

describe('Cloud Provider Factory Unit Tests', () => {
    let realResolve;
    let constructorCalled;
    let calledPath;

    beforeEach(() => {
        // eslint-disable-next-line no-underscore-dangle
        realResolve = Module._resolveFilename;
        constructorCalled = false;

        // eslint-disable-next-line no-underscore-dangle
        Module._resolveFilename = function _resolveFilename() {
            calledPath = arguments[0];
            return calledPath;
        };
    });

    afterEach(() => {
        // eslint-disable-next-line no-underscore-dangle
        Module._resolveFilename = realResolve;
    });

    it('should only work for supported providers', (done) => {
        const providerName = 'foo';
        const requestedFile = path.normalize(`${__dirname}/../../../f5-cloud-libs-${providerName}/index.js`);

        // eslint-disable-next-line no-underscore-dangle
        Module._resolveFilename = () => {
            return requestedFile;
        };

        require.cache[requestedFile] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };
        assert(cloudProviderFactory.getCloudProvider(providerName));
        assert.ok(constructorCalled, 'constructor was not called');
        done();
    });

    it('should match azure storage', (done) => {
        const expectedPath = '../../f5-cloud-libs-azure';
        require.cache[expectedPath] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };

        const matchOptions = {
            storageUri: 'https://testing.blob.core.windows.net/container/file.text'
        };
        cloudProviderFactory.getCloudProvider(null, {}, matchOptions);

        assert.ok(constructorCalled, 'constructor was not called');
        assert.strictEqual(calledPath, expectedPath);
        done();
    });

    it('should match aws storage', (done) => {
        const expectedPath = '../../f5-cloud-libs-aws';
        require.cache[expectedPath] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };
        const matchOptions = {
            storageUri: 'arn:::foo:bar/password'
        };
        cloudProviderFactory.getCloudProvider(null, {}, matchOptions);

        assert.ok(constructorCalled, 'constructor was not called');
        assert.strictEqual(calledPath, expectedPath);
        done();
    });

    it('should match gce storage', (done) => {
        const expectedPath = '../../f5-cloud-libs-gce';
        require.cache[expectedPath] = {
            exports: {
                provider: function provider() {
                    constructorCalled = true;
                }
            }
        };

        const matchOptions = {
            storageUri: 'gs://myBucket/myFilename'
        };
        cloudProviderFactory.getCloudProvider(null, {}, matchOptions);

        assert.ok(constructorCalled, 'constructor was not called');
        assert.strictEqual(calledPath, expectedPath);
        done();
    });

    it('should not work for unsupported cloud providers', (done) => {
        assert.throws(() => {
            cloudProviderFactory.getCloudProvider('bar');
        });
        done();
    });
});
