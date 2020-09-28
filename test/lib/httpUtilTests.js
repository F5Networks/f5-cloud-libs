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

describe('bigip tests', () => {
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

        it('get test', (done) => {
            httpUtil.get(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'GET');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('post test', (done) => {
            httpUtil.post(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'POST');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('patch test', (done) => {
            httpUtil.patch(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'PATCH');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('put test', (done) => {
            httpUtil.put(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'PUT');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('delete test', (done) => {
            httpUtil.delete(testUrl, testOptions)
                .then(() => {
                    assert.strictEqual(lastRequest.method, 'DELETE');
                    assert.strictEqual(lastRequest.url, testUrl);
                    assert.deepEqual(lastRequest.options, testOptions);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
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

        it('request options test', (done) => {
            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.strictEqual(http.lastRequest.protocol, 'http:');
                    assert.strictEqual(http.lastRequest.hostname, 'www.example.com');
                    assert.strictEqual(http.lastRequest.method, 'GET');
                    assert.strictEqual(http.lastRequest.path, '/');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('request options with path test', (done) => {
            httpUtil.request('GET', 'http://www.example.com/foo/bar')
                .then(() => {
                    assert.strictEqual(http.lastRequest.path, '/foo/bar');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('request options with query test', (done) => {
            const query = '?hello=world&alpha=beta';
            httpUtil.request('GET', `http://www.example.com/foo/bar${query}`)
                .then(() => {
                    assert.strictEqual(http.lastRequest.path, `/foo/bar${query}`);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('https test', (done) => {
            httpUtil.request('GET', 'https://www.example.com')
                .then(() => {
                    assert.strictEqual(https.lastRequest.protocol, 'https:');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('bad protocol test', (done) => {
            httpUtil.request('GET', 'file:///tmp/foo')
                .then(() => {
                    assert.ok(false, 'Should have thrown bad protocol');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('supported'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('text body test', (done) => {
            const body = 'hello, world';
            const options = {
                body,
            };

            httpUtil.request('GET', 'http://www.example.com', options)
                .then(() => {
                    assert.strictEqual(httpMock.clientRequest.data, body);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('json body test', (done) => {
            const body = {
                hello: 'world'
            };

            const options = {
                body,
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            httpUtil.request('GET', 'http://www.example.com', options)
                .then(() => {
                    assert.strictEqual(httpMock.clientRequest.data, JSON.stringify(body));
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('string response test', (done) => {
            httpMock.setResponse('hello world');
            httpUtil.request('GET', 'http://www.example.com')
                .then((data) => {
                    assert.strictEqual(data, 'hello world');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('json response test', (done) => {
            httpMock.setResponse({ hello: 'world' }, { 'content-type': 'application/json' });

            httpUtil.request('GET', 'http://www.example.com')
                .then((data) => {
                    assert.deepEqual(data, { hello: 'world' });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('bad status test', (done) => {
            httpMock.setResponse(null, null, 300);

            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.ok(false, 'should have thrown with bad status');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('300'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('error test', (done) => {
            const message = 'foo bar';
            httpMock.setError(message);

            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('http throws test', (done) => {
            const message = 'http threw';
            http.request = () => {
                throw new Error(message);
            };

            httpUtil.request('GET', 'http://www.example.com')
                .then(() => {
                    assert.ok(false, 'should have thrown error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });
});
