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
var fs = require('fs');
var childProcess = require("child_process");
var options = require("commander");
var q = require("q");
var BigIp = require('./lib/bigIp');
var globalSettings = {
    guiSetup: 'disabled'
};
var dbVars = {};
var modules = {};
var passwords = {};
var rootPasswords = {};

var logFileName = '/tmp/setup.log';
var logFile;

var bigIp;

var args;
var myChild;

var i;

/**
 * Adds value to an array
 *
 * Typically used by the option parser for collecting
 * multiple values for a command line option
 */
var collect = function(val, collection) {
    collection.push(val);
    return collection;
};

/**
 * Parses a ':' deliminated key-value pair and stores them
 * in a container
 *
 * Typically used by the option parser for collecting
 * multiple key-value pairs for a command line option
 */
var map = function(pair, container) {
    var nameVal = pair.split(':');
    container[nameVal[0].trim()] = nameVal[1].trim();
};


/**
 * Special case of map. Used to parse root password options in the form of
 *     old:oldRootPassword,new:newRootPassword
 * Since passwords can contain any character, a delimiter is difficult to find.
 * Compromise by looking for ',new:' as a delimeter
 */
var parseRootPasswords = function(passwordsValue, container) {
    var set = passwordsValue.split(",new:");

    if (set.length == 2) {
        container.old = set[0].split("old:")[1];
        container.new = set[1];
    }
};

var writeResponse = function(response) {
    if (response && options.verbose) {
        console.log((typeof response === 'object' ? JSON.stringify(response, null, 4) : "  " + response));
    }
};

options
    .option('--host <ip_address>', 'BIG-IP management IP.')
    .option('-u, --user <user>', 'BIG-IP admin user.')
    .option('-p, --password <password>', 'BIG-IP admin user password.')
    .option('--ntp <ntp-server>', 'NTP server. For multiple NTP servers, use multiple --ntp entries', collect, [])
    .option('--tz <timezone>', 'Timezone for NTP setting')
    .option('--dns <DNS server>', 'DNS server. For multiple DNS severs, use multiple --dns entries', collect, [])
    .option('-l, --license <license_key>', 'BIG-IP license key.')
    .option('-a, --add-on <add-on keys>', 'Add on license key. For multiple keys, use multiple -a entries', collect, [])
    .option('-n, --host-name <hostname>', 'Set BIG-IP hostname')
    .option('-g, --global-settings <name:value>', 'A global setting name/value pair. For multiple settings, use multiple -g entries', map, globalSettings)
    .option('-d, --db <name:value>', 'A db variable name/value pair. For multiple settings, use multiple -d entries', map, dbVars)
    .option('--set-password <user:newPassword>', 'Set user password to newPassword. For multiple users, use multiple --set-password entries.', map, passwords)
    .option('--set-root-password <old:oldPassword,new:newPassword>', 'Set the password for the root user from oldPassword to newPassword', parseRootPasswords, rootPasswords)
    .option('-m, --module <name:value>', 'A module provisioning module/level pair. For multiple modules, use multiple -m entries', map, modules)
    .option('-f, --foreground', 'Do the work - otherwise spawn a background process to do the work. If you are running in cloud init, you probably do not want this option.')
    .option('-o, --output <file>', 'Full path for log file if background process is spawned. Default is ' + logFileName)
    .option('--verbose', 'Turn on verbose output')
    .parse(process.argv);

logFileName = options.output || logFileName;

try {
    logFile = fs.openSync(logFileName, 'a');

    // When running in cloud init, we need to exit so that cloud init can complete and
    // allow the BIG-IP services to start
    if (!options.foreground) {

        if (process.argv.length > 100) {
            console.log("Too many arguments - maybe we're stuck in a restart loop?");
        }
        else {
            console.log("Spawning child process to do the work. Output will be in " + logFileName);
            args = process.argv.slice(1);
            args.push('--foreground');
            myChild = childProcess.spawn(
                process.argv[0],
                args,
                {
                    detached: true,
                    stdio: ['ignore', logFile, logFile]
                }
            );
            myChild.unref();
        }

        process.exit();
    }

    // Log the input, but don't log the password
    if (options.password) {
        for (i = 0; i < process.argv.length; ++i) {
            if (process.argv[i] === '--password' || process.argv[i] === '-p') {
                process.argv[i + 1] = "*******";
                break;
            }
        }
    }
    console.log(process.argv[1] + " called with " + process.argv.slice().join(" "));

    bigIp = new BigIp(options.host, options.user, options.password);

    // Use hostName if both hostName and global-settings hostName are set
    if (globalSettings && options.hostName) {
        if (globalSettings.hostname || globalSettings.hostName) {
            console.log("Using host-name option to override global-settings host name");
            delete globalSettings.hostName;
            delete globalSettings.hostname;
        }
    }

    console.log("Setup starting at: " + new Date().toUTCString());
    console.log("Waiting for BIG-IP to be ready...");
    bigIp.ready(60, 10000) // 10 minutes
        .then(function() {
            var promises = [];
            var user;

            console.log("BIG-IP is ready.");

            if (Object.keys(passwords).length > 0) {
                console.log("Setting password(s).");
                for (user in passwords) {
                    promises.push(bigIp.password(user, passwords[user]));
                }

                return q.all(promises);
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            if (Object.keys(rootPasswords).length > 0) {
                if (!rootPasswords.old || !rootPasswords.new) {
                    return q.reject("Old or new password missing for root user. Specify with --set-root-password old:old_root_password,new:new_root_password");
                }

                console.log("Setting rootPassword.");
                return bigIp.password('root', rootPasswords.new, rootPasswords.old);
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            var ntpBody;

            writeResponse(response);

            if (options.ntp.length > 0 || options.tz) {
                console.log("Setting up NTP.");

                ntpBody = {};

                if (options.ntp) {
                    ntpBody.servers = options.ntp;
                }

                if (options.tz) {
                    ntpBody.timezone = options.tz;
                }

                return bigIp.modify(
                    '/tm/sys/ntp',
                    ntpBody
                );
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            if (options.dns.length > 0) {
                console.log("Setting up DNS.");

                return bigIp.modify(
                    '/tm/sys/dns',
                    {
                        'name-servers': options.dns
                    }
                );
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            if (options.hostName) {
                console.log("Setting host name.");
                return bigIp.hostName(options.hostName);
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            if (globalSettings) {
                console.log("Setting global settings.");
                return bigIp.globalSettings(globalSettings);
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            if (Object.keys(dbVars).length > 0) {
                console.log("Setting DB vars");
                return bigIp.setDbVars(dbVars);
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            var registrationKey = options.license;
            var addOnKeys = options.addOn;

            if (registrationKey || addOnKeys.length > 0) {
                console.log("Licensing...");

                return bigIp.license(
                    {
                        registrationKey: registrationKey,
                        addOnKeys: addOnKeys
                    }
                );
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            if (Object.keys(modules).length > 0) {
                console.log("Provisioning modules: " + JSON.stringify(modules, null, 4));
                return bigIp.provision(modules);
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            writeResponse(response);

            console.log("BIG-IP setup complete.");
        })
        .catch(function(err) {
            console.log("BIG-IP setup failed: " + (typeof err === 'object' ? err.message : err));
        })
        .done(function() {
            console.log("Setup finished at: " + new Date().toUTCString());
        });
}
finally {
    fs.closeSync(logFile);
}

