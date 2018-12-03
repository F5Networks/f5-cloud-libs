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

const sharedConstants = require('../../lib/sharedConstants');

const bigIqLicenseProviderFactory = require('../../lib/bigIqLicenseProviderFactory');

module.exports = {
    testByVersion: {
        test50(test) {
            test.expect(1);
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.0.0');
            test.strictEqual(provider.constructor.name, 'BigIq50LicenseProvider');
            test.done();
        },

        test52(test) {
            test.expect(1);
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.2.0');
            test.strictEqual(provider.constructor.name, 'BigIq52LicenseProvider');
            test.done();
        },

        test53(test) {
            test.expect(1);
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.3.0');
            test.strictEqual(provider.constructor.name, 'BigIq53LicenseProvider');
            test.done();
        },

        test54(test) {
            test.expect(1);
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByVersion('5.4.0');
            test.strictEqual(provider.constructor.name, 'BigIq54LicenseProvider');
            test.done();
        },

        testPre50(test) {
            test.expect(1);
            try {
                bigIqLicenseProviderFactory.getLicenseProviderByVersion('4.9.0');
                test.ok(false, 'pre 5.2 should have thrown');
            } catch (err) {
                test.ok(true);
            } finally {
                test.done();
            }
        }
    },

    testByType: {
        testRegKey(test) {
            test.expect(1);
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByType(
                sharedConstants.LICENSE_API_TYPES.REG_KEY
            );
            test.strictEqual(provider.constructor.name, 'BigIq52LicenseProvider');
            test.done();
        },

        testUtility(test) {
            test.expect(1);
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByType(
                sharedConstants.LICENSE_API_TYPES.UTILITY
            );
            test.strictEqual(provider.constructor.name, 'BigIq53LicenseProvider');
            test.done();
        },

        testUtilityUnreachable(test) {
            test.expect(1);
            const provider = bigIqLicenseProviderFactory.getLicenseProviderByType(
                sharedConstants.LICENSE_API_TYPES.UTILITY_UNREACHABLE
            );
            test.strictEqual(provider.constructor.name, 'BigIq54LicenseProvider');
            test.done();
        },

        testBadType(test) {
            test.expect(1);
            try {
                bigIqLicenseProviderFactory.getLicenseProviderByType('foo');
                test.ok(false, 'bad api type should have thrown');
            } catch (err) {
                test.ok(true);
            } finally {
                test.done();
            }
        }
    }
};
