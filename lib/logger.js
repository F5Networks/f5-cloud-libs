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
     * @param {Object}  [options.module]   - The module the logger is used from. Used to put the file name in the log message.
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
            handleExceptions: false,
            humanReadableUnhandledException: true,
            label: getLabel(options),
            formatter: function(options) {
                if (options.meta) {
                    var keys = Object.keys(options.meta);
                    var maskRegex = new RegExp('pass(word|phrase)', 'i');
                    keys.forEach(function(key) {
                        if (maskRegex.test(key)) {
                            options.meta[key] = '********';
                        }
                    });
                }

                return getMessage.call(this, options);
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
                transports: transports
            }
        );
    }
};

// Return the last folder name in the path and the calling
// module's filename.
var getLabel = function(options) {
    var parts;
    var label = '';

    if (options.module) {
        if (options.logLevel === 'debug' || options.logLevel === 'silly') {
            parts = options.module.filename.split('/');
            label = parts[parts.length - 2] + '/' + parts.pop();
        }
    }

    return label;
};

var getMessage = function(options) {
    var message = (options.message ? options.message.replace(/password=.+/g, 'password=********') : '');
    message = message.replace(/passphrase=.+/g, 'passphrase=********');
    return options.timestamp() +
        ' ' +
        this.level +
        ': ' +
        (this.label ? '[pid: ' + process.pid + '] [' + this.label + '] ' : '') +
        message +
        (options.meta && Object.keys(options.meta).length ? ' ' + JSON.stringify(options.meta) : '');
};
