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
var ipc = require('../../../f5-cloud-libs').ipc;

const SIGNAL_BASE_PATH = '/tmp/f5-cloud-libs-signals/';

var checkSignaled = function(expected, test) {
    test.strictEqual(signaled, expected);
    test.done();
};
var signaled;

module.exports = {
    setUp: function(callback) {
        signaled = 0;
        callback();
    },

    tearDown: function(callback) {
        try {
            ipc.clearSignals();
        }
        catch (err) {
            console.log(err);
        }
        callback();
    },

    testOnce: {
        testBasic: function(test) {
            test.expect(2);

            ipc.once('foo')
                .then(function() {
                    signaled++;
                });

            test.strictEqual(signaled, 0);
            ipc.send('foo');
            ipc.send('foo');
            setTimeout(checkSignaled, 1100, 1, test);
        },

        testTwice: function(test) {
            test.expect(2);

            ipc.once('foo')
                .then(function() {
                    signaled++;
                });
            ipc.once('foo')
                .then(function() {
                    signaled++;
                });

            test.strictEqual(signaled, 0);
            ipc.send('foo');
            ipc.send('foo');
            setTimeout(checkSignaled, 1100, 2, test);
        },

        testError: function(test) {
            var existsSync = fs.existsSync;
            fs.existsSync = function() {
                throw new Error('foo');
            };

            try {
                ipc.once('foo');
                test.ok(false, 'once should have thrown');
            }
            catch (err) {
                test.done();
            }
            finally {
                fs.existsSync = existsSync;
            }
        }
    },

    testSend: {
        testBasic: function(test) {
            ipc.send('foo');
            test.strictEqual(fs.existsSync(SIGNAL_BASE_PATH + 'foo'), true);
            test.done();
        },

        testError: function(test) {
            var closeSync = fs.closeSync;
            fs.closeSync = function() {
                throw new Error('foo');
            };

            try {
                ipc.send('foo');
                test.ok(false, 'send should have thrown');
            }
            catch (err) {
                test.done();
            }
            finally {
                fs.closeSync = closeSync;
            }
        }
    },

    testClearSignals: {
        testBasic: function(test) {
            ipc.send('foo');
            test.strictEqual(fs.existsSync('/tmp/f5-cloud-libs-signals/foo'), true);
            ipc.clearSignals();
            test.strictEqual(fs.existsSync('/tmp/f5-cloud-libs-signals/foo'), false);
            test.done();
        },

        testError: function(test) {
            var readdirSync = fs.readdirSync;
            fs.readdirSync = function() {
                throw new Error('foo');
            };
            try {
                ipc.clearSignals();
                test.ok(false, 'clearSignals should have thrown');
            }
            catch (err) {
                test.done();
            }
            finally {
                fs.readdirSync = readdirSync;
            }
        }
    },

    testDirCreated: {
        setUp: function(callback) {
            if (fs.existsSync(SIGNAL_BASE_PATH)) {
                fs.rmdirSync(SIGNAL_BASE_PATH);
            }
            callback();
        },

        testOnSend: function(test) {
            ipc.send('foo');
            test.strictEqual(fs.existsSync(SIGNAL_BASE_PATH), true);
            test.done();
        },

        testOnOnce: function(test) {
            ipc.once('foo');
            test.strictEqual(fs.existsSync(SIGNAL_BASE_PATH), true);
            test.done();
        }
    },

    testSetLogger: function(test) {
        test.doesNotThrow(function() {
            ipc.setLogger({});
        });
        test.done();
    },

    testSetLoggerOptions: function(test) {
        test.doesNotThrow(function() {
            ipc.setLoggerOptions({});
        });
        test.done();
    }
};
