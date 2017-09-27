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

(function() {
    var runner;

    module.exports = runner = {
        run: function(argv) {
            const MIN_ASCII_CODE = 33; // '!'
            const MAX_ASCII_CODE = 126; // '~'

            var fs = require('fs');
            var options = require('commander');
            var password = '';
            var index;
            var i;

            var getRandomIntInclusive = function(min, max) {
              return Math.floor(Math.random() * (max - min + 1)) + min;
            };

            options
                .version('3.4.0')
                .option('--length <password_length>', 'Length of password. Default 32.', 32)
                .option('--file <path/to/file>', 'Location in which to store the password. Default log to console.')
                .parse(argv);

            for (i = 0; i < options.length; ++i) {
                index = getRandomIntInclusive(MIN_ASCII_CODE, MAX_ASCII_CODE);
                password += String.fromCharCode(index);
            }

            if (options.file) {
                if (fs.existsSync(options.file)) {
                    fs.unlinkSync(options.file);
                }

                fs.writeFileSync(options.file,
                                 password,
                                 {
                                     encoding: 'ascii',
                                     mode: 0o400
                                 });
            }
            else {
                console.log(password);
            }
        }
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();

