/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
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
            timestamp: true,
            json: false
        };

        var transports = [];

        if (options.console) {
            transports.push(new (winston.transports.Console)(transportOptions));
        }

        if (options.fileName) {
            var fileOptions = JSON.parse(JSON.stringify(transportOptions));
            fileOptions.filename = options.fileName;
            fileOptions.maxSize = 10485760; // 10 Mb
            fileOptions.maxFiles = 10;
            fileOptions.tailable = true;

            transports.push(new(winston.transports.File)(fileOptions));
        }

        return new (winston.Logger)(
            {
                transports: transports
            }
        );
    }
};
