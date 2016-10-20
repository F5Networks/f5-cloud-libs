/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
 */
'use strict';

module.exports = {
    clientRequest: {
        eventMap: {},
        incomingMessage: {
            eventMap: {},
            headers: {},
            statusCode: 200,
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
            this.cb(this.incomingMessage);
            this.incomingMessage.emit('data', this.response);
            this.incomingMessage.emit('end');
        },
        on: function(event, cb) {
            this.eventMap[event] = cb;
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

    setResponse: function(response, headers) {
        var key;
        var lowerCaseHeaders = {};
        this.clientRequest.response = typeof response === 'object' ? JSON.stringify(response) : response;
        for (key in headers) {
            lowerCaseHeaders[key.toLowerCase()] = headers[key];
        }
        this.clientRequest.incomingMessage.headers = lowerCaseHeaders;
    },

    reset: function() {
        delete this.clientRequest.cb;
        delete this.clientRequest.data;
        delete this.clientRequest.response;
        delete this.clientRequest.timeout;
        this.clientRequest.incomingMessage.headers = {};
        this.clientRequest.eventMap = {};
        delete this.lastRequest;
    }
};