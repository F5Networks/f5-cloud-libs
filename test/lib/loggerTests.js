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

const Logger = require('../../../f5-cloud-libs').logger;
const fs = require('fs');

let logger;

const fsWrite = fs.write;

const LOGFILE = 'foo';

let loggedMessage;

module.exports = {
    testConsole(test) {
        logger = Logger.getLogger();
        test.ok(logger.transports.console, 'No conosle logger found.');
        test.done();
    },

    testNoConsole(test) {
        logger = Logger.getLogger({ console: false });
        test.ifError(logger.transports.console);
        test.done();
    },

    testLogfile(test) {
        logger = Logger.getLogger({ fileName: 'foo' });
        test.ok(logger.transports.file, 'No file logger found.');
        test.done();
    },

    testNoLogFile(test) {
        logger = Logger.getLogger();
        test.ifError(logger.transports.file);
        test.done();
    },

    testLogMessages: {
        setUp(callback) {
            logger = Logger.getLogger({ console: false, fileName: LOGFILE });
            loggedMessage = null;
            fs.write = (fd, message, offset, length, position, cb) => {
                loggedMessage = message.toString();
                cb();
            };
            callback();
        },

        tearDown(callback) {
            fs.write = fsWrite;

            if (fs.existsSync(LOGFILE)) {
                fs.unlinkSync(LOGFILE);
            }
            callback();
        },

        testPasswordMask(test) {
            logger.warn('password=1234', { Password: '5678' });

            logger.transports.file.on('logged', () => {
                test.notStrictEqual(loggedMessage.indexOf('password='), -1);
                test.notStrictEqual(loggedMessage.indexOf('"Password":'), -1);
                test.strictEqual(loggedMessage.indexOf('1234'), -1);
                test.strictEqual(loggedMessage.indexOf('5678'), -1);
                test.done();
            });
        },

        testPassphraseMask(test) {
            logger.warn('passphrase=1234', { passphrase: '5678' });

            logger.transports.file.on('logged', () => {
                test.notStrictEqual(loggedMessage.indexOf('passphrase='), -1);
                test.notStrictEqual(loggedMessage.indexOf('"passphrase":'), -1);
                test.strictEqual(loggedMessage.indexOf('1234'), -1);
                test.strictEqual(loggedMessage.indexOf('5678'), -1);
                test.done();
            });
        },

        testWholeWordMask(test) {
            // these should be logged in full
            logger.warn('passwordUrl=file:///tmp/foo', { passwordUrl: 'file:///tmp/bar' });

            logger.transports.file.on('logged', () => {
                test.notStrictEqual(loggedMessage.indexOf('passwordUrl='), -1);
                test.notStrictEqual(loggedMessage.indexOf('"passwordUrl":'), -1);
                test.notStrictEqual(loggedMessage.indexOf('file:///tmp/foo'), -1);
                test.notStrictEqual(loggedMessage.indexOf('file:///tmp/bar'), -1);
                test.done();
            });
        },

        testLabel(test) {
            logger = Logger.getLogger(
                {
                    console: false,
                    fileName: LOGFILE,
                    logLevel: 'debug',
                    module
                }
            );
            logger.debug('hello, world');

            logger.transports.file.on('logged', () => {
                test.notStrictEqual(loggedMessage.indexOf('[lib/loggerTests.js]'), -1);
                test.done();
            });
        }
    }
};
