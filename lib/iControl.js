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

const https = require('https');
const q = require('q');

/**
 * Creates an IControl object
 * @class
 *
 * @param {Object}  [options]           - Options for the creation.
 * @param {String}  [options.host]      - IP Address to connect to. Default 127.0.0.1
 * @param {Number}  [options.port]      - Port to use. Default 443.
 * @param {String}  [options.user]      - User to use for auth. Default admin.
 * @param {String}  [options.password]  - Password to use for auth. Default admin.
 * @param {String}  [options.authToken] - Auth token to use rather than user and password.
 * @param {String}  [options.basePath]  - Base path to prepend to paths for all requests. Default /mgmt
 * @param {Boolean} [options.strict]    - Whether or not to validate SSL certificates.
 */
function IControl(options) {
    const opts = options || {};

    // Set default options
    this.host = opts.host || '127.0.0.1';
    this.port = opts.port || 443;
    this.user = opts.user || 'admin';
    this.password = opts.password || 'admin';
    this.authToken = opts.authToken;
    this.basePath = opts.basePath || '/mgmt';
    this.strict = typeof opts.strict !== 'undefined' ? opts.strict : true;

    this.auth = `${this.user}:${this.password}`;

    this.https = https;
}

/**
 * Executes a list (GET) request
 *
 * @param {String}  path              - Path for the request.
 * @param {Object}  [options]         - Options for the request.
 * @param {Boolean} [options.noWait]  - Don't wait for a response. Default false (wait for a response).
 * @param {Object}  [options.headers] - Headers to use in the request. Default
 *                                      {
 *                                          'Content-Type': 'application/json'
 *                                      }
 *
 * @returns {Promise} A promise which is resolved with the results of the request
 *                    or rejected if an error occurs. If the response is JSON that
 *                    has 'items' in it, only the items are returned.
 */
IControl.prototype.list = function list(path, options) {
    return this.request('GET', path, undefined, options);
};

/**
 * Executes a create (POST) request
 *
 * @param {String}  path              - Path for the request.
 * @param {Object}  [body]            - Body of the request.
 * @param {Object}  [options]         - Options for the request.
 * @param {Boolean} [options.noWait]  - Don't wait for a response. Default false (wait for a response).
 * @param {Object}  [options.headers] - Headers to use in the request. Default
 *                                      {
 *                                          'Content-Type': 'application/json'
 *                                      }
 *
 * @returns {Promise} A promise which is resolved with the results of the request
 *                    or rejected if an error occurs.
 */
IControl.prototype.create = function create(path, body, options) {
    return this.request('POST', path, body, options);
};

/**
 * Executes a modify (PATCH) request
 *
 * @param {String}  path              - Path for the request.
 * @param {Object}  [body]            - Body of the request.
 * @param {Object}  [options]         - Options for the request.
 * @param {Boolean} [options.noWait]  - Don't wait for a response. Default false (wait for a response).
 * @param {Object}  [options.headers] - Headers to use in the request. Default
 *                                      {
 *                                          'Content-Type': 'application/json'
 *                                      }
 *
 * @returns {Promise} A promise which is resolved with the results of the request
 *                    or rejected if an error occurs.
 */
IControl.prototype.modify = function modify(path, body, options) {
    return this.request('PATCH', path, body, options);
};


/**
 * Executes a replace (PUT) request
 *
 * @param {String}  path              - Path for the request.
 * @param {Object}  [body]            - Body of the request.
 * @param {Object}  [options]         - Options for the request.
 * @param {Boolean} [options.noWait]  - Don't wait for a response. Default false (wait for a response).
 * @param {Object}  [options.headers] - Headers to use in the request. Default
 *                                      {
 *                                          'Content-Type': 'application/json'
 *                                      }
 *
 * @returns {Promise} A promise which is resolved with the results of the request
 *                    or rejected if an error occurs.
 */
IControl.prototype.replace = function replace(path, body, options) {
    return this.request('PUT', path, body, options);
};

/**
 * Executes a delete (DELETE) request
 *
 * @param {String}  path              - Path for the request.
 * @param {Object}  [body]            - Body of the request.
 * @param {Object}  [options]         - Options for the request.
 * @param {Boolean} [options.noWait]  - Don't wait for a response. Default false (wait for a response).
 * @param {Object}  [options.headers] - Headers to use in the request. Default
 *                                      {
 *                                          'Content-Type': 'application/json'
 *                                      }
 *
 * @returns {Promise} A promise which is resolved with the results of the request
 *                    or rejected if an error occurs. If the response is JSON that
 *                    has 'items' in it, only the items are returned.
 */
IControl.prototype.delete = function deletex(path, body, options) {
    return this.request('DELETE', path, body, options);
};

/**
 * Executes a request
 *
 * @param {String}  method            - HTTP method for the request.
 * @param {String}  path              - Path for the request.
 * @param {Object}  [body]            - Body of the request.
 * @param {Object}  [options]         - Options for the request.
 * @param {Boolean} [options.noWait]  - Don't wait for a response. Default false (wait for a response).
 * @param {Object}  [options.headers] - Headers to use in the request. Default
 *                                      {
 *                                          'Content-Type': 'application/json'
 *                                      }
 *
 * @returns {Promise} A promise which is resolved with the results of the request
 *                    or rejected if an error occurs.
 */
IControl.prototype.request = function request(method, path, body, options) {
    const deferred = q.defer();
    const requestOptions = {
        method,
        hostname: this.host,
        port: this.port,
        path: this.basePath + path,
        rejectUnauthorized: this.strict,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (this.authToken) {
        requestOptions.headers['X-F5-Auth-Token'] = this.authToken;
    } else {
        requestOptions.auth = this.auth;
    }

    const noWait = options ? options.noWait : undefined;
    const headers = options ? options.headers : undefined;

    let mungedBody = body;

    // Add any headers that were specified
    if (headers) {
        Object.keys(headers).forEach((header) => {
            if (header.toLowerCase() === 'content-type') {
                requestOptions.headers['Content-Type'] = headers[header];
            } else {
                requestOptions.headers[header] = headers[header];
            }
        });
    }

    if (requestOptions.headers['Content-Type'] === 'application/json') {
        if (mungedBody) {
            mungedBody = JSON.stringify(body);
        }
    }

    if (mungedBody) {
        requestOptions.headers['Content-Length'] = Buffer.byteLength(mungedBody);
    }

    const responseHandler = noWait ? undefined : (response) => {
        let totalResponse = '';
        response.on('data', (chunk) => {
            totalResponse += chunk;
        });

        response.on('end', () => {
            const responseHeaders = response.headers;
            let parsedResponse;

            if (responseHeaders['content-type']
                && responseHeaders['content-type'].indexOf('application/json') !== -1
            ) {
                try {
                    parsedResponse = JSON.parse(totalResponse || '{}');
                } catch (err) {
                    deferred.reject(new Error(`Unable to parse JSON response: ${err.message}`));
                    return;
                }

                if (method === 'GET' && parsedResponse.items) {
                    parsedResponse = parsedResponse.items;
                }
            } else {
                parsedResponse = totalResponse;
            }

            if (response.statusCode >= 300) {
                deferred.reject(parsedResponse);
            } else {
                deferred.resolve(parsedResponse);
            }
        });
    };

    const httpRequest = this.https.request(requestOptions, responseHandler);

    if (mungedBody) {
        httpRequest.write(mungedBody);
    }

    httpRequest.on('error', (err) => {
        if (!noWait) {
            deferred.reject(err);
        }
    });

    httpRequest.end();

    if (noWait) {
        deferred.resolve();
    }

    return deferred.promise;
};

module.exports = IControl;
