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

var q = require('q');
var BigIp = require('../../lib/bigIp');
var icontrolMock = require('../util/icontrolMock');

var bigIp = new BigIp('host', 'user', 'password', {icontrol: icontrolMock});
bigIp.ready = function() {
    return q();
};

module.exports = {
    setUp: function(callback) {
        icontrolMock.reset();
        callback();
    },

    testListSuccess: function(test) {
        bigIp.list();
        test.strictEqual(icontrolMock.lastCall.method, 'list');
        test.done();
    },

    testLoadNoFile: function(test) {
        bigIp.load()
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.method, 'create');
                test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                test.strictEqual(icontrolMock.lastCall.body.command, 'load');
                test.strictEqual(icontrolMock.lastCall.body.name, 'default');
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });
    },

    testLoadFile: function(test) {
        var fileName = 'foobar';

        bigIp.load(fileName)
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.body.options[0].file, fileName);
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });
    },

    testLoadOptions: function(test) {
        var options = {
            foo: 'bar',
            hello: 'world'
        };

        bigIp.load(null, options)
            .then(function() {
                test.strictEqual(icontrolMock.lastCall.body.options[0].foo, options.foo);
                test.strictEqual(icontrolMock.lastCall.body.options[1].hello, options.hello);
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });

    }
};