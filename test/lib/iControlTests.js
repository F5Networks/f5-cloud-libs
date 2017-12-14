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

var IControl = require('../../../f5-cloud-libs').iControl;
var httpMock = require('../testUtil/httpMock');
var iControl;

module.exports = {
    setUp: function(callback) {
        iControl = new IControl();
        iControl.https = httpMock;
        httpMock.reset();
        callback();
    },

    testAuthToken: function(test) {
        iControl = new IControl({authToken: 'foofoofoo'});
        iControl.https = httpMock;
        iControl.list('somepath')
            .then(function() {
                test.strictEqual(httpMock.lastRequest.headers['X-F5-Auth-Token'], 'foofoofoo');
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testBadJsonResponse: function(test) {
        httpMock.setResponse('badjson', {'Content-Type': 'application/json'});
        iControl.list('somepath')
            .then(function() {
                test.ok(false, 'should have thrown bad json');
            })
            .catch(function(err) {
                test.notStrictEqual(err.indexOf('Unable to parse JSON'), -1);
            })
            .finally(function() {
                test.done();
            });
    },

    testEmptyResponse: function(test) {
        httpMock.setResponse('', {'Content-Type': 'application/json'});
        iControl.list('somepath')
            .then(function(response) {
                test.deepEqual(response, {});
            })
            .catch(function(err) {
                test.ok(false, err);
            })
            .finally(function() {
                test.done();
            });
    },

    testBadStatusCode: function(test) {
        httpMock.setResponse({foo: 'bar'}, {'Content-Type': 'application/json'}, 300);
        iControl.list('somepath')
            .then(function() {
                test.ok(false, 'should have thrown bad status code');
            })
            .catch(function() {
                test.ok(true);
            })
            .finally(function() {
                test.done();
            });
    },

    testCreate: function(test) {
        var body = {foo: 'bar'};
        iControl.create('somepath', body)
            .then(function() {
                test.deepEqual(httpMock.lastRequest.method, 'POST');
                test.deepEqual(httpMock.clientRequest.data, JSON.stringify({foo: 'bar'}));
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testDelete: function(test) {
        iControl.delete('somepath')
            .then(function() {
                test.deepEqual(httpMock.lastRequest.method, 'DELETE');
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testList: function(test) {
        var expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        iControl.list('somepath')
            .then(function(response) {
                test.strictEqual(response, expectedResponse);
                test.deepEqual(httpMock.lastRequest.method, 'GET');
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
    },

    testModify: function(test) {
        var body = {foo: 'bar'};
        iControl.modify('somepath', body)
            .then(function() {
                test.deepEqual(httpMock.lastRequest.method, 'PATCH');
                test.deepEqual(httpMock.clientRequest.data, JSON.stringify({foo: 'bar'}));
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testReplace: function(test) {
        var body = {foo: 'bar'};
        iControl.replace('somepath', body)
            .then(function() {
                test.deepEqual(httpMock.lastRequest.method, 'PUT');
                test.deepEqual(httpMock.clientRequest.data, JSON.stringify({foo: 'bar'}));
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testNoWait: function(test) {
        var expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        iControl.list('somepath', {noWait: true})
            .then(function(response) {
                test.strictEqual(response, undefined);
            })
            .catch(function(err) {
                test.ok(false, err.message);
            })
            .finally(function() {
                test.done();
            });
    },

    testError: function(test) {
        var message = 'http error';
        httpMock.setError(message);
        iControl.list('somepath')
        .then(function() {
            test.ok(false, 'should have thrown an error');
        })
        .catch(function(err) {
            test.strictEqual(err.message, message);
        })
        .finally(function() {
            test.done();
        });
}
};