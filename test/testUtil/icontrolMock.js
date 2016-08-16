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

module.exports = {
    list: function(path, opts, cb) {
        this.recordRequest('list', path, null, opts);
        this.respond('list', path, cb);
    },

    create: function(path, body, opts, cb) {
        this.recordRequest('create', path, body, opts);
        this.respond('create', path, cb);
    },

    modify: function(path, body, opts, cb) {
        this.recordRequest('modify', path, body, opts);
        this.respond('modify', path, cb);
    },

    delete: function(path, opts, cb) {
        this.recordRequest('delete', path, null, opts);
        this.respond('delete', path, cb);
    },

    requestMap: {},

    responseMap: {},

    lastCall: {},

    when: function(method, path, response) {
        this.responseMap[method + '_' + path] = response;
    },

    reset: function() {
        this.responseMap = {};

        this.requestMap = {};
        this.lastCall.method = '';
        this.lastCall.path = '';
        this.lastCall.body = null;
        this.lastCall.opts = {};
    },

    recordRequest: function(method, path, body, opts) {
        this.requestMap[method + '_' + path] = body;
        this.lastCall.method = method;
        this.lastCall.path = path;
        this.lastCall.body = body;
        this.lastCall.opts = opts;
    },

    getRequest: function(method, path) {
        return this.requestMap[method + '_' + path];
    },

    respond: function(method, path, cb) {
        cb(false, this.responseMap[method + '_' + path] || true);
    }
};

