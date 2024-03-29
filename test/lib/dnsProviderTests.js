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

const util = require('util');
const assert = require('assert');
const DnsProvider = require('../../../f5-cloud-libs').dnsProvider;

util.inherits(TestDnsProvider, DnsProvider);
function TestDnsProvider(options) {
    TestDnsProvider.super_.call(this, options);
}

// Our tests cause too many event listeners. Turn off the check.
process.setMaxListeners(0);

describe('DNS Provider Unit Tests', () => {
    let testDnsProvider;

    beforeEach(() => {
        testDnsProvider = new TestDnsProvider();
    });


    it('should init', () => {
        return testDnsProvider.init();
    });

    it('should fail for update', () => {
        assert.throws(() => {
            testDnsProvider.update();
        }, /Error: Unimplemented abstract method DnsProvider.update/);
    });
});
