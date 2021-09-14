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
const assert = require('assert');
const httpUtil = require('../../../f5-cloud-libs').httpUtil;
const httpMock = require('../testUtil/httpMock');

describe('httpUtil tests', () => {
    const testUrl = 'https://one/two/three';
    const testOptions = {
        foo: 'bar',
        hello: 'world'
    };

    /* eslint-disable global-require */
    const http = require('http');
    const https = require('https');

    const realHttpUtilRequest = httpUtil.request;
    const realHttpRequest = http.request;
    const realHttpsRequest = https.request;
    const realHttpClientRequest = http.clientRequest;
    const realHttpsClientRequest = https.clientRequest;

    let lastRequest;

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('CRUD tests', () => {
        beforeEach(() => {
            lastRequest = {};

            httpUtil.request = (method, url, options) => {
                lastRequest.method = method;
                lastRequest.url = url;
                lastRequest.options = options;
                return q();
            };
        });

        afterEach(() => {
            httpUtil.request = realHttpUtilRequest;
        });

        it('get test', () => {
            return httpUtil.get(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'GET');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepStrictEqual(lastRequest.options, testOptions);
                });
        });

        it('post test', () => {
            return httpUtil.post(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'POST');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepStrictEqual(lastRequest.options, testOptions);
                });
        });

        it('patch test', () => {
            return httpUtil.patch(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'PATCH');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepStrictEqual(lastRequest.options, testOptions);
                });
        });

        it('put test', () => {
            return httpUtil.put(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'PUT');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepStrictEqual(lastRequest.options, testOptions);
                });
        });

        it('delete test', () => {
            return httpUtil.delete(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'DELETE');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepStrictEqual(lastRequest.options, testOptions);
                });
        });
    });

    describe('request tests', () => {
        beforeEach(() => {
            httpMock.reset();
            http.request = httpMock.request;
            http.clientRequest = httpMock.clientRequest;
            https.request = httpMock.request;
            https.clientRequest = httpMock.clientRequest;
        });

        afterEach(() => {
            http.request = realHttpRequest;
            http.clientRequest = realHttpClientRequest;
            https.request = realHttpsRequest;
            https.clientRequest = realHttpsClientRequest;
        });

        it('request options test', () => {
            return httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.strictEqual(http.lastRequest.protocol, 'http:');
                    assert.strictEqual(http.lastRequest.hostname, 'www.example.com');
                    assert.strictEqual(http.lastRequest.method, 'GET');
                    assert.strictEqual(http.lastRequest.path, '/');
                });
        });

        it('request options with path test', () => {
            return httpUtil.request('GET', 'http://www.example.com/foo/bar')
                .then(() => {
                    assert.strictEqual(http.lastRequest.path, '/foo/bar');
                });
        });

        it('request options with query test', () => {
            const query = '?hello=world&alpha=beta';
            return httpUtil.request('GET', `http://www.example.com/foo/bar${query}`)
                .then(() => {
                    assert.strictEqual(http.lastRequest.path, `/foo/bar${query}`);
                });
        });

        it('https test', () => {
            return httpUtil.request('GET', 'https://www.example.com')
                .then(() => {
                    assert.strictEqual(https.lastRequest.protocol, 'https:');
                });
        });

        it('bad protocol test', () => {
            return httpUtil.request('GET', 'file:///tmp/foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown bad protocol');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('supported'), -1);
                });
        });

        it('text body test', () => {
            const body = 'hello, world';
            const options = {
                body,
            };

            return httpUtil.request('GET', 'http://www.example.com', options)
                .then(() => {
                    assert.strictEqual(httpMock.clientRequest.data, body);
                });
        });

        it('json body test', () => {
            const body = {
                hello: 'world'
            };

            const options = {
                body,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            return httpUtil.request('GET', 'http://www.example.com', options)
                .then(() => {
                    assert.strictEqual(httpMock.clientRequest.data, JSON.stringify(body));
                });
        });

        it('string response test', () => {
            httpMock.setResponse('hello world');
            return httpUtil.request('GET', 'http://www.example.com')
                .then((data) => {
                    assert.strictEqual(data, 'hello world');
                });
        });

        it('json response test', () => {
            httpMock.setResponse({ hello: 'world' }, { 'content-type': 'application/json' });

            return httpUtil.request('GET', 'http://www.example.com')
                .then((data) => {
                    assert.deepStrictEqual(data, { hello: 'world' });
                });
        });

        it('bad status test', () => {
            httpMock.setResponse(null, null, 300);

            return httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.ok(false, 'should have thrown with bad status');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('300'), -1);
                });
        });

        it('error test', () => {
            const message = 'foo bar';
            httpMock.setError(message);

            return httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });

        it('http throws test', () => {
            const message = 'http threw';
            http.request = () => {
                throw new Error(message);
            };

            return httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });
    });
});
