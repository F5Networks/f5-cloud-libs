/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
 */
'use strict';

var ipc = require('../../lib/ipc');

module.exports = {
    testOnce: function(test) {
        var signalled = 0;

        var checkSignalled = function(expected) {
            test.strictEqual(signalled, expected);
        };

        test.expect(2);

        ipc.once('foo')
            .then(function() {
                signalled++;
            });

        test.strictEqual(signalled, 0);
        setTimeout(ipc.send, 50, 'foo');
        setTimeout(ipc.send, 50, 'foo');
        setTimeout(checkSignalled, 100, 1);
        setTimeout(test.done, 200);
    },

    testOnceTwice: function(test) {
        var signalled = 0;

        var checkSignalled = function(expected) {
            test.strictEqual(signalled, expected);
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
        setTimeout(checkSignalled, 100, 2);
        setTimeout(test.done, 200);
    }
};