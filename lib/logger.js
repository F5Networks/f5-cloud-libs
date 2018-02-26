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

const winston = require('winston');

/**
 * @module
 */
module.exports = {
    /**
     * Returns a logger.
     *
     * @param {Object}  [options]          - Options for configuring the logger
     * @param {Boolean} [options.console]  - Whether or not to log to the console. Default true.
     * @param {String}  [options.logLevel] - The log level to use. (error, warn, info, verbose, debug, silly).
     *                                       Defaults to warn.
     * @param {String}  [options.fileName] - File to log to. Defaults to none (console only).
     * @param {Object}  [options.module]   - The module the logger is used from. Used to put the file name
     *                                       in the log message.
     *
     * @returns An instance of a logger
     */
    getLogger(options) {
        const logToConsole = options ? options.console : true;
        const logLevel = options ? options.logLevel : 'warn';
        const fileName = options ? options.fileName : '';
        const moduleLogging = options ? options.module : {};

        const transportOptions = {
            level: logLevel,
            timestamp() {
                return new Date().toISOString();
            },
            json: false,
            handleExceptions: false,
            humanReadableUnhandledException: true,
            label: getLabel(logLevel, moduleLogging),
            formatter(formatOptions) {
                return getMessage.call(this, formatOptions);
            }
        };

        const transports = [];

        if (logToConsole) {
            transports.push(new (winston.transports.Console)(transportOptions));
        }

        if (fileName) {
            const fileOptions = transportOptions;
            fileOptions.filename = fileName;
            fileOptions.maxSize = 10485760; // 10 Mb
            fileOptions.maxFiles = 10;
            fileOptions.tailable = true;

            transports.push(new (winston.transports.File)(fileOptions));
        }

        return new (winston.Logger)({ transports });
    }
};

// Return the last folder name in the path and the calling
// module's filename.
function getLabel(logLevel, moduleLogging) {
    let parts;
    let label = '';

    if (moduleLogging) {
        if (logLevel === 'debug' || logLevel === 'silly') {
            parts = moduleLogging.filename.split('/');
            label = `${parts[parts.length - 2]}/${parts.pop()}`;
        }
    }

    return label;
}

function getMessage(options) {
    const messageOptions = Object.assign({}, options);

    if (messageOptions.meta) {
        const keys = Object.keys(messageOptions.meta);
        const maskRegex = new RegExp('^pass(word|phrase)$', 'i');
        keys.forEach((key) => {
            if (maskRegex.test(key)) {
                messageOptions.meta[key] = '********';
            }
        });
    }

    const label = this.label ? `[pid: ${process.pid}] [${this.label}]` : '';
    const metaData =
        messageOptions.meta && Object.keys(messageOptions.meta).length ?
            `${JSON.stringify(messageOptions.meta)}` : '';
    let message =
        (messageOptions.message ? messageOptions.message.replace(/password=.+/g, 'password=********') : '');
    message = message.replace(/passphrase=.+/g, 'passphrase=********');

    return `${messageOptions.timestamp()} ${this.level}: ${label} ${message} ${metaData}`;
}
