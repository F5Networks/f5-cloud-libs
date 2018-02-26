/**
 * Copyright 2017 F5 Networks, Inc.
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

var Logger = require('../../../f5-cloud-libs').logger;
var fs = require('fs');

const TEMP_LOGFILE = 'f5-cloud-libs-loggerTest.log.' + Date.now();

module.exports = {
    testConsole: function(test) {
        var logger = Logger.getLogger();
        test.ok(logger.transports.console, 'No conosle logger found.');
        test.done();
    },

    testNoConsole: function(test) {
        var logger = Logger.getLogger({console: false});
        test.ifError(logger.transports.console);
        test.done();
    },

    testLogfile: function(test) {
        var logger = Logger.getLogger({fileName: 'foo'});
        test.ok(logger.transports.file, 'No file logger found.');
        test.done();
    },

    testNoLogFile: function(test) {
        var logger = Logger.getLogger();
        test.ifError(logger.transports.file);
        test.done();
    },

    testLogMessages: {
        tearDown: function(callback) {
            fs.unlinkSync(TEMP_LOGFILE);
            callback();
        },

        testPasswordMask: function(test) {
            var logger = Logger.getLogger({console: false, fileName: TEMP_LOGFILE});
            var loggedMessage;

            logger.warn('password=1234', {Password: '5678'});

            setTimeout(function() {
                loggedMessage = fs.readFileSync(TEMP_LOGFILE).toString();
                test.notStrictEqual(loggedMessage.indexOf('password='), -1);
                test.notStrictEqual(loggedMessage.indexOf('"Password":'), -1);
                test.strictEqual(loggedMessage.indexOf('1234'), -1);
                test.strictEqual(loggedMessage.indexOf('5678'), -1);
                test.done();
            }, 10);
        },

        testPassphraseMask: function(test) {
            var logger = Logger.getLogger({console: false, fileName: TEMP_LOGFILE});
            var loggedMessage;

            logger.warn('passphrase=1234', {passphrase: '5678'});

            setTimeout(function() {
                loggedMessage = fs.readFileSync(TEMP_LOGFILE).toString();
                test.notStrictEqual(loggedMessage.indexOf('passphrase='), -1);
                test.notStrictEqual(loggedMessage.indexOf('"passphrase":'), -1);
                test.strictEqual(loggedMessage.indexOf('1234'), -1);
                test.strictEqual(loggedMessage.indexOf('5678'), -1);
                test.done();
            }, 10);
        },

        testWholeWordMask:function(test) {
            var logger = Logger.getLogger({console: false, fileName: TEMP_LOGFILE});
            var loggedMessage;

            // these should be logged in full
            logger.warn('passwordUrl=file:///tmp/foo', {passwordUrl: 'file:///tmp/bar'});

            setTimeout(function() {
                loggedMessage = fs.readFileSync(TEMP_LOGFILE).toString();
                test.notStrictEqual(loggedMessage.indexOf('passwordUrl='), -1);
                test.notStrictEqual(loggedMessage.indexOf('"passwordUrl":'), -1);
                test.notStrictEqual(loggedMessage.indexOf('file:///tmp/foo'), -1);
                test.notStrictEqual(loggedMessage.indexOf('file:///tmp/bar'), -1);
                test.done();
            }, 10);
        },

        testLabel: function(test) {
            var logger = Logger.getLogger({console: false, fileName: TEMP_LOGFILE, logLevel: 'debug', module: module});
            var loggedMessage;

            logger.debug('hello, world');

            setTimeout(function() {
                loggedMessage = fs.readFileSync(TEMP_LOGFILE);
                test.notStrictEqual(loggedMessage.indexOf('[lib/loggerTests.js]'), -1);
                test.done();
            }, 10);
        }
    }
};
