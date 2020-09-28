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

const assert = require('assert');

const q = require('q');

const realConsoleLog = console.log;

const localCrytpoUtilMock = require('../../lib/localCryptoUtil');
const decryptData = require('../../scripts/decryptDataFromFile');

describe('Decrypt Data From File Tests', () => {
    let argv;
    let fileSent;
    let optionsSent;
    let decryptedData;

    before(() => {
        console.log = function log() {};
        optionsSent = undefined;

        localCrytpoUtilMock.decryptDataFromFile = (file, options) => {
            fileSent = file;
            optionsSent = options;
            return q(decryptedData);
        };

        argv = ['node', 'decryptDataFromFile'];
    });

    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        console.log = realConsoleLog;
    });

    it('should fail if No File present', () => {
        decryptData.run(argv, (err) => {
            assert.notStrictEqual(err.name.indexOf('AssertionError'), -1);
        });
    });

    it('should decrypt data from a file', () => {
        const fileToDecrypt = '/foo/bar';
        decryptedData = 'hello, world';

        argv.push('--data-file', fileToDecrypt);

        decryptData.run(argv, (data) => {
            assert.strictEqual(fileSent, fileToDecrypt);
            assert.strictEqual(data, decryptedData);
        });
    });

    it('should decrypt symmetric data from a file', () => {
        const fileToDecrypt = '/foo/bar';
        decryptedData = 'hello, world';

        argv.push('--data-file', fileToDecrypt);
        argv.push('--symmetric');

        decryptData.run(argv, (data) => {
            assert.strictEqual(fileSent, fileToDecrypt);
            assert.strictEqual(data, decryptedData);
            assert.strictEqual(optionsSent.symmetric, true);
        });
    });

    it('should display correct error message when decryption fails', () => {
        const errorMessage = 'decryption error';
        localCrytpoUtilMock.decryptDataFromFile = () => {
            return q.reject(new Error(errorMessage));
        };

        argv.push('--data-file', 'fileToDecrypt');

        decryptData.run(argv, (err) => {
            assert.strictEqual(err.message, errorMessage);
        });
    });
});
