/**
 * Copyright 2017-2018 F5 Networks, Inc.
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

const assert = require('assert');

const sharedConstants = require('../../lib/sharedConstants');

const bigIqLicenseProviderFactory = require('../../lib/bigIqLicenseProviderFactory');

describe('BIGIQ License Provider Factory Unit Tests', () => {
    describe('Tests by version', () => {
        it('should work for version 5.0.0', () => {
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.0.0');
            assert.strictEqual(provider.constructor.name, 'BigIq50LicenseProvider');
        });
        it('should work for version 5.2.0', () => {
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.2.0');
            assert.strictEqual(provider.constructor.name, 'BigIq52LicenseProvider');
        });
        it('should work for version 5.3.0', () => {
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.3.0');
            assert.strictEqual(provider.constructor.name, 'BigIq53LicenseProvider');
        });
        it('should work for version 5.4.0', () => {
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.4.0');
            assert.strictEqual(provider.constructor.name, 'BigIq54LicenseProvider');
        });
        it('should not work for pre 5.0.0', (done) => {
            try {
                bigIqLicenseProviderFactory.getLicenseProviderByVersion('4.9.0');
                assert.ok(false, 'pre 5.2 should have thrown');
            } catch (err) {
                assert.ok(true);
            } finally {
                done();
            }
        });
    });
    describe('Tests by type', () => {
        it('should work when type set to utility', (done) => {
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByType(
                sharedConstants.LICENSE_API_TYPES.UTILITY
            );
            assert.strictEqual(provider.constructor.name, 'BigIq53LicenseProvider');
            done();
        });
        it('should work when type set to utility unreachable', (done) => {
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByType(
                sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE
            );
            assert.strictEqual(provider.constructor.name, 'BigIq54LicenseProvider');
            done();
        });
        it('should fail for bad type', (done) => {
            try {
                bigIqLicenseProviderFactory.getLicenseProviderByType('foo');
                assert.ok(false, 'bad api type should have thrown');
            } catch (err) {
                assert.ok(true);
            } finally {
                done();
            }
        });
    });
});
