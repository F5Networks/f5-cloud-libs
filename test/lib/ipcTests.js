/**
 * Copyright 2016-2017 F5 Networks, Inc.
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

// const log = require('why-is-node-running');

const fs = require('fs');
const assert = require('assert');
const ipc = require('../../../f5-cloud-libs').ipc;
const util = require('../../../f5-cloud-libs').util;

describe('Metrics Collector Unit Tests', () => {
    const existsSync = fs.existsSync;
    const closeSync = fs.closeSync;
    const readdirSync = fs.readdirSync;

    let counter;
    const checkCounter = (expected, done) => {
        assert.strictEqual(counter, expected);
        done();
    };

    it('set logger', () => {
        assert.doesNotThrow(() => {
            ipc.setLogger({});
        });
    });

    it('set logger options', () => {
        assert.doesNotThrow(() => {
            ipc.setLoggerOptions({});
        });
    });

    describe('Test Once', () => {
        beforeEach(() => {
            counter = 0;
        });

        afterEach(() => {
            fs.readdirSync = readdirSync;
            fs.closeSync = closeSync;
            fs.existsSync = existsSync;
            ipc.clearSignals();
            util.removeDirectorySync(ipc.signalBasePath);
        });

        it('basic test', (done) => {
            ipc.once('foo')
                .then(() => {
                    counter += 1;
                });

            assert.strictEqual(counter, 0);
            ipc.send('foo');
            ipc.send('foo');
            setTimeout(checkCounter, 1100, 1, done);
        });

        it('twice test', (done) => {
            ipc.once('foo')
                .then(() => {
                    counter += 1;
                });
            ipc.once('foo')
                .then(() => {
                    counter += 1;
                });

            assert.strictEqual(counter, 0);
            ipc.send('foo');
            ipc.send('foo');
            setTimeout(checkCounter, 1100, 2, done);
        });

        it('error test', (done) => {
            const message = 'existsSync error';
            fs.existsSync = () => {
                throw new Error(message);
            };

            // We have to both try/catch and then/catch because we see different
            // behavior in different environments
            try {
                ipc.once('foo')
                    .then(() => {
                        assert.ok(false, 'once should have thrown');
                    })
                    .catch((err) => {
                        counter += 1;
                        assert.strictEqual(err.message, message);
                    });
            } catch (err) {
                counter += 1;
                assert.strictEqual(err.message, message);
            }

            setTimeout(checkCounter, 1100, 1, done);
        });
    });

    describe('Test Send', () => {
        beforeEach(() => {
            counter = 0;
        });

        afterEach(() => {
            fs.readdirSync = readdirSync;
            fs.closeSync = closeSync;
            fs.existsSync = existsSync;
            ipc.clearSignals();
            util.removeDirectorySync(ipc.signalBasePath);
        });

        it('basic test', () => {
            ipc.send('foo');
            assert.strictEqual(fs.existsSync(`${ipc.signalBasePath}foo`), true);
        });

        it('error test', () => {
            fs.closeSync = () => {
                throw new Error('closeSync error');
            };

            try {
                ipc.send('foo');
                assert.ok(false, 'send should have thrown');
            } catch (err) {
                assert.strictEqual(err.message, 'closeSync error');
            }
        });
    });

    describe('Test Clear Signals', () => {
        beforeEach(() => {
            counter = 0;
        });

        afterEach(() => {
            fs.readdirSync = readdirSync;
            fs.closeSync = closeSync;
            fs.existsSync = existsSync;
            ipc.clearSignals();
            util.removeDirectorySync(ipc.signalBasePath);
        });

        it('basic test', () => {
            ipc.send('foo');
            assert.strictEqual(fs.existsSync('/tmp/f5-cloud-libs-signals/foo'), true);
            ipc.clearSignals();
            assert.strictEqual(fs.existsSync('/tmp/f5-cloud-libs-signals/foo'), false);
        });

        it('error test', () => {
            fs.readdirSync = () => {
                throw new Error('readdirSync error');
            };

            try {
                ipc.clearSignals();
                assert.ok(false, 'clearSignals should have thrown');
            } catch (err) {
                assert.strictEqual(err.message, 'readdirSync error');
            }
        });
    });

    describe('Test Dir Created', () => {
        beforeEach(() => {
            if (fs.existsSync(ipc.signalBasePath)) {
                fs.rmdirSync(ipc.signalBasePath);
            }
        });

        afterEach(() => {
            fs.readdirSync = readdirSync;
            fs.closeSync = closeSync;
            fs.existsSync = existsSync;
            ipc.clearSignals();
            util.removeDirectorySync(ipc.signalBasePath);
        });

        after(() => {
            ipc.clearSignals();
        });

        it('on send', () => {
            ipc.send('foo');
            assert.strictEqual(fs.existsSync(ipc.signalBasePath), true);
        });

        it('on once', () => {
            ipc.once('foo');
            assert.strictEqual(fs.existsSync(ipc.signalBasePath), true);
        });
    });
});
