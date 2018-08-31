/**
 * Copyright 2017-2018 F5 Networks, Inc.
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

/* eslint-disable no-console */

const q = require('q');
const signals = require('../../lib/signals');

let fsMock;
let localKeyUtilMock;
let ipcMock;
let cryptoUtilMock;
let utilMock;
let argv;
let encryptData;
let realWriteFile;
let realReadFile;

let functionsCalled;
let generateAndInstallKeyPairCalled;

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        fsMock = require('fs');
        utilMock = require('../../lib/util');
        localKeyUtilMock = require('../../lib/localKeyUtil');
        ipcMock = require('../../lib/ipc');
        cryptoUtilMock = require('../../lib/cryptoUtil');

        utilMock.logAndExit = () => {};
        utilMock.logError = () => {};

        cryptoUtilMock.encrypt = () => {
            return q();
        };
        cryptoUtilMock.generateRandomBytes = () => {
            return q();
        };

        localKeyUtilMock.generateAndInstallKeyPair = () => {
            generateAndInstallKeyPairCalled = true;
            return q();
        };

        realReadFile = fsMock.readFile;
        realWriteFile = fsMock.writeFile;
        fsMock.writeFile = (file, data, options, cb) => {
            cb();
        };

        generateAndInstallKeyPairCalled = false;

        // Just resolve right away, otherwise these tests never exit
        ipcMock.once = function once(...args) {
            functionsCalled.ipc.once.push(args[0]);
            return q();
        };

        functionsCalled = {
            ipc: {
                once: []
            }
        };

        encryptData = require('../../scripts/encryptDataToFile');
        argv = ['node', 'encryptDataToFile', '--log-level', 'none'];

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
        argv.push('--wait-for', 'foo', '--data', 'dataToEncrypt', '--out-file', 'foo');

        test.expect(2);
        encryptData.run(argv, () => {
            test.strictEqual(functionsCalled.ipc.once.includes('foo'), true);
            test.strictEqual(functionsCalled.ipc.once.includes(signals.CLOUD_LIBS_ERROR), true);
            test.done();
        });
    },

    testExceptionSignalsError(test) {
        const sentSignals = [];
        localKeyUtilMock.generateAndInstallKeyPair = () => {
            return q.reject('err');
        };

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.includes(signal)) {
                    deferred.resolve();
                }
            }, 200);
            return deferred.promise;
        };

        argv.push('--wait-for', 'foo', '--data', 'dataToEncrypt', '--out-file', 'foo');
        ipcMock.send('foo');
        test.expect(2);
        encryptData.run(argv, () => {
            test.ok(sentSignals.includes(signals.CLOUD_LIBS_ERROR));
            test.ok(!sentSignals.includes(signals.ENCRYPTION_DONE, 'Encryption should not complete'));
            test.done();
        });
    },

    testBackground(test) {
        let runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = () => {
            runInBackgroundCalled = true;
        };

        argv.push('--background', '--data', 'dataToEncrypt', '--out-file', 'foo');

        test.expect(1);
        encryptData.run(argv, () => {
            test.ok(runInBackgroundCalled);
            test.done();
        });
    },

    testNoDataOrDataFile(test) {
        const log = console.log;
        console.log = () => {};
        test.expect(1);
        argv.push('--out-file', 'foo');
        encryptData.run(argv, (err) => {
            test.notStrictEqual(err.name.indexOf('AssertionError'), -1);
            console.log = log;
            test.done();
        });
    },

    testDataNoFile(test) {
        const log = console.log;
        console.log = () => {};
        test.expect(1);
        argv.push('--data', 'foo');
        encryptData.run(argv, (err) => {
            test.notStrictEqual(err.name.indexOf('AssertionError'), -1);
            console.log = log;
            test.done();
        });
    },

    testDataFileNoFile(test) {
        const log = console.log;
        console.log = () => {};
        test.expect(1);
        argv.push('--data-file', 'foo');
        encryptData.run(argv, (err) => {
            test.notStrictEqual(err.name.indexOf('AssertionError'), -1);
            console.log = log;
            test.done();
        });
    },

    testDataAndFile(test) {
        const log = console.log;
        console.log = () => {};
        test.expect(1);
        argv.push('--data', 'foo', '--data-file', 'bar', '--out-file', 'hello');
        encryptData.run(argv, (err) => {
            test.notStrictEqual(err.name.indexOf('AssertionError'), -1);
            console.log = log;
            test.done();
        });
    },

    testLocalKeyUtilCalled(test) {
        argv.push('--data', 'foo', '--out-file', 'foo');

        test.expect(1);
        encryptData.run(argv, () => {
            test.ok(generateAndInstallKeyPairCalled);
            test.done();
        });
    },

    testEncryptData(test) {
        const dataToEncrypt = 'my data';
        let dataSent;

        argv.push('--data', dataToEncrypt, '--out-file', 'foo');

        cryptoUtilMock.encrypt = (publicKey, data) => {
            dataSent = data;
            return q();
        };

        test.expect(1);
        encryptData.run(argv, () => {
            test.strictEqual(dataSent, dataToEncrypt);
            test.done();
        });
    },

    testEncryptDataFromFile(test) {
        const dataToEncrypt = 'my data';
        let dataSent;

        argv.push('--data-file', '/foo/bar', '--out-file', 'foo');

        fsMock.readFile = (file, cb) => {
            cb(null, dataToEncrypt);
        };

        cryptoUtilMock.encrypt = (publicKey, data) => {
            dataSent = data;
            return q();
        };

        test.expect(1);
        encryptData.run(argv, () => {
            test.strictEqual(dataSent, dataToEncrypt);
            test.done();
        });
    },

    testDataWrittenToFile(test) {
        const fileToWriteTo = '/tmp/myFile';
        let fileWrittenTo;

        argv.push('--data', 'foo', '--out-file', fileToWriteTo);

        fsMock.writeFile = (file, data, options, cb) => {
            fileWrittenTo = file;
            cb();
        };

        test.expect(1);
        encryptData.run(argv, () => {
            test.strictEqual(fileWrittenTo, fileToWriteTo);
            test.done();
        });
    }
};
