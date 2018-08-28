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

const IControl = require('../../../f5-cloud-libs').iControl;
const httpMock = require('../testUtil/httpMock');

let iControl;

module.exports = {
    setUp(callback) {
        iControl = new IControl();
        iControl.https = httpMock;
        httpMock.reset();
        callback();
    },

    testAuthToken(test) {
        iControl = new IControl({ authToken: 'foofoofoo' });
        iControl.https = httpMock;
        iControl.list('somepath')
            .then(() => {
                test.strictEqual(httpMock.lastRequest.headers['X-F5-Auth-Token'], 'foofoofoo');
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testBadJsonResponse(test) {
        httpMock.setResponse('badjson', { 'Content-Type': 'application/json' });
        iControl.list('somepath')
            .then(() => {
                test.ok(false, 'should have thrown bad json');
            })
            .catch((err) => {
                test.notStrictEqual(err.indexOf('Unable to parse JSON'), -1);
            })
            .finally(() => {
                test.done();
            });
    },

    testEmptyResponse(test) {
        httpMock.setResponse('', { 'Content-Type': 'application/json' });
        iControl.list('somepath')
            .then((response) => {
                test.deepEqual(response, {});
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testBadStatusCode(test) {
        const errorCode = 300;
        httpMock.setResponse({ foo: 'bar' }, { 'Content-Type': 'application/json' }, errorCode);
        iControl.list('somepath')
            .then(() => {
                test.ok(false, 'should have thrown bad status code');
            })
            .catch((err) => {
                test.strictEqual(err.code, errorCode);
            })
            .finally(() => {
                test.done();
            });
    },

    testCreate(test) {
        const body = { foo: 'bar' };
        iControl.create('somepath', body)
            .then(() => {
                test.deepEqual(httpMock.lastRequest.method, 'POST');
                test.deepEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testDelete(test) {
        iControl.delete('somepath')
            .then(() => {
                test.deepEqual(httpMock.lastRequest.method, 'DELETE');
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testList(test) {
        const expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        iControl.list('somepath')
            .then((response) => {
                test.strictEqual(response, expectedResponse);
                test.deepEqual(httpMock.lastRequest.method, 'GET');
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testListJson(test) {
        const expectedResponse = {
            foo: 'bar'
        };
        httpMock.setResponse(expectedResponse, { 'Content-Type': 'application/json' });
        iControl.list('somepath')
            .then((response) => {
                test.deepEqual(response, expectedResponse);
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testListItems(test) {
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
                test.deepEqual(response, items);
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testHeaderContentType(test) {
        const contentType = 'foo/bar';
        const headers = {
            'Content-type': contentType
        };

        iControl.list('somepath', { headers });
        test.deepEqual(httpMock.lastRequest.headers['Content-Type'], contentType);
        test.done();
    },

    testHeaderOther(test) {
        const headers = {
            foo: 'bar'
        };

        iControl.list('somepath', { headers });
        test.deepEqual(httpMock.lastRequest.headers.foo, headers.foo);
        test.done();
    },

    testModify(test) {
        const body = { foo: 'bar' };
        iControl.modify('somepath', body)
            .then(() => {
                test.deepEqual(httpMock.lastRequest.method, 'PATCH');
                test.deepEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testReplace(test) {
        const body = { foo: 'bar' };
        iControl.replace('somepath', body)
            .then(() => {
                test.deepEqual(httpMock.lastRequest.method, 'PUT');
                test.deepEqual(httpMock.clientRequest.data, JSON.stringify({ foo: 'bar' }));
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testNoWait(test) {
        const expectedResponse = 'foo';
        httpMock.setResponse(expectedResponse);
        iControl.list('somepath', { noWait: true })
            .then((response) => {
                test.strictEqual(response, undefined);
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testError(test) {
        const message = 'http error';
        httpMock.setError(message);
        iControl.list('somepath')
            .then(() => {
                test.ok(false, 'should have thrown an error');
            })
            .catch((err) => {
                test.strictEqual(err.message, message);
            })
            .finally(() => {
                test.done();
            });
    }
};
