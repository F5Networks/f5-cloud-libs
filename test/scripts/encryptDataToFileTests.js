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

        localKeyUtilMock.generateAndInstallKeyPair = function generateAndInstallKeyPair() {
            functionsCalled.localKeyUtil.generateAndInstallKeyPair = {
                publicKeyDirectory: arguments[0],
                publicKeyOutFile: arguments[1],
                privateKeyFolder: arguments[2],
                privateKeyName: arguments[3],
                options: arguments[4],
            };
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
        ipcMock.once = function once() {
            functionsCalled.ipc.once.push(arguments[0]);
            return q();
        };

        functionsCalled = {
            ipc: {
                once: []
            },
            localKeyUtil: { }
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
            test.notStrictEqual(functionsCalled.ipc.once.indexOf('foo'), -1);
            test.notStrictEqual(functionsCalled.ipc.once.indexOf(signals.CLOUD_LIBS_ERROR), -1);
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
                if (sentSignals.indexOf(signal) > -1) {
                    deferred.resolve();
                }
            }, 200);
            return deferred.promise;
        };

        argv.push('--wait-for', 'foo', '--data', 'dataToEncrypt', '--out-file', 'foo');
        ipcMock.send('foo');
        test.expect(2);
        encryptData.run(argv, () => {
            test.notStrictEqual(sentSignals.indexOf(signals.CLOUD_LIBS_ERROR), -1);
            test.strictEqual(sentSignals.indexOf(signals.ENCRYPTION_DONE), -1);
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
    },

    testPrivateKeyOption(test) {
        argv.push('--data', 'data', '--out-file', 'foo.file', '--private-key-name', 'myPrivatekey.key');

        test.expect(2);
        encryptData.run(argv, () => {
            const generateAndInstallKeyPair = functionsCalled.localKeyUtil.generateAndInstallKeyPair;
            test.strictEqual(generateAndInstallKeyPair.privateKeyName, 'myPrivatekey.key');
            test.strictEqual(
                generateAndInstallKeyPair.publicKeyOutFile,
                '/config/cloud/keys/myPrivatekey.pub'
            );
            test.done();
        });
    },

    testPrivateKeyOptionNoKeySuffix(test) {
        argv.push('--data', 'data', '--out-file', 'foo.file', '--private-key-name', 'myPrivatekey');

        test.expect(2);
        encryptData.run(argv, () => {
            const generateAndInstallKeyPair = functionsCalled.localKeyUtil.generateAndInstallKeyPair;
            test.strictEqual(generateAndInstallKeyPair.privateKeyName, 'myPrivatekey.key');
            test.strictEqual(
                generateAndInstallKeyPair.publicKeyOutFile,
                '/config/cloud/keys/myPrivatekey.pub'
            );
            test.done();
        });
    }
};
