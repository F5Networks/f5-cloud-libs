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

var options = require('commander');

/**
 * @module
 */
module.exports = {
    /**
     * Gets common options used by all scripts.
     *
     * @returns {Object} An instance of commander options on which one can add options and call parse()
     */
    getCommonOptions: function(defaultLogFile) {
        options.reboot = true;
        options.port = 443;
        return options
            .version('3.6.0')
            .option('--host <ip_address>', 'BIG-IP management IP to which to send commands.')
            .option('-u, --user <user>', 'BIG-IP admin user name.')
            .option('-p, --password <password>', 'BIG-IP admin user password. Use this or --password-url')
            .option('--password-url <password_url>', 'URL (file, http(s)) to location that contains BIG-IP admin user password. Use this or --password')
            .option('--password-encrypted', 'Indicates that the password is encrypted (either with encryptDataToFile or generatePassword)')
            .option('--port <port>', 'BIG-IP management SSL port to connect to. Default 443.')
            .option('--no-reboot', 'Skip reboot even if it is recommended.')
            .option('--background', 'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.')
            .option('--signal <signal>', 'Signal to send when done. Default ONBOARD_DONE.')
            .option('--wait-for <signal>', 'Wait for the named signal before running.')
            .option('--log-level <level>', 'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info')
            .option('-o, --output <file>', 'Log to file as well as console. This is the default if background process is spawned. Default is ' + defaultLogFile)
            .option('--no-console', 'Do not log to console. Default false (log to console).');
    }
};
