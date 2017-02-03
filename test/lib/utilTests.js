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

var fs = require('fs');
var util = require('../../../f5-cloud-libs').util;

var UTIL_ARGS_TEST_FILE = 'UTIL_ARGS_TEST_FILE';

var argv;

var getSavedArgs = function() {
    return fs.readFileSync('/tmp/rebootScripts/' + UTIL_ARGS_TEST_FILE + '.sh').toString();
};

module.exports = {
    testCsv: function(test) {
        test.deepEqual(util.csv("1,2,3", []), [["1", "2", "3"]]);
        test.deepEqual(util.csv("1, 2, 3 ", []), [["1", "2", "3"]]);
        test.deepEqual(util.csv("1, 2, 3", [["4", "5", "6"]]), [["4", "5", "6"], ["1", "2", "3"]]);

        test.done();
    },

    testGetPasswordFromUrl: function(test) {
        var password = 'foobar';
        var passwordFile = '/tmp/mypass';

        fs.writeFileSync(passwordFile, password, {encoding: 'ascii'});

        var readPassword = util.getPasswordFromUrl('file://' + passwordFile);
        test.strictEqual(readPassword, password);

        fs.unlinkSync(passwordFile);
        test.done();
    },

    testSaveArgs: {

        setUp: function(callback) {
            argv = ['node', 'utilTests.js', '--one', '--two', 'abc'];
            callback();
        },

        tearDown: function(callback) {
            fs.unlinkSync('/tmp/rebootScripts/' + UTIL_ARGS_TEST_FILE + '.sh');
            callback();
        },

        testBasic: function(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    var savedArgs = getSavedArgs();
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    test.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testStripArgsWithParam: function(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--two'])
                .then(function() {
                    var savedArgs = getSavedArgs();
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    test.strictEqual(savedArgs.indexOf('abc'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testStripArgsWithoutParam: function(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--one'])
                .then(function() {
                    var savedArgs = getSavedArgs();
                    test.strictEqual(savedArgs.indexOf('--one'), -1);
                    test.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

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
