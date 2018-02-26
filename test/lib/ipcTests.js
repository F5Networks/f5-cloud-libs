/**
 * Copyright 2016-2017 F5 Networks, Inc.
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
var util = require('../../../f5-cloud-libs').util;

const existsSync = fs.existsSync;
const closeSync = fs.closeSync;
const readdirSync = fs.readdirSync;

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
        fs.readdirSync = readdirSync;
        fs.closeSync = closeSync;
        fs.existsSync = existsSync;
        ipc.clearSignals();
        util.removeDirectorySync(ipc.signalBasePath);
        callback();
    },

    testOnce: {
        testBasic: function(test) {
            ipc.once('foo')
                .then(function() {
                    signaled++;
                });

            test.expect(2);
            test.strictEqual(signaled, 0);
            ipc.send('foo');
            ipc.send('foo');
            setTimeout(checkSignaled, 1100, 1, test);
        },

        testTwice: function(test) {
            ipc.once('foo')
                .then(function() {
                    signaled++;
                });
            ipc.once('foo')
                .then(function() {
                    signaled++;
                });

            test.expect(2);
            test.strictEqual(signaled, 0);
            ipc.send('foo');
            ipc.send('foo');
            setTimeout(checkSignaled, 1100, 2, test);
        },

        testError: function(test) {
            const message = 'existsSync error';
            fs.existsSync = function() {
                throw new Error(message);
            };

            test.expect(1);
            try {
                ipc.once('foo');
                test.ok(false, 'once should have thrown');
            }
            catch (err) {
                test.strictEqual(err.message, message);
            }
            finally {
                test.done();
            }
        }
    },

    testSend: {
        testBasic: function(test) {
            ipc.send('foo');
            test.strictEqual(fs.existsSync(ipc.signalBasePath + 'foo'), true);
            test.done();
        },

        testError: function(test) {
            const message = 'closeSync error';
            fs.closeSync = function() {
                throw new Error(message);
            };

            test.expect(1);
            try {
                ipc.send('foo');
                test.ok(false, 'send should have thrown');
            }
            catch (err) {
                test.strictEqual(err.message, message);
            }
            finally {
                test.done();
            }
        }
    },

    testClearSignals: {
        testBasic: function(test) {
            test.expect(2);
            ipc.send('foo');
            test.strictEqual(fs.existsSync('/tmp/f5-cloud-libs-signals/foo'), true);
            ipc.clearSignals();
            test.strictEqual(fs.existsSync('/tmp/f5-cloud-libs-signals/foo'), false);
            test.done();
        },

        testError: function(test) {
            const message = 'readdirSync error';
            fs.readdirSync = function() {
                throw new Error(message);
            };

            test.expect(1);
            try {
                ipc.clearSignals();
                test.ok(false, 'clearSignals should have thrown');
            }
            catch (err) {
                test.strictEqual(err.message, message);
            }
            finally {
                test.done();
            }
        }
    },

    testDirCreated: {
        setUp: function(callback) {
            if (fs.existsSync(ipc.signalBasePath)) {
                fs.rmdirSync(ipc.signalBasePath);
            }
            callback();
        },

        testOnSend: function(test) {
            ipc.send('foo');
            test.expect(1);
            test.strictEqual(fs.existsSync(ipc.signalBasePath), true);
            test.done();
        },

        testOnOnce: function(test) {
            ipc.once('foo');
            test.expect(1);
            test.strictEqual(fs.existsSync(ipc.signalBasePath), true);
            test.done();
        }
    },

    testSetLogger: function(test) {
        test.expect(1);
        test.doesNotThrow(function() {
            ipc.setLogger({});
        });
        test.done();
    },

    testSetLoggerOptions: function(test) {
        test.expect(1);
        test.doesNotThrow(function() {
            ipc.setLoggerOptions({});
        });
        test.done();
    }
};
