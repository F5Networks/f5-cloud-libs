/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
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
    },

    testHeaderContentType: function(test) {
        var contentType = 'foo/bar';
        var headers = {
            'Content-type': contentType
        };

        iControl.list('somepath', {headers: headers});
        test.deepEqual(httpMock.lastRequest.headers['Content-Type'], contentType);
        test.done();
    },

    testHeaderOther: function(test) {
        var headers = {
            foo: 'bar'
        };

        iControl.list('somepath', {headers: headers});
        test.deepEqual(httpMock.lastRequest.headers.foo, headers.foo);
        test.done();
    }
};