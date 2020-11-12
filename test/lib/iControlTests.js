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

const assert = require('assert');

const IControl = require('../../../f5-cloud-libs').iControl;
const httpMock = require('../testUtil/httpMock');

describe('iControl tests', () => {
    let iControl;

    beforeEach(() => {
        iControl = new IControl();
        iControl.https = httpMock;
        httpMock.reset();
    });

    it('auth token test', (done) => {
        iControl = new IControl({ authToken: 'foofoofoo' });
        iControl.https = httpMock;
        iControl.list('somepath')
            .then(() => {
                assert.strictEqual(httpMock.lastRequest.headers['X-F5-Auth-Token'], 'foofoofoo');
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('auth token wrong ip test', (done) => {
        const user = 'admin';
        const password = 'secret';
        const badTokenResponse = `Tokens are only valid to be used by the client of which they were issued.
Token is valid for 1.2.3.4 and received from 6.7.8.9.`;

        iControl = new IControl({ authToken: 'ClientToken', user, password });
        iControl.https = httpMock;
        httpMock.setResponse(
            { message: badTokenResponse },
            { 'Content-Type': 'application/json' },
            401
        );

        iControl.list('/wrong/client/ip')
            .then((data) => {
                assert.deepEqual(data, { message: 'Success' });
                assert.strictEqual(httpMock.lastRequest.auth, `${user}:${password}`);
                assert.strictEqual(httpMock.lastRequest.headers['X-F5-Auth-Token'], undefined);
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('bad json response test', (done) => {
        httpMock.setResponse('badjson', { 'Content-Type': 'application/json' });
        iControl.list('somepath')
            .then(() => {
                assert.ok(false, 'should have thrown bad json');
            })
            .catch((err) => {
                assert.notStrictEqual(err.indexOf('Unable to parse JSON'), -1);
            })
            .finally(() => {
                done();
            });
    });
    it('empty response test', (done) => {
        httpMock.setResponse('', { 'Content-Type': 'application/json' });
        iControl.list('somepath')
            .then((response) => {
                assert.deepEqual(response, {});
            })
            .catch((err) => {
                assert.ok(false, err);
            })
            .finally(() => {
                done();
            });
    });
    it('bad status code test', (done) => {
        const errorCode = 300;
        httpMock.setResponse({ foo: 'bar' }, { 'Content-Type': 'application/json' }, errorCode);
        iControl.list('somepath')
            .then(() => {
                assert.ok(false, 'should have thrown bad status code');
            })
            .catch((err) => {
                assert.strictEqual(err.code, errorCode);
            })
            .finally(() => {
                done();
            });
    });
    it('create test', (done) => {
        const body = { foo: 'bar' };
        iControl.create('somepath', body)
            .then(() => {
                assert.deepEqual(httpMock.lastRequest.method, 'POST');
                assert.deepEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('delete test', (done) => {
        iControl.delete('somepath')
            .then(() => {
                assert.deepEqual(httpMock.lastRequest.method, 'DELETE');
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('list test', (done) => {
        const expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        iControl.list('somepath')
            .then((response) => {
                assert.strictEqual(response, expectedResponse);
                assert.deepEqual(httpMock.lastRequest.method, 'GET');
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('list json test', (done) => {
        const expectedResponse = {
            foo: 'bar'
        };
        httpMock.setResponse(expectedResponse, { 'Content-Type': 'application/json' });
        iControl.list('somepath')
            .then((response) => {
                assert.deepEqual(response, expectedResponse);
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('list items test', (done) => {
        const items = [
            {
                one: 1,
                two: 2
            }
        ];
        const expectedResponse = {
            kind: 'foo',
            items
        };

        httpMock.setResponse(expectedResponse, { 'Content-Type': 'application/json' });
        iControl.list('somepath')
            .then((response) => {
                assert.deepEqual(response, items);
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('header content type test', (done) => {
        const contentType = 'foo/bar';
        const headers = {
            'Content-type': contentType
        };

        iControl.list('somepath', { headers });
        assert.deepEqual(httpMock.lastRequest.headers['Content-Type'], contentType);
        done();
    });
    it('header other test', (done) => {
        const headers = {
            foo: 'bar'
        };

        iControl.list('somepath', { headers });
        assert.deepEqual(httpMock.lastRequest.headers.foo, headers.foo);
        done();
    });
    it('modify test', (done) => {
        const body = { foo: 'bar' };
        iControl.modify('somepath', body)
            .then(() => {
                assert.deepEqual(httpMock.lastRequest.method, 'PATCH');
                assert.deepEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('replace test', (done) => {
        const body = { foo: 'bar' };
        iControl.replace('somepath', body)
            .then(() => {
                assert.deepEqual(httpMock.lastRequest.method, 'PUT');
                assert.deepEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('no wait test', (done) => {
        const expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        iControl.list('somepath', { noWait: true })
            .then((response) => {
                assert.strictEqual(response, undefined);
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
    it('error test', (done) => {
        const message = 'http error';
        httpMock.setError(message);
        iControl.list('somepath')
            .then(() => {
                assert.ok(false, 'should have thrown an error');
            })
            .catch((err) => {
                assert.strictEqual(err.message, message);
            })
            .finally(() => {
                done();
            });
    });
    it('local auth test', (done) => {
        iControl = new IControl({ host: 'localhost', port: 8100 });
        iControl.http = httpMock;
        iControl.list('somepath')
            .then(() => {
                // testing that /mgmt is not prefixed
                assert.strictEqual(httpMock.lastRequest.path, 'somepath');
            })
            .catch((err) => {
                assert.ok(false, err.message);
            })
            .finally(() => {
                done();
            });
    });
});
