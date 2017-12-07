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
    clientRequest: {
        eventMap: {},
        incomingMessage: {
            eventMap: {},
            headers: {},
            statusCode: 200,
            setEncoding: function() {},
            on: function(event, cb) {
                this.eventMap[event] = cb;
            },
            emit: function(event, args) {
                if (this.eventMap[event]) {
                    this.eventMap[event](args);
                }
            }
        },
        end: function() {
            if (this.cb) {
                this.cb(this.incomingMessage);
            }
            this.incomingMessage.emit('data', this.response);
            this.incomingMessage.emit('end');
        },
        on: function(event, cb) {
            this.eventMap[event] = cb;
            return this;
        },
        setTimeout: function(timeout) {
            this.timeout = timeout;
        },
        write: function(data) {
            this.data = data;
        }
    },

    request: function(options, cb) {
        this.lastRequest = options;
        this.clientRequest.cb = cb;
        return this.clientRequest;
    },

    get: function(optionsOrPath, cb) {
        var clientRequest;

        if (typeof optionsOrPath === 'string') {
            clientRequest = this.request(
                {
                    method: 'GET',
                    path: optionsOrPath
                },
                cb
            );
        }
        else {
            clientRequest = this.request(
                {
                    method: 'GET',
                    path: optionsOrPath.path,
                    headers: optionsOrPath.headers
                },
                cb
            );
        }
        clientRequest.end();
        return clientRequest;
    },

    setResponse: function(response, headers, statusCode) {
        var key;
        var lowerCaseHeaders = {};

        headers = headers || {};
        this.clientRequest.response = typeof response === 'object' ? JSON.stringify(response) : response;
        for (key in headers) {
            lowerCaseHeaders[key.toLowerCase()] = headers[key];
        }
        this.clientRequest.incomingMessage.headers = lowerCaseHeaders;

        if (statusCode) {
            this.clientRequest.incomingMessage.statusCode = statusCode;
        }
    },

    reset: function() {
        delete this.clientRequest.cb;
        delete this.clientRequest.data;
        delete this.clientRequest.response;
        delete this.clientRequest.timeout;
        this.clientRequest.incomingMessage.headers = {};
        this.clientRequest.incomingMessage.statusCode = 200;
        this.clientRequest.eventMap = {};
        delete this.lastRequest;
    }
};