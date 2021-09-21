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

const fs = require('fs');
const assert = require('assert');
const Logger = require('../../../f5-cloud-libs').logger;

describe('Logger Unit Tests', () => {
    let logger;
    const fsWrite = fs.write;
    const LOGFILE = 'foo';
    let loggedMessage;

    it('should work with console', () => {
        logger = Logger.getLogger();
        assert.ok(logger.transports.console, 'No conosle logger found.');
    });

    it('should work without console', () => {
        logger = Logger.getLogger({ console: false });
        assert.ifError(logger.transports.console);
    });

    it('should work with log file', () => {
        logger = Logger.getLogger({ fileName: 'foo' });
        assert.ok(logger.transports.file, 'No file logger found.');
        assert.strictEqual(logger.transports.file.maxFiles, 10);
        assert.strictEqual(logger.transports.file.maxsize, 10485760);
    });

    it('should work with json format', () => {
        logger = Logger.getLogger({
            console: true,
            json: true
        });
        assert.strictEqual(logger.transports.console.json, true);
    });

    it('should not default to json', () => {
        logger = Logger.getLogger({
            console: true
        });
        assert.strictEqual(logger.transports.console.json, false);
    });

    describe('Log Message tests', () => {
        beforeEach(() => {
            logger = Logger.getLogger({ console: false, fileName: LOGFILE });
            loggedMessage = null;
            fs.write = (fd, message, offset, length, position, cb) => {
                loggedMessage = message.toString();
                cb();
            };
        });

        afterEach(() => {
            fs.write = fsWrite;

            if (fs.existsSync(LOGFILE)) {
                fs.unlinkSync(LOGFILE);
            }
        });

        it('should mask passwords', (done) => {
            logger.transports.file.on('logged', () => {
                assert.notStrictEqual(loggedMessage.indexOf('password='), -1);
                assert.notStrictEqual(loggedMessage.indexOf('"Password":'), -1);
                assert.strictEqual(loggedMessage.indexOf('1234'), -1);
                assert.strictEqual(loggedMessage.indexOf('5678'), -1);
                done();
            });

            logger.warn('password=1234', { Password: '5678' });
        });

        it('should mask passphrase', (done) => {
            logger.transports.file.on('logged', () => {
                assert.notStrictEqual(loggedMessage.indexOf('passphrase='), -1);
                assert.notStrictEqual(loggedMessage.indexOf('"passphrase":'), -1);
                assert.strictEqual(loggedMessage.indexOf('1234'), -1);
                assert.strictEqual(loggedMessage.indexOf('5678'), -1);
                done();
            });

            logger.warn('passphrase=1234', { passphrase: '5678' });
        });

        it('should mask whole word', (done) => {
            logger.transports.file.on('logged', () => {
                assert.notStrictEqual(loggedMessage.indexOf('passwordUrl='), -1);
                assert.notStrictEqual(loggedMessage.indexOf('"passwordUrl":'), -1);
                assert.notStrictEqual(loggedMessage.indexOf('file:///tmp/foo'), -1);
                assert.notStrictEqual(loggedMessage.indexOf('file:///tmp/bar'), -1);
                done();
            });

            // these should be logged in full
            logger.warn('passwordUrl=file:///tmp/foo', { passwordUrl: 'file:///tmp/bar' });
        });

        it('should work with labels', (done) => {
            logger = Logger.getLogger(
                {
                    console: false,
                    fileName: LOGFILE,
                    logLevel: 'debug',
                    module
                }
            );

            logger.transports.file.on('logged', () => {
                assert.notStrictEqual(loggedMessage.indexOf('[lib/loggerTests.js]'), -1);
                done();
            });

            logger.debug('hello, world');
        });
    });
});
