/**
 * Copyright 2016 F5 Networks, Inc.
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

var util = require('../../lib/util');

module.exports = {
    testVersionCompare: function(test) {
        test.strictEqual(util.versionCompare("1.7.1", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.7.2", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.6.1", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.6.20", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.7.1", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.7", "1.7.0"), -1);
        test.strictEqual(util.versionCompare("1.7", "1.8.0"), -1);
        test.strictEqual(util.versionCompare("1.7.2", "1.7.10b"), -1);

        test.strictEqual(util.versionCompare("1.7.10", "1.7.1"), 1);
        test.strictEqual(util.versionCompare("1.7.10", "1.6.1"), 1);
        test.strictEqual(util.versionCompare("1.7.10", "1.6.20"), 1);
        test.strictEqual(util.versionCompare("1.7.0", "1.7"), 1);
        test.strictEqual(util.versionCompare("1.8.0", "1.7"), 1);

        test.strictEqual(util.versionCompare("1.7.10", "1.7.10"), 0);
        test.strictEqual(util.versionCompare("1.7", "1.7"), 0);
        test.strictEqual(util.versionCompare("1.7", "1.7.0", {zeroExtend: true}), 0);

        test.strictEqual(util.versionCompare("1.3-dev1", "1.3-dev1"), 0);
        test.strictEqual(util.versionCompare("1.3-dev1", "1.3-dev2"), -1);
        test.strictEqual(util.versionCompare("1.3-dev19", "1.3-dev2"), 1);

        test.strictEqual(util.versionCompare("12.0.0-hf1", "12.0.0-hf2"), -1);
        test.strictEqual(util.versionCompare("12.0.1-hf1", "12.0.0-hf3"), 1);

        test.done();
    }
};
