/**
 * Copyright 2017 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const q = require('q');
const httpUtil = require('../../../f5-cloud-libs').httpUtil;
const httpMock = require('../testUtil/httpMock');

const testUrl = 'https://one/two/three';
const testOptions = {
    foo: 'bar',
    hello: 'world'
};

const http = require('http');
const https = require('https');

const realHttpUtilRequest = httpUtil.request;
const realHttpRequest = http.request;
const realHttpsRequest = https.request;
const realHttpClientRequest = http.clientRequest;
const realHttpsClientRequest = https.clientRequest;

let lastRequest;

module.exports = {
    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        callback();
    },

    testCRUD: {
        setUp(callback) {
            lastRequest = {};

            httpUtil.request = (method, url, options) => {
                lastRequest.method = method;
                lastRequest.url = url;
                lastRequest.options = options;
                return q();
            };

            callback();
        },

        tearDown(callback) {
            httpUtil.request = realHttpUtilRequest;
            callback();
        },

        testGet(test) {
            test.expect(3);
            httpUtil.get(testUrl, testOptions)
                .then(() => {
                    test.strictEqual(lastRequest.method, 'GET');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPost(test) {
            test.expect(3);
            httpUtil.post(testUrl, testOptions)
                .then(() => {
                    test.strictEqual(lastRequest.method, 'POST');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPatch(test) {
            test.expect(3);
            httpUtil.patch(testUrl, testOptions)
                .then(() => {
                    test.strictEqual(lastRequest.method, 'PATCH');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPut(test) {
            test.expect(3);
            httpUtil.put(testUrl, testOptions)
                .then(() => {
                    test.strictEqual(lastRequest.method, 'PUT');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDelete(test) {
            test.expect(3);
            httpUtil.delete(testUrl, testOptions)
                .then(() => {
                    test.strictEqual(lastRequest.method, 'DELETE');
                    test.strictEqual(lastRequest.url, testUrl);
                    test.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRequest: {
        setUp(callback) {
            httpMock.reset();
            http.request = httpMock.request;
            http.clientRequest = httpMock.clientRequest;
            https.request = httpMock.request;
            https.clientRequest = httpMock.clientRequest;

            callback();
        },

        tearDown(callback) {
            http.request = realHttpRequest;
            http.clientRequest = realHttpClientRequest;
            https.request = realHttpsRequest;
            https.clientRequest = realHttpsClientRequest;

            callback();
        },

        testRequestOptions(test) {
            test.expect(4);
            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    test.strictEqual(http.lastRequest.protocol, 'http:');
                    test.strictEqual(http.lastRequest.hostname, 'www.example.com');
                    test.strictEqual(http.lastRequest.method, 'GET');
                    test.strictEqual(http.lastRequest.path, '/');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRequestOptionsWithPath(test) {
            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com/foo/bar')
                .then(() => {
                    test.strictEqual(http.lastRequest.path, '/foo/bar');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRequestOptionsWithQuery(test) {
            const query = '?hello=world&alpha=beta';
            test.expect(1);
            httpUtil.request('GET', `http://www.example.com/foo/bar${query}`)
                .then(() => {
                    test.strictEqual(http.lastRequest.path, `/foo/bar${query}`);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testHttps(test) {
            test.expect(1);
            httpUtil.request('GET', 'https://www.example.com')
                .then(() => {
                    test.strictEqual(https.lastRequest.protocol, 'https:');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadProtocol(test) {
            test.expect(1);
            httpUtil.request('GET', 'file:///tmp/foo')
                .then(() => {
                    test.ok(false, 'Should have thrown bad protocol');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('supported'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testTextBody(test) {
            const body = 'hello, world';
            const options = {
                body,
            };

            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com', options)
                .then(() => {
                    test.strictEqual(httpMock.clientRequest.data, body);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testJSONBody(test) {
            const body = {
                hello: 'world'
            };

            const options = {
                body,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com', options)
                .then(() => {
                    test.strictEqual(httpMock.clientRequest.data, JSON.stringify(body));
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testStringResponse(test) {
            httpMock.setResponse('hello world');
            httpUtil.request('GET', 'http://www.example.com')
                .then((data) => {
                    test.strictEqual(data, 'hello world');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testJSONResponse(test) {
            httpMock.setResponse({ hello: 'world' }, { 'content-type': 'application/json' });

            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com')
                .then((data) => {
                    test.deepEqual(data, { hello: 'world' });
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadStatus(test) {
            httpMock.setResponse(null, null, 300);

            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    test.ok(false, 'should have thrown with bad status');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('300'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testError(test) {
            const message = 'foo bar';
            httpMock.setError(message);

            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    test.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testHttpThrows(test) {
            const message = 'http threw';
            http.request = () => {
                throw new Error(message);
            };

            test.expect(1);
            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    test.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
