/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
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

    delete: function(path, opts) {
        this.recordRequest('delete', path, null, opts);
        return this.respond('delete', path);
    },

    requestMap: {},

    responseMap: {},

    lastCall: {},

    when: function(method, path, response) {
        this.responseMap[method + '_' + path] = response;
    },

    fail: function(method, path) {
        this.responseMap[method + '_' + path] = FAIL_REQUEST;
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
        var key = method + '_' + path;
        if (!this.requestMap[key]) {
            this.requestMap[key] = [];
        }
        this.requestMap[key].unshift(body);
        this.lastCall.method = method;
        this.lastCall.path = path;
        this.lastCall.body = body;
        this.lastCall.opts = opts;
    },

    getRequest: function(method, path) {
        var key = method + '_' + path;
        if (this.requestMap[key]) {
            return this.requestMap[key].pop();
        }
    },

    respond: function(method, path) {
        var response = this.responseMap[method + '_' + path];

        if (response === FAIL_REQUEST) {
            return q.reject();
        }
        else {
            return q(response || true);
        }
    }
};

