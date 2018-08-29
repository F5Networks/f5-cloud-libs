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

const realConsoleLog = console.log;

let localCrytpoUtilMock;

let argv;
let decryptData;

let fileSent;
let optionsSent;
let decryptedData;

module.exports = {
    setUp(callback) {
        console.log = function log() {};
        /* eslint-disable global-require */
        decryptData = require('../../scripts/decryptDataFromFile');

        localCrytpoUtilMock = require('../../lib/localCryptoUtil');

        optionsSent = undefined;

        localCrytpoUtilMock.decryptDataFromFile = (file, options) => {
            fileSent = file;
            optionsSent = options;
            return q(decryptedData);
        };

        argv = ['node', 'decryptDataFromFile'];
        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        console.log = realConsoleLog;

        callback();
    },

    testNoFile(test) {
        test.expect(1);
        decryptData.run(argv, (err) => {
            test.notStrictEqual(err.name.indexOf('AssertionError'), -1);
            test.done();
        });
    },

    testDecryptDataFromFile(test) {
        const fileToDecrypt = '/foo/bar';

        decryptedData = 'hello, world';

        argv.push('--data-file', fileToDecrypt);

        test.expect(2);
        decryptData.run(argv, (data) => {
            test.strictEqual(fileSent, fileToDecrypt);
            test.strictEqual(data, decryptedData);
            test.done();
        });
    },

    testSymmetricDecryptDataFromFile(test) {
        const fileToDecrypt = '/foo/bar';

        decryptedData = 'hello, world';

        argv.push('--data-file', fileToDecrypt);
        argv.push('--symmetric');

        test.expect(3);
        decryptData.run(argv, (data) => {
            test.strictEqual(fileSent, fileToDecrypt);
            test.strictEqual(data, decryptedData);
            test.strictEqual(optionsSent.symmetric, true);
            test.done();
        });
    },

    testDecryptionError(test) {
        const errorMessage = 'decryption error';
        localCrytpoUtilMock.decryptDataFromFile = () => {
            return q.reject(new Error(errorMessage));
        };

        argv.push('--data-file', 'fileToDecrypt');

        test.expect(1);
        decryptData.run(argv, (err) => {
            test.strictEqual(err.message, errorMessage);
            test.done();
        });
    }
};
