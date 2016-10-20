/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
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
        test.strictEqual(util.versionCompare("12.1.0", "12.0.0-hf1"), 1);

        test.done();
    }
};
