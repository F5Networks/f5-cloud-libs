/**
 * Copyright 2017 F5 Networks, Inc.
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

const q = require('q');
const httpUtil = require('../../../f5-cloud-libs').httpUtil;
const httpMock = require('../testUtil/httpMock');

const realRequest = httpUtil.request;

const testUrl = 'https://one/two/three';
const testOptions = {
    foo: "bar",
    hello: "world"
};

var http = require('http');

var lastRequest;
var requestOptions;

module.exports = {
    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });

        callback();
    },

    testCRUD: {
        setUp: function(callback) {
            lastRequest = {};

            httpUtil.request = function(method, url, options) {
                lastRequest.method = method;
                lastRequest.url = url;
                lastRequest.options = options;
                return q();
            };

            callback();
        },

        tearDown: function(callback) {
            httpUtil.request = realRequest;
            callback();
        },

        testGet: function(test) {
            test.expect(3);
            httpUtil.get(testUrl, testOptions)
                .then(function() {
                    test.strictEqual(lastRequest.method, 'GET');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPost: function(test) {
            test.expect(3);
            httpUtil.post(testUrl, testOptions)
                .then(function() {
                    test.strictEqual(lastRequest.method, 'POST');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPatch: function(test) {
            test.expect(3);
            httpUtil.patch(testUrl, testOptions)
                .then(function() {
                    test.strictEqual(lastRequest.method, 'PATCH');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testPut: function(test) {
            test.expect(3);
            httpUtil.put(testUrl, testOptions)
                .then(function() {
                    test.strictEqual(lastRequest.method, 'PUT');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testDelete: function(test) {
            test.expect(3);
            httpUtil.delete(testUrl, testOptions)
                .then(function() {
                    test.strictEqual(lastRequest.method, 'DELETE');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testRequest: {
        setUp: function(callback) {
            httpMock.reset();
            http.request = httpMock.request;
            http.clientRequest = httpMock.clientRequest;
            requestOptions = {};

            callback();
        },

        testRequestOptions: function(test) {
            test.expect(4);
            httpUtil.request('GET', 'http://www.example.com')
                .then(function() {
                    test.strictEqual(http.lastRequest.protocol, 'http:');
                    test.strictEqual(http.lastRequest.hostname, 'www.example.com');
                    test.strictEqual(http.lastRequest.method, 'GET');
                    test.strictEqual(http.lastRequest.path, '/');
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testJSONBody: function(test) {
            var body = {
                hello: 'world'
            };

            var options = {
                body: body,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com', options)
                .then(function() {
                    test.strictEqual(httpMock.clientRequest.data, JSON.stringify(body));
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testStringResponse: function(test) {
            httpMock.setResponse('hello world');
            httpUtil.request('GET', 'http://www.example.com')
                .then(function(data) {
                    test.strictEqual(data, 'hello world');
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testJSONResponse: function(test) {
            httpMock.setResponse({hello: 'world'}, {'content-type': 'application/json'});

            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com')
                .then(function(data) {
                    test.deepEqual(data, {hello: 'world'});
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testError: function(test) {
            httpMock.setResponse(null, null, 300);

            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com')
                .then(function() {
                    test.ok(false, 'should have thrown with bad status');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('300'), -1);
                })
                .finally(function() {
                    test.done();
                });
        }
    }
};
