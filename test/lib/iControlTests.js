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

    it('auth token test', () => {
        iControl = new IControl({ authToken: 'foofoofoo' });
        iControl.https = httpMock;
        return iControl.list('somepath')
            .then(() => {
                assert.strictEqual(httpMock.lastRequest.headers['X-F5-Auth-Token'], 'foofoofoo');
            });
    });

    it('auth token wrong ip test', () => {
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

        return iControl.list('/wrong/client/ip')
            .then((data) => {
                assert.deepStrictEqual(data, { message: 'Success' });
                assert.strictEqual(httpMock.lastRequest.auth, `${user}:${password}`);
                assert.strictEqual(httpMock.lastRequest.headers['X-F5-Auth-Token'], undefined);
            });
    });

    it('bad json response test', () => {
        httpMock.setResponse('badjson', { 'Content-Type': 'application/json' });
        return iControl.list('somepath')
            .then(() => {
                assert.ok(false, 'should have thrown bad json');
            })
            .catch((err) => {
                assert.notStrictEqual(err.message.indexOf('Unable to parse JSON'), -1);
            });
    });

    it('empty response test', () => {
        httpMock.setResponse('', { 'Content-Type': 'application/json' });
        return iControl.list('somepath')
            .then((response) => {
                assert.deepStrictEqual(response, {});
            });
    });

    it('bad status code test', () => {
        httpMock.setResponse({ foo: 'bar' }, { 'Content-Type': 'application/json' }, 300);
        return iControl.list('somepath')
            .then(() => {
                assert.ok(false, 'should have thrown bad status code');
            })
            .catch((err) => {
                assert.strictEqual(err.code, 300);
            });
    });

    it('create test', () => {
        const body = { foo: 'bar' };
        return iControl.create('somepath', body)
            .then(() => {
                assert.deepStrictEqual(httpMock.lastRequest.method, 'POST');
                assert.deepStrictEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            });
    });

    it('delete test', () => {
        return iControl.delete('somepath')
            .then(() => {
                assert.deepStrictEqual(httpMock.lastRequest.method, 'DELETE');
            });
    });

    it('list test', () => {
        const expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        return iControl.list('somepath')
            .then((response) => {
                assert.strictEqual(response, expectedResponse);
                assert.deepStrictEqual(httpMock.lastRequest.method, 'GET');
            });
    });

    it('list json test', () => {
        httpMock.setResponse({ foo: 'bar' }, { 'Content-Type': 'application/json' });
        return iControl.list('somepath')
            .then((response) => {
                assert.deepStrictEqual(response, { foo: 'bar' });
            });
    });

    it('list items test', () => {
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
        return iControl.list('somepath')
            .then((response) => {
                assert.deepStrictEqual(response, items);
            });
    });

    it('header content type test', () => {
        const contentType = 'foo/bar';
        const headers = {
            'Content-type': contentType
        };

        iControl.list('somepath', { headers });
        assert.deepStrictEqual(httpMock.lastRequest.headers['Content-Type'], contentType);
    });

    it('header other test', () => {
        const headers = {
            foo: 'bar'
        };

        iControl.list('somepath', { headers });
        assert.deepStrictEqual(httpMock.lastRequest.headers.foo, headers.foo);
    });

    it('modify test', () => {
        const body = { foo: 'bar' };
        return iControl.modify('somepath', body)
            .then(() => {
                assert.deepStrictEqual(httpMock.lastRequest.method, 'PATCH');
                assert.deepStrictEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            });
    });

    it('replace test', () => {
        const body = { foo: 'bar' };
        return iControl.replace('somepath', body)
            .then(() => {
                assert.deepStrictEqual(httpMock.lastRequest.method, 'PUT');
                assert.deepStrictEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            });
    });

    it('no wait test', () => {
        httpMock.setResponse('foo');
        return iControl.list('somepath', { noWait: true })
            .then((response) => {
                assert.strictEqual(response, undefined);
            });
    });

    it('error test', () => {
        httpMock.setError('http error');
        return iControl.list('somepath')
            .then(() => {
                assert.ok(false, 'should have thrown an error');
            })
            .catch((err) => {
                assert.strictEqual(err.message, 'http error');
            });
    });

    it('local auth test', () => {
        iControl = new IControl({ host: 'localhost', port: 8100 });
        iControl.http = httpMock;
        return iControl.list('somepath')
            .then(() => {
                // testing that /mgmt is not prefixed
                assert.strictEqual(httpMock.lastRequest.path, 'somepath');
            });
    });
});
