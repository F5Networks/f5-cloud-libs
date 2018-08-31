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
const signals = require('../../lib/signals');

let fsMock;
let ipcMock;
let utilMock;
let argv;
let cluster;
let realWriteFile;
let realReadFile;

let bigIpMock;

const testOptions = {};

let functionsCalled;
let sentSignals;

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
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
                if (sentSignals.includes(signal)) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };

        bigIpMock = {
            init(...args) {
                functionsCalled.bigIp.init = args;
                return q();
            },

            isBigIp() {
                return true;
            },

            isBigIq() {
                return false;
            },

            list(...args) {
                functionsCalled.bigIp.list = args;
                return q();
            },

            modify(...args) {
                functionsCalled.bigIp.modify = args;
                return q();
            },

            create(...args) {
                functionsCalled.bigIp.create = args;
                return q();
            },

            delete(...args) {
                functionsCalled.bigIp.delete = args;
                return q();
            },

            ready(...args) {
                functionsCalled.bigIp.ready = args;
                return q();
            },

            save(...args) {
                functionsCalled.bigIp.save = args;
                return q();
            },

            active(...args) {
                functionsCalled.bigIp.active = args;
                return q();
            },

            ping(...args) {
                functionsCalled.bigIp.ping = args;
                return q();
            },

            rebootRequired(...args) {
                functionsCalled.bigIp.rebootRequired = args;
                return q(false);
            },

            reboot(...args) {
                functionsCalled.bigIp.reboot = args;
                return q();
            }
        };

        testOptions.bigIp = bigIpMock;

        realWriteFile = fsMock.writeFile;
        fsMock.writeFile = (file, data, options, cb) => {
            cb();
        };

        functionsCalled = {
            ipc: {
                once: []
            },
            bigIp: {}
        };

        cluster = require('../../scripts/cluster');
        argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', 'file:///password',
            '-u', 'user', '--host', 'localhost', '--output', 'cluster.log', '--wait-for', 'foo'];

        callback();
    },

    tearDown(callback) {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        fsMock.readFile = realReadFile;
        fsMock.writeFile = realWriteFile;

        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },

    testWaitFor(test) {
        sentSignals = [];

        ipcMock.send('foo');

        test.expect(2);
        cluster.run(argv, testOptions, () => {
            test.deepEqual(sentSignals, ['foo', signals.CLUSTER_RUNNING, signals.CLUSTER_DONE]);
            test.ok(functionsCalled.ipc.once.includes('foo', 'Should wait for foo signal'));
            test.done();
        });
    },

    testExceptionSignalsError(test) {
        sentSignals = [];

        bigIpMock.ready = () => {
            return q.reject('err');
        };

        ipcMock.send('foo');

        test.expect(2);
        cluster.run(argv, testOptions, () => {
            test.ok(sentSignals.includes(signals.CLOUD_LIBS_ERROR));
            test.ok(!sentSignals.includes(signals.CLUSTER_DONE, 'runScript should not complete'));
            test.done();
        });
    }
};
