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

var ipc = require('../../lib/ipc');

module.exports = {
    testOnce: function(test) {
        var signalled = false;
        ipc.once('foo')
            .then(function() {
                signalled = true;
                test.ok(true);
                test.done();
            });

        test.ok(!signalled, "Should not have been signalled yet.");
        setTimeout(ipc.send, 50, 'foo');
    },

    testOnceTwice: function(test) {
        var signalled = 0;

        var checkSignalled = function() {
            test.strictEqual(signalled, 2);
        };

        test.expect(2);

        ipc.once('foo')
            .then(function() {
                signalled++;
            });
        ipc.once('foo')
            .then(function() {
                signalled++;
            });

        test.strictEqual(signalled, 0);
        setTimeout(ipc.send, 50, 'foo');
        setTimeout(ipc.send, 50, 'foo');
        setTimeout(checkSignalled, 100);
        setTimeout(test.done, 200);
    }
};