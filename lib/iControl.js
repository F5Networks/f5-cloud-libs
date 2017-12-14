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

var https = require('https');
var q = require('q');

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
var IControl = function(options) {
    options = options || {};

    // Set default options
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 443;
    this.user = options.user || 'admin';
    this.password = options.password || 'admin';
    this.authToken = options.authToken;
    this.basePath = options.basePath || '/mgmt';
    this.strict = typeof options.strict !== 'undefined' ? options.strict : true;

    this.auth = this.user + ':' + this.password;

    this.https = https;
};

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
IControl.prototype.list = function(path, options) {
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
IControl.prototype.create = function(path, body, options) {
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
IControl.prototype.modify = function(path, body, options) {
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
IControl.prototype.replace = function(path, body, options) {
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
IControl.prototype.delete = function(path, body, options) {
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
IControl.prototype.request = function(method, path, body, options) {
    var deferred = q.defer();
    var requestOptions = {
        hostname: this.host,
        port: this.port,
        method: method,
        path: this.basePath + path,
        rejectUnauthorized: this.strict,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var header;
    var httpRequest;
    var responseHandler;

    if (this.authToken) {
        requestOptions.headers['X-F5-Auth-Token'] = this.authToken;
    }
    else {
        requestOptions.auth = this.auth;
    }

    options = options || {};

    // Add any headers that were specified
    if (options.headers) {
        for (header in options.headers) {
            if (options.headers.hasOwnProperty(header)) {
                if (header.toLowerCase() === 'content-type') {
                    requestOptions.headers['Content-Type'] = options.headers[header];
                }
                else {
                    requestOptions.headers[header] = options.headers[header];
                }
            }
        }
    }

    if (requestOptions.headers['Content-Type'] === 'application/json') {
        if (body) {
            body = JSON.stringify(body);
        }
    }

    if (body) {
        requestOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    responseHandler = options.noWait ? undefined : function(response) {
        var totalResponse = '';
        response.on('data', function(chunk) {
            totalResponse += chunk;
        });

        response.on('end', function() {
            var headers = response.headers;
            var parsedResponse;

            if (headers['content-type'] && headers['content-type'].indexOf('application/json') !== -1) {
                try {
                    parsedResponse = JSON.parse(totalResponse || '{}');
                }
                catch (err) {
                    deferred.reject(new Error("Unable to parse JSON response: " + err.message));
                    return;
                }

                if (method === 'GET' && parsedResponse.items) {
                    parsedResponse = parsedResponse.items;
                }
            }
            else {
                parsedResponse = totalResponse;
            }

            if (response.statusCode >= 300) {
                deferred.reject(parsedResponse);
            }
            else {
                deferred.resolve(parsedResponse);
            }
        });
    };

    httpRequest = this.https.request(requestOptions, responseHandler);

    if (body) {
        httpRequest.write(body);
    }

    httpRequest.on('error', function(err) {
        if (!options.noWait) {
            deferred.reject(err);
        }
    });

    httpRequest.end();

    if (options.noWait) {
        deferred.resolve();
    }

    return deferred.promise;
};

module.exports = IControl;
