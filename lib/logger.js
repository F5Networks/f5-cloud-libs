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

 var winston = require('winston');

/**
 * @module
 */
module.exports = {
    /**
     * Returns a logger.
     *
     * @param {Object}  [options]          - Options for configuring the logger
     * @param {Boolean} [options.console] - Whether or not to log to the console. Default true.
     * @param {String}  [options.logLevel] - The log level to use. (error, warn, info, verbose, debug, silly). Defaults to warn.
     * @param {String}  [options.fileName] - File to log to. Defaults to none (console only).
     *
     * @returns An instance of a logger
     */
    getLogger: function(options) {
        options = options || {};
        if (typeof options.console === 'undefined') {
            options.console = true;
        }

        var transportOptions = {
            level: options.logLevel || 'warn',
            timestamp: function() {
                return new Date().toISOString();
            },
            json: false,
            handleExceptions: true,
            humanReadableUnhandledException: true,
            formatter: function(options) {
                if (options.meta) {
                    var keys = Object.keys(options.meta);
                    keys.forEach(function(key) {
                        if (key.toLowerCase() === 'password') {
                            options.meta[key] = '********';
                        }
                    });
                }
                return options.timestamp() + ' ' + options.level + ': ' + (options.message ? options.message.replace(/password=.+/g, 'password=********') : '') + (options.meta && Object.keys(options.meta).length ? ' ' + JSON.stringify(options.meta) : '');
            }
        };

        var transports = [];

        if (options.console) {
            transports.push(new (winston.transports.Console)(transportOptions));
        }

        if (options.fileName) {
            var fileOptions = transportOptions;
            fileOptions.filename = options.fileName;
            fileOptions.maxSize = 10485760; // 10 Mb
            fileOptions.maxFiles = 10;
            fileOptions.tailable = true;

            transports.push(new (winston.transports.File)(fileOptions));
        }

        return new (winston.Logger)(
            {
                transports: transports,
                exitOnError: false
            }
        );
    }
};
