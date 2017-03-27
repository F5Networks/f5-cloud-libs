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

module.exports = {
    tearDown: function(callback) {
        try {
            fs.unlinkSync('/tmp/foo');
        }
        catch (err) {
        }
        callback();
    },

    testOnce: function(test) {
        var signaled = 0;

        var checkSignaled = function(expected) {
            test.strictEqual(signaled, expected);
            test.done();
        };

        test.expect(2);

        ipc.once('foo')
            .then(function() {
                signaled++;
            });

        test.strictEqual(signaled, 0);
        ipc.send('foo');
        ipc.send('foo');
        setTimeout(checkSignaled, 10, 1);
    },

    testOnceTwice: function(test) {
        var signaled = 0;

        var checkSignaled = function(expected) {
            test.strictEqual(signaled, expected);
            test.done();
        };

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
        setTimeout(checkSignaled, 10, 2);
    }
};
