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

var q = require('q');

var FAIL_REQUEST = "FAIL_REQUEST";

module.exports = {
    list: function(path, opts) {
        this.recordRequest('list', path, null, opts);
        return this.respond('list', path);
    },

    create: function(path, body, opts) {
        this.recordRequest('create', path, body, opts);
        return this.respond('create', path);
    },

    modify: function(path, body, opts) {
        this.recordRequest('modify', path, body, opts);
        return this.respond('modify', path);
    },

    replace: function(path, body, opts) {
        this.recordRequest('replace', path, body, opts);
        return this.respond('replace', path);
    },

    delete: function(path, body, opts) {
        this.recordRequest('delete', path, body, opts);
        return this.respond('delete', path);
    },

    setAuthToken: function(token) {
        this.authToken = token;
    },

    setRefreshToken: function(refreshToken) {
        this.refreshToken = refreshToken;
    },

    numRequests: {},
    requestMap: {},
    responseMap: {},
    nextResponseMap: {},
    errorMap: {},
    lastCall: {},

    when: function(method, path, response) {
        this.responseMap[method + '_' + path] = response;
    },

    whenNext: function(method, path, response) {
        const key = method + '_' + path;
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
    fail: function(method, path, err) {
        this.responseMap[method + '_' + path] = FAIL_REQUEST;
        this.errorMap[method + '_' + path] = err;
    },

    reset: function() {
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

    setDefaultResponse: function(defaultResponse) {
        this.defaultResponse = defaultResponse;
    },

    recordRequest: function(method, path, body, opts) {
        var key = method + '_' + path;
        if (typeof this.numRequests[key] === 'undefined') {
            this.numRequests[key] = 1;
        } else {
            this.numRequests[key]++;
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

    getNumRequests: function(method, path) {
        var key = method + '_' + path;
        return this.numRequests[key] || 0;
    },

    getRequest: function(method, path) {
        var key = method + '_' + path;
        if (this.requestMap[key]) {
            return this.requestMap[key].pop();
        }
    },

    respond: function(method, path) {
        const key = method + '_' + path;
        var response = this.responseMap[key];

        if (this.nextResponseMap[key] && this.nextResponseMap[key].length > 0) {
            this.responseMap[key] = this.nextResponseMap[key].shift();
        }

        if (response === FAIL_REQUEST) {
            const error = this.errorMap[key]
            if (error) {
                return q.reject (error);
            }
            return q.reject(new Error('We were told to fail this.'));
        }

        return q(response || this.defaultResponse);
    }
};
