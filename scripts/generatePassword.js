/**
 * Copyright 2016-2018 F5 Networks, Inc.
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

const fs = require('fs');
const q = require('q');
const assert = require('assert');
const options = require('commander');
const crypto = require('crypto');
const cryptoUtil = require('../lib/cryptoUtil');
const localKeyUtil = require('../lib/localKeyUtil');
const KEYS = require('../lib/sharedConstants').KEYS;

(function run() {
    const runner = {
        run(argv) {
            let passwordPromise;
            options
                .version('4.24.0-beta.1')
                .option(
                    '--length <password_length>',
                    'Length of password. Default 32.',
                    32
                )
                .option(
                    '--file <path/to/file>',
                    'Location in which to store the password. Default log to console.'
                )
                .option(
                    '--encrypt',
                    'Encrypt the password before writing to disk. Default false'
                )
                .option(
                    '--include-special-characters',
                    'Generated password includes at least one special character'
                )
                .parse(argv);

            assert.equal(Number.isNaN(options.length), false, '--length must be an integer');
            const specialCharProbe = ['+', '/', '#', '*', '^', '%', '@'];
            let password;
            let flag = false;
            if (options.includeSpecialCharacters) {
                while (true) {
                    password =
                        crypto.randomBytes(parseInt(options.length, 10))
                            .toString('base64').substr(0, options.length);
                    for (let j = 0; j < specialCharProbe.length; j++) {
                        if (password.indexOf(specialCharProbe[j]) !== -1) {
                            flag = true;
                            break;
                        }
                    }
                    if (flag) {
                        break;
                    }
                }
            } else {
                password =
                    crypto.randomBytes(parseInt(options.length, 10))
                        .toString('base64').substr(0, options.length);
            }

            if (options.encrypt) {
                passwordPromise = encryptPassword(password);
            } else {
                passwordPromise = q(password);
            }

            passwordPromise
                .then((finalPassword) => {
                    if (options.file) {
                        writeDataToFile(finalPassword, options.file);
                    } else {
                        console.log(finalPassword);
                    }
                })
                .catch((err) => {
                    throw (err);
                });
        }
    };

    function encryptPassword(password) {
        return localKeyUtil.generateAndInstallKeyPair(
            KEYS.LOCAL_PUBLIC_KEY_DIR,
            KEYS.LOCAL_PUBLIC_KEY_PATH,
            KEYS.LOCAL_PRIVATE_KEY_FOLDER,
            KEYS.LOCAL_PRIVATE_KEY
        )
            .then(() => {
                return cryptoUtil.encrypt(KEYS.LOCAL_PUBLIC_KEY_PATH, password);
            })
            .catch((err) => {
                return q.reject(err);
            });
    }

    function writeDataToFile(data, file) {
        const deferred = q.defer();

        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

        fs.writeFile(file, data, { mode: 0o400 }, (err) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    }

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
