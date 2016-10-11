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
'use-strict';

(function() {

    var childProcess = require('child_process');
    var runner;
    var cp;

    var environment = 'archive';

    var spawnScript = function(args, stringArgs) {

        if (stringArgs) {
            stringArgs.trim().split(/\s+/).forEach(function(arg) {
                args.push(arg);
            });
        }

        cp = childProcess.spawn(
            'f5-rest-node',
            args,
            {
                cwd: '/config/f5-cloud-libs/scripts',
                stdio: 'ignore',
                detached: true
            }
        );
        cp.unref();

    };

    module.exports = runner = {

        /**
         * Runs an arbitrary script
         *
         * @param {String[]} script - Arguments to pass to runScript
         */
        run: function(argv) {
            var loggerOptions = {};
            var Logger;
            var logger;
            var logLevel;
            var argIndex;
            var args;
            var clArgIndex;
            var clArgStart;
            var clArgEnd;
            var scriptArgs;
            var shellOutput;

            console.log(process.argv[1] + " called with", process.argv.slice().join(" "));

            // In Azure, mysql takes extra time to start
            console.log('Resetting mysql start delay');
            shellOutput = childProcess.execSync("sed -i 's/sleep\ 5/sleep\ 10/' /etc/init.d/mysql");
            console.log(shellOutput.toString());

            argIndex = argv.indexOf('--environment');
            if (argIndex != -1) {
                environment = argv[argIndex + 1];
            }

            console.log("Downloading latest libraries from", environment);
            shellOutput = childProcess.execSync(
                "curl -sk -o f5-cloud-libs.tar.gz https://f5cloudlibs.blob.core.windows.net/" + environment + "/f5-cloud-libs.tar.gz",
                {
                    cwd: "/config"
                }
            );
            console.log(shellOutput.toString());

            console.log("Expanding libraries.");
            shellOutput = childProcess.execSync(
                "tar -xzf f5-cloud-libs.tar.gz",
                {
                    cwd: "/config"
                }
            );
            console.log(shellOutput.toString());

            Logger = require('/config/f5-cloud-libs/lib/logger');
            loggerOptions.console = true;
            loggerOptions.logLevel = 'info';
            loggerOptions.fileName = '/var/log/runScripts.log';

            logger = Logger.getLogger(loggerOptions);

            logger.info("Running scripts.");

            argIndex = argv.indexOf('--log-level');
            if (argIndex != -1) {
                logLevel = argv[argIndex + 1];
                logger.info("Set log level to", logLevel);
                loggerOptions.logLevel = logLevel;
            }

            argIndex = argv.indexOf('--onboard');
            logger.debug("onboard arg index", argIndex);
            if (argIndex !== -1) {
                args = ['onboard.js'];
                scriptArgs = argv[argIndex + 1];
                logger.debug("onboard args", scriptArgs);
                spawnScript(args, scriptArgs);
            }

            argIndex = argv.indexOf('--cluster');
            logger.debug("cluster arg index", argIndex);
            if (argIndex !== -1) {
                args = ['cluster.js'];
                scriptArgs = argv[argIndex + 1];
                logger.debug("cluster args", scriptArgs);
                spawnScript(args, scriptArgs);
            }

            argIndex = argv.indexOf('--script');
            logger.debug("script arg index", argIndex);
            if (argIndex !== -1) {
                args = ['runScript.js'];
                scriptArgs = argv[argIndex + 1];
                clArgIndex = scriptArgs.indexOf('--cl-args');
                if (clArgIndex !== -1) {
                    args.push('--cl-args');

                    // Push the stuff in single quotes following cl-args as one entry
                    clArgStart = scriptArgs.indexOf("'", clArgIndex);
                    clArgEnd = scriptArgs.indexOf("'", clArgStart + 1);
                    args.push(scriptArgs.substring(clArgStart + 1, clArgEnd));

                    // Grab everything up to --cl-arg
                    if (clArgIndex > 0) {
                        scriptArgs.substring(0, clArgIndex).trim().split(/\s+/).forEach(function(arg) {
                            args.push(arg);
                        });
                    }

                    // Grab everything after --cl-args argument
                    if (clArgEnd < scriptArgs.length - 1) {
                        scriptArgs.substring(clArgEnd + 1).trim().split(/\s+/).forEach(function(arg) {
                            args.push(arg);
                        });
                    }
                }
                else {
                    scriptArgs.split(/\s+/).forEach(function(arg) {
                        args.push(arg);
                    });
                }
                logger.debug("cluster args", args);
                spawnScript(args);
            }
        }
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
