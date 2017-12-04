/**
 * Copyright 2016 F5 Networks, Inc.
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
const q = require('q');

(function() {
    var runner;

    module.exports = runner = {
        run: function(argv) {
            const assert = require('assert');
            const options = require('commander');
            const crypto = require('crypto');

            var passwordPromise;
            var password;

            options
                .version('3.5.0')
                .option('--length <password_length>', 'Length of password. Default 32.', 32)
                .option('--file <path/to/file>', 'Location in which to store the password. Default log to console.')
                .option('--encrypt', 'Encrypt the password before writing to disk. Default false')
                .parse(argv);

            assert.equal(isNaN(options.length), false, '--length must be an integer');

            password = crypto.randomBytes(parseInt(options.length)).toString('base64').substr(0, options.length);

            if (options.encrypt) {
                passwordPromise = encryptPassword(password);
            }
            else {
                passwordPromise = q(password);
            }

            passwordPromise
                .then(function(password) {
                    if (options.file) {
                        writeDataToFile(password, options.file);
                    }
                    else {
                        console.log(password);
                    }
                })
                .catch(function(err) {
                    throw (err);
                });
        }
    };

    var encryptPassword = function(password) {
        const cryptoUtil = require('../lib/cryptoUtil');
        const localKeyUtil = require('../lib/localKeyUtil');

        const KEYS = require('../lib/sharedConstants').KEYS;

        return localKeyUtil.generateAndInstallKeyPair(KEYS.LOCAL_PUBLIC_KEY_DIR, KEYS.LOCAL_PUBLIC_KEY_PATH, KEYS.LOCAL_PRIVATE_KEY_FOLDER, KEYS.LOCAL_PRIVATE_KEY)
            .then(function() {
                return cryptoUtil.encrypt(KEYS.LOCAL_PUBLIC_KEY_PATH, password);
            })
            .catch(function(err) {
                return q.reject(err);
            });
    };

    var writeDataToFile = function(data, file) {
        var deferred = q.defer();

        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

        fs.writeFile(
            file,
            data,
            {
                mode: 0o400
            },
            function(err) {
                if (err) {
                    deferred.reject(err);
                }
                else {
                    deferred.resolve();
                }
            }
        );

        return deferred.promise;
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();

