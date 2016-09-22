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

var IControl = require('../../lib/iControl');
var httpMock = require('../testUtil/httpMock');
var iControl;

module.exports = {
    setUp: function(callback) {
        iControl = new IControl();
        iControl.https = httpMock;
        httpMock.reset();
        callback();
    },

    testList: function(test) {
        var expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        iControl.list('somepath')
            .then(function(response) {
                test.strictEqual(response, expectedResponse);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testListJson: function(test) {
        var expectedResponse = {
            foo: 'bar'
        };
        httpMock.setResponse(expectedResponse, {'Content-Type': 'application/json'});
        iControl.list('somepath')
            .then(function(response) {
                test.deepEqual(response, expectedResponse);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testListItems: function(test) {
        var items = [
            {
                one: 1,
                two: 2
            }
        ];
        var expectedResponse = {
            kind: 'foo',
            items: items
        };

        httpMock.setResponse(expectedResponse, {'Content-Type': 'application/json'});
        iControl.list('somepath')
            .then(function(response) {
                test.deepEqual(response, items);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    }
};