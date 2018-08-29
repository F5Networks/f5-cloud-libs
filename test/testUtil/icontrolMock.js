/**
 * Copyright 2016-2018 F5 Networks, Inc.
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

const FAIL_REQUEST = 'FAIL_REQUEST';

module.exports = {
    list(path, opts) {
        this.recordRequest('list', path, null, opts);
        return this.respond('list', path);
    },

    create(path, body, opts) {
        this.recordRequest('create', path, body, opts);
        return this.respond('create', path);
    },

    modify(path, body, opts) {
        this.recordRequest('modify', path, body, opts);
        return this.respond('modify', path);
    },

    replace(path, body, opts) {
        this.recordRequest('replace', path, body, opts);
        return this.respond('replace', path);
    },

    delete(path, body, opts) {
        this.recordRequest('delete', path, body, opts);
        return this.respond('delete', path);
    },

    setAuthToken(token) {
        this.authToken = token;
    },

    setRefreshToken(refreshToken) {
        this.refreshToken = refreshToken;
    },

    numRequests: {},
    requestMap: {},
    responseMap: {},
    nextResponseMap: {},
    errorMap: {},
    lastCall: {},

    when(method, path, response) {
        this.responseMap[`${method}_${path}`] = response;
    },

    whenNext(method, path, response) {
        const key = `${method}_${path}`;
        if (!this.nextResponseMap[key]) {
            this.nextResponseMap[key] = [];
        }
        this.nextResponseMap[key].push(response);
    },

    /**
     * Tells mock to fail the given request
     *
     * @param {String} method - Method for request ('list' | 'create' | 'modify', etc)
     * @param {String} path   - Path for request
     * @param {Object} [err]  - Specific error for request. Default generic error.
     */
    fail(method, path, err) {
        this.responseMap[`${method}_${path}`] = FAIL_REQUEST;
        this.errorMap[`${method}_${path}`] = err;
    },

    reset() {
        this.numRequests = {};
        this.responseMap = {};
        this.nextResponseMap = {};
        this.requestMap = {};
        this.lastCall.method = '';
        this.lastCall.path = '';
        this.lastCall.body = null;
        this.lastCall.opts = {};
        this.defaultResponse = true;
    },

    setDefaultResponse(defaultResponse) {
        this.defaultResponse = defaultResponse;
    },

    recordRequest(method, path, body, opts) {
        const key = `${method}_${path}`;
        if (typeof this.numRequests[key] === 'undefined') {
            this.numRequests[key] = 1;
        } else {
            this.numRequests[key] += 1;
        }
        if (!this.requestMap[key]) {
            this.requestMap[key] = [];
        }
        this.requestMap[key].unshift(body);
        this.lastCall.method = method;
        this.lastCall.path = path;
        this.lastCall.body = body;
        this.lastCall.opts = opts;
    },

    getNumRequests(method, path) {
        const key = `${method}_${path}`;
        return this.numRequests[key] || 0;
    },

    getRequest(method, path) {
        const key = `${method}_${path}`;
        if (this.requestMap[key]) {
            return this.requestMap[key].pop();
        }
        return undefined;
    },

    respond(method, path) {
        const key = `${method}_${path}`;
        const response = this.responseMap[key];

        if (this.nextResponseMap[key] && this.nextResponseMap[key].length > 0) {
            this.responseMap[key] = this.nextResponseMap[key].shift();
        }

        if (response === FAIL_REQUEST) {
            const error = this.errorMap[key];
            if (error) {
                return q.reject(error);
            }
            return q.reject(new Error('We were told to fail this.'));
        }

        return q(response || this.defaultResponse);
    }
};
