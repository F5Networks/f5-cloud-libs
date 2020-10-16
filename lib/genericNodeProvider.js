/**
 * Copyright 2018 F5 Networks, Inc.
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

const util = require('util');
const q = require('q');
const jmespath = require('jmespath');

const CloudProvider = require('./cloudProvider');
const Logger = require('./logger');
const cloudUtil = require('./util');
const cryptoUtil = require('./cryptoUtil');

let logger;

util.inherits(GenericNodeProvider, CloudProvider);

/**
 * Constructor
 * @class
 * @classdesc
 * Generic node provider implementation.
 *
 * @param {Object} [options]               - Options for the instance.
 * @param {Object} [options.clOptions]     - Command line options if called from a script.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function GenericNodeProvider(options) {
    GenericNodeProvider.super_.call(this, options);

    this.loggerOptions = options ? options.loggerOptions : undefined;

    logger = options ? options.logger : undefined;

    if (logger) {
        this.logger = logger;
        cloudUtil.setLogger(logger);
        cryptoUtil.setLogger(logger);
    } else if (this.loggerOptions) {
        this.loggerOptions.module = module;
        logger = Logger.getLogger(this.loggerOptions);
        cloudUtil.setLoggerOptions(this.loggerOptions);
        cryptoUtil.setLoggerOptions(this.loggerOptions);
        this.logger = logger;
    } else {
        // use super's logger
        logger = this.logger;
        cloudUtil.setLogger(logger);
        cryptoUtil.setLogger(logger);
    }
}


/**
 * Initialize class
 *
 * Override for implementation specific initialization needs (read info
 * from cloud provider, read database, etc.). Called at the start of
 * processing.
 *
 * @param {Object}  providerOptions                        - Provider specific options.
 * @param {String}  providerOptions.propertyPathId         - Object property path ('.' separated)
 *                                                           that describes how to fetch the ID
 *                                                           from the provided resource. An empty
 *                                                           property name in the path fetches all
 *                                                           keys in the current object.
 *
 *     "example.uuid",
 *
 *                                                           Alternately you can use jmesPathQuery
 *
 *
 * @param {String}  providerOptions.propertyPathIpPrivate  - Object property path ('.' separated)
 *                                                           that describes how to fetch the private
 *                                                           IP from the provided resource. An empty
 *                                                           property name in the path fetches all
 *                                                           keys in the current object.
 *
 *     "example.address.private"
 *
 *                                                           Alternately you can use jmesPathQuery
 *
 *
 * @param {String}  [providerOptions.propertyPathIpPublic] - Object property path ('.' separated)
 *                                                           that describes how to fetch the public
 *                                                           IP from the provided resource. An empty
 *                                                           property name in the path fetches all
 *                                                           keys in the current object.
 *
 *     "example.address.public"
 *
 *                                                           Alternately you can use jmesPathQuery
 *
 *
 * @param {String}  [providerOptions.jmesPathQuery] -        Use a JMESPath query to construct the
 *                                                           data structure that is returned from
 *                                                           the URI.  The query should return both
 *                                                           a string value for "ip.private" and "id"
 *
 *     "[*].{id:ID||Node,ip:{private:Node,public:Node}}"
 *
 * @param {Object}  [options]                                 - Options for this instance.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
GenericNodeProvider.prototype.init = function init(providerOptions, options) {
    this.initOptions = options || {};
    this.providerOptions = providerOptions || {};

    if (typeof this.providerOptions.propertyPathId !== 'string' &&
        (!this.providerOptions.jmesPathQuery)) {
        return q.reject(new Error('ProviderOptions.propertyPathId required to fetch node data'));
    }
    if (typeof this.providerOptions.propertyPathIpPrivate !== 'string' &&
        (!this.providerOptions.jmesPathQuery)) {
        return q.reject(new Error('ProviderOptions.propertyPathIpPrivate required to fetch node data'));
    }

    if (typeof this.providerOptions.propertyPathId === 'string') {
        this.propertyPaths = {};
        Object.keys(this.providerOptions).forEach((key) => {
            if (key.startsWith('propertyPath')) {
                this.propertyPaths[key] = this.providerOptions[key].split('.');
            }
        });
        this.propertyPaths = Object.assign({
            propertyPathIpPublic: []
        }, this.propertyPaths);
    }

    return q();
};


/**
 * Gets nodes from the provided URI. The resource should be in JSON
 * format as an array of objects. JSON strings that parse to an array
 * of objects are also supported.
 *
 * @param {String} uri               - The URI of the resource.
 * @param {Object} [options]         - http/https request options
 *
 * @returns {Promise} A promise which will be resolved with an array of instances.
 *                    Each instance value should be:
 *
 *     {
 *         id: Node ID,
 *         ip: {
 *             public: public IP,
 *             private: private IP
 *         }
 *     }
 */
GenericNodeProvider.prototype.getNodesFromUri = function getNodesFromUri(uri, options) {
    return cloudUtil.getDataFromUrl(uri, options)
        .then((data) => {
            const nodes = [];
            let resData = data;

            if (typeof resData === 'string') {
                try {
                    resData = JSON.parse(data);
                } catch (e) {
                    return q.reject(new Error(`${e.message}. Data must parse to a JSON array of objects.`));
                }
            }

            if (!Array.isArray(resData)) {
                return q.reject(new Error('Data must be a JSON array of objects.'));
            }
            if (this.providerOptions.jmesPathQuery) {
                resData = jmespath.search(resData, this.providerOptions.jmesPathQuery);
                resData = resData.filter((n) => {
                    return (typeof (n.id) === 'string' &&
                    (typeof (n.ip.private) === 'string' || typeof (n.ip.public) === 'string'));
                });
                return q(resData);
            }
            for (let i = 0; i < resData.length; i++) {
                const node = { ip: {} };
                node.id = getDataFromPropPath(this.propertyPaths.propertyPathId, resData[i]);
                node.ip.private = getDataFromPropPath(this.propertyPaths.propertyPathIpPrivate, resData[i]);
                node.ip.public = getDataFromPropPath(this.propertyPaths.propertyPathIpPublic, resData[i]);
                if (typeof node.id !== 'undefined' && typeof node.ip.private !== 'undefined') {
                    nodes.push(node);
                }
            }

            return q(nodes);
        });
};

/**
 * Gets the value from an Object's property using a provided Object property path. An empty
 * property name in the path fetches all keys in the current Object.
 *
 * @param {String[]} pathArray - Array of properties to traverse through.
 * @param {Object} obj - Object to traverse.
 *
 * @returns {*} Data that was fetched from the property.
 */
function getDataFromPropPath(pathArray, obj) {
    if (pathArray.length === 0) {
        return undefined;
    }
    return pathArray.reduce((result, prop) => {
        if (typeof result !== 'object' || result === null) {
            return {};
        }
        if (prop === '') {
            return result;
        }
        return result[prop];
    }, obj);
}

module.exports = GenericNodeProvider;
