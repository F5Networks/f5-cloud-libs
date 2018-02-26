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

const URL = require('url');
const http = require('http');
const https = require('https');
const q = require('q');

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
    get(url, options) {
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
    post(url, options) {
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
    patch(url, options) {
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
    put(url, options) {
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
    delete(url, options) {
        return this.request('DELETE', url, options);
    },

    request(method, url, options) {
        const parsedUrl = URL.parse(url);
        const deferred = q.defer();
        const requestOptions = {};
        let httpRequest;
        let executor;

        const headers = options ? options.headers : undefined;
        let body = options ? options.body : undefined;

        try {
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                executor = parsedUrl.protocol === 'http:' ? http : https;
                requestOptions.protocol = parsedUrl.protocol;
                requestOptions.hostname = parsedUrl.hostname;
                requestOptions.port = parsedUrl.port;
                requestOptions.path = parsedUrl.pathname + (parsedUrl.search ? parsedUrl.search : '');
                requestOptions.headers = headers || {};
                requestOptions.method = method;

                if (body) {
                    if (requestOptions.headers['Content-Type'] === 'application/json') {
                        body = JSON.stringify(body);
                    }
                    requestOptions.headers['Content-Length'] = Buffer.byteLength(body);
                }

                httpRequest = executor.request(requestOptions, (response) => {
                    const statusCode = response.statusCode;
                    const contentType = response.headers['content-type'];
                    let rawData = '';
                    let data;

                    if (statusCode >= 300) {
                        const message = `${url.toString()} returned with status code ${statusCode}`;
                        deferred.reject(new Error(message));
                        response.resume();
                    }

                    response.setEncoding('utf8');
                    response.on('data', (chunk) => {
                        rawData += chunk;
                    });
                    response.on('end', () => {
                        if (contentType && contentType.indexOf('application/json') !== -1) {
                            data = JSON.parse(rawData);
                        } else {
                            data = rawData.trim();
                        }
                        deferred.resolve(data);
                    });
                })
                    .on('error', (err) => {
                        deferred.reject(err);
                    });

                if (body) {
                    httpRequest.write(body);
                }

                httpRequest.end();
            } else {
                deferred.reject(new Error('Only http, and https URLs are supported.'));
            }
        } catch (err) {
            deferred.reject(err);
        }

        return deferred.promise;
    }
};
