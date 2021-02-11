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

const q = require('q');
const assert = require('assert');
const signals = require('../../lib/signals');

describe('run script tests', () => {
    let fsMock;
    let cpMock;
    let ipcMock;
    let utilMock;
    let argv;
    let runScript;
    let realWriteFile;
    let realReadFile;

    let functionsCalled;
    let sentSignals;

    beforeEach(() => {
        /* eslint-disable global-require */
        cpMock = require('child_process');
        fsMock = require('fs');
        utilMock = require('../../lib/util');
        ipcMock = require('../../lib/ipc');

        utilMock.logAndExit = () => { };
        utilMock.logError = () => { };
        utilMock.saveArgs = () => {
            return q();
        };

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            functionsCalled.ipc.once.push(signal);
            setInterval(() => {
                if (sentSignals.indexOf(signal) > -1) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };

        cpMock.spawn = () => {
            return {
                on(data, cb) {
                    if (data === 'exit') {
                        cb(0, null);
                    }
                },
                stdout: {
                    on(data, cb) {
                        cb('response');
                    }
                },
                stderr: {
                    on() {
                    }
                }
            };
        };

        realWriteFile = fsMock.writeFile;
        fsMock.writeFile = (file, data, options, cb) => {
            cb();
        };

        functionsCalled = {
            ipc: {
                once: []
            }
        };

        runScript = require('../../scripts/runScript');
        argv = ['node', 'runScript.js', '--file', 'sleep.sh', '--log-level', 'none',
            '--output', 'sleep.log', '--wait-for', 'ONBOARD_DONE'];
    });

    afterEach(() => {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        fsMock.readFile = realReadFile;
        fsMock.writeFile = realWriteFile;

        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('wait for test', (done) => {
        sentSignals = [];

        ipcMock.send(signals.ONBOARD_DONE);

        runScript.run(argv, () => {
            assert.deepEqual(
                sentSignals, [signals.ONBOARD_DONE, signals.SCRIPT_RUNNING, signals.SCRIPT_DONE]
            );
            assert.notStrictEqual(functionsCalled.ipc.once.indexOf(signals.ONBOARD_DONE), -1);
            done();
        });
    });

    it('exception signals error test', (done) => {
        sentSignals = [];

        ipcMock.send(signals.ONBOARD_DONE);

        cpMock.spawn = () => {
            throw new Error('err');
        };

        runScript.run(argv, () => {
            assert.notStrictEqual(sentSignals.indexOf(signals.CLOUD_LIBS_ERROR), -1);
            assert.strictEqual(sentSignals.indexOf(signals.SCRIPT_DONE), -1);
            done();
        });
    });
});

