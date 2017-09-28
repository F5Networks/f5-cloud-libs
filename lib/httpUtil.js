/**
 * Copyright 2016-2017 F5 Networks, Inc.
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

/**
 * @module
 */
module.exports = {
    /**
     * Gets data from a URL.
     *
     * @param {String}   url               - URL from which to get the data.
     * @param {Object}   [options]         - Optional parameters
     * @param {Object}   [options.headers] - Map of headers to add to the request. Format:
     *
     *                   {
     *                       <header1_name>: <header1_value>,
     *                       <header2_name>: <header2_value>
     *                   }
     *
     * @returns {String} A promise which will be resolved with the data
     *                   or rejected if an error occurs.
     */
    get: function(url, options) {
        return this.request('GET', url, options);
    },

    /**
     * Posts data to a URL.
     *
     * @param {String}   url               - URL from which to get the data.
     * @param {Object}   [options]         - Optional parameters
     * @param {Object}   [options.headers] - Map of headers to add to the request. Format:
     *
     *                   {
     *                       <header1_name>: <header1_value>,
     *                       <header2_name>: <header2_value>
     *                   }
     * @param {Object}   [options.body]     - Body to send with request
     *
     * @returns {String} A promise which will be resolved with the data
     *                   or rejected if an error occurs.
     */
    post: function(url, options) {
        return this.request('POST', url, options);
    },

    /**
     * Patches data to a URL.
     *
     * @param {String}   url               - URL from which to get the data.
     * @param {Object}   [options]         - Optional parameters
     * @param {Object}   [options.headers] - Map of headers to add to the request. Format:
     *
     *                   {
     *                       <header1_name>: <header1_value>,
     *                       <header2_name>: <header2_value>
     *                   }
     * @param {Object}   [options.body]     - Body to send with request
     *
     * @returns {String} A promise which will be resolved with the data
     *                   or rejected if an error occurs.
     */
    patch: function(url, options) {
        return this.request('PATCH', url, options);
    },

    /**
     * Puts data to a URL.
     *
     * @param {String}   url               - URL from which to get the data.
     * @param {Object}   [options]         - Optional parameters
     * @param {Object}   [options.headers] - Map of headers to add to the request. Format:
     *
     *                   {
     *                       <header1_name>: <header1_value>,
     *                       <header2_name>: <header2_value>
     *                   }
     * @param {Object}   [options.body]     - Body to send with request
     *
     * @returns {String} A promise which will be resolved with the data
     *                   or rejected if an error occurs.
     */
    put: function(url, options) {
        return this.request('PUT', url, options);
    },

    /**
     * Deletes data from a URL.
     *
     * @param {String}   url               - URL from which to get the data.
     * @param {Object}   [options]         - Optional parameters
     * @param {Object}   [options.headers] - Map of headers to add to the request. Format:
     *
     *                   {
     *                       <header1_name>: <header1_value>,
     *                       <header2_name>: <header2_value>
     *                   }
     * @param {Object}   [options.body]     - Body to send with request
     *
     * @returns {String} A promise which will be resolved with the data
     *                   or rejected if an error occurs.
     */
    delete: function(url, options) {
        return this.request('DELETE', url, options);
    },

    request: function(method, url, options) {
        var URL = require('url');
        var parsedUrl = URL.parse(url);
        var deferred = q.defer();
        var requestOptions = {};
        var httpRequest;
        var executor;

        options = options || {};

        try {
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                executor = parsedUrl.protocol === 'http:' ? require('http') : require('https');
                requestOptions.protocol = parsedUrl.protocol;
                requestOptions.hostname = parsedUrl.hostname;
                requestOptions.port = parsedUrl.port;
                requestOptions.path = parsedUrl.pathname + (parsedUrl.search ? parsedUrl.search : '');
                requestOptions.headers = options.headers;
                requestOptions.method = method;

                if (options.body) {
                    if (requestOptions.headers['Content-Type'] === 'application/json') {
                        options.body = JSON.stringify(options.body);
                    }
                    requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
                }

                httpRequest = executor.request(requestOptions, function(response) {
                    const statusCode = response.statusCode;
                    const contentType = response.headers['content-type'];
                    var rawData = '';
                    var data;

                    if (statusCode >= 300) {
                        deferred.reject(new Error(url.toString() + ' returned with status code ' + statusCode));
                        response.resume();
                        return;
                    }

                    response.setEncoding('utf8');
                    response.on('data', function (chunk) {
                        rawData += chunk;
                    });
                    response.on('end', function() {
                        if (contentType && contentType.indexOf('application/json') !== -1) {
                            data = JSON.parse(rawData);
                        }
                        else {
                            data = rawData.trim();
                        }
                        deferred.resolve(data);
                    });
                })
                .on('error', function(err) {
                    deferred.reject(err);
                });

                if (options.body) {
                    httpRequest.write(options.body);
                }

                httpRequest.end();
            }
            else {
                deferred.reject(new Error('Only http, and https URLs are supported.'));
            }
        }
        catch (err) {
            deferred.reject(err);
        }

        return deferred.promise;
    }
};