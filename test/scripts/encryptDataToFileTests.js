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

var fsMock;
var localKeyUtilMock;
var ipcMock;
var cryptoUtilMock;
var utilMock;
var argv;
var encryptData;
var realWriteFile;
var realReadFile;

var functionsCalled;
var generateAndInstallKeyPairCalled;

module.exports = {
    setUp: function(callback) {
        fsMock = require('fs');
        utilMock = require('../../lib/util');
        localKeyUtilMock = require('../../lib/localKeyUtil');
        ipcMock = require('../../lib/ipc');
        cryptoUtilMock = require('../../lib/cryptoUtil');

        utilMock.logAndExit = function() {};

        cryptoUtilMock.encrypt = function() {
            return q();
        };
        cryptoUtilMock.generateRandomBytes = function() {
            return q();
        };

        localKeyUtilMock.generateAndInstallKeyPair = function() {
            generateAndInstallKeyPairCalled = true;
            return q();
        };

        realReadFile = fsMock.readFile;
        realWriteFile = fsMock.writeFile;
        fsMock.writeFile = function(file, data, options, cb) {
            cb();
        };

        generateAndInstallKeyPairCalled = false;

        // Just resolve right away, otherwise these tests never exit
        ipcMock.once = function() {
            functionsCalled.ipc.once = arguments;
            return q();
        };

        functionsCalled = {
            ipc: {}
        };

        encryptData = require('../../scripts/encryptDataToFile');
        argv = ['node', 'encryptDataToFile', '--log-level', 'none'];

        callback();
    },

    tearDown: function(callback) {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        fsMock.readFile = realReadFile;
        fsMock.writeFile = realWriteFile;

        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });
        callback();
    },

    testWaitFor: function(test) {
        argv.push('--wait-for', 'foo', '--data', 'dataToEncrypt', '--out-file', 'foo');

        test.expect(1);
        encryptData.run(argv, function() {
            test.strictEqual(functionsCalled.ipc.once[0], 'foo');
            test.done();
        });
    },

    testBackground: function(test) {
        var runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = function() {
            runInBackgroundCalled = true;
        };

        argv.push('--background', '--data', 'dataToEncrypt', '--out-file', 'foo');

        test.expect(1);
        encryptData.run(argv, function() {
            test.ok(runInBackgroundCalled);
            test.done();
        });
    },

    testNoDataOrDataFile: function(test) {
        var log = console.log;
        console.log = function() {};
        test.expect(1);
        argv.push('--out-file', 'foo');
        encryptData.run(argv, function(err) {
            test.strictEqual(err.name, 'AssertionError');
            console.log = log;
            test.done();
        });
    },

    testDataNoFile: function(test) {
        var log = console.log;
        console.log = function() {};
        test.expect(1);
        argv.push('--data', 'foo');
        encryptData.run(argv, function(err) {
            test.strictEqual(err.name, 'AssertionError');
            console.log = log;
            test.done();
        });
    },

    testDataFileNoFile: function(test) {
        var log = console.log;
        console.log = function() {};
        test.expect(1);
        argv.push('--data-file', 'foo');
        encryptData.run(argv, function(err) {
            test.strictEqual(err.name, 'AssertionError');
            console.log = log;
            test.done();
        });
    },

    testDataAndFile: function(test) {
        var log = console.log;
        console.log = function() {};
        test.expect(1);
        argv.push('--data', 'foo', '--data-file', 'bar', '--out-file', 'hello');
        encryptData.run(argv, function(err) {
            test.strictEqual(err.name, 'AssertionError');
            console.log = log;
            test.done();
        });
    },

    testLocalKeyUtilCalled: function(test) {
        argv.push('--data', 'foo', '--out-file', 'foo');

        test.expect(1);
        encryptData.run(argv, function() {
            test.ok(generateAndInstallKeyPairCalled);
            test.done();
        });
    },

    testEncryptData: function(test) {
        const dataToEncrypt = "my data";
        var dataSent;

        argv.push('--data', dataToEncrypt, '--out-file', 'foo');

        cryptoUtilMock.encrypt = function(publicKey, data) {
            dataSent = data;
            return q();
        };

        test.expect(1);
        encryptData.run(argv, function() {
            test.strictEqual(dataSent, dataToEncrypt);
            test.done();
        });
    },

    testEncryptDataFromFile: function(test) {
        const dataToEncrypt = "my data";
        var dataSent;

        argv.push('--data-file', '/foo/bar', '--out-file', 'foo');

        fsMock.readFile = function(file, cb) {
            cb(null, dataToEncrypt);
        };

        cryptoUtilMock.encrypt = function(publicKey, data) {
            dataSent = data;
            return q();
        };

        test.expect(1);
        encryptData.run(argv, function() {
            test.strictEqual(dataSent, dataToEncrypt);
            test.done();
        });
    },

    testDataWrittenToFile: function(test) {
        const fileToWriteTo = '/tmp/myFile';
        var fileWrittenTo;

        argv.push('--data', 'foo', '--out-file', fileToWriteTo);

        fsMock.writeFile = function(file, data, options, cb) {
            fileWrittenTo = file;
            cb();
        };

        test.expect(1);
        encryptData.run(argv, function() {
            test.strictEqual(fileWrittenTo, fileToWriteTo);
            test.done();
        });
    }
};
