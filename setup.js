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

var logFileName = '/tmp/setup.log';
var logFile;

var previousOperationMessage;
var bigIp;

var args;
var myChild;

var collect = function(val, collection) {
    collection.push(val);
    return collection;
};

var map = function(pair, map) {
    var nameVal = pair.split(':');
    map[nameVal[0].trim()] = nameVal[1].trim();
};

options
    .option('--host <ip_address>', 'BIG-IP management IP.')
    .option('-u, --user <user>', 'BIG-IP admin user.')
    .option('-p, --password <password>', 'BIG-IP admin user password.')
    .option('-l, --license <license_key>', 'BIG-IP license key.')
    .option('-a, --add-on <add-on keys>', 'Add on license keys.', collect, [])
    .option('-n, --host-name <hostname>', 'Set BIG-IP hostname')
    .option('-g, --global-settings <name: value>', 'A global setting name/value pair. For multiple settings, use multiple -g entries', map, globalSettings)
    .option('-d, --db <name: value>', 'A db variable name/value pair. For multiple settings, use multiple -d entries', map, dbVars)
    .option('-m, --module <name: value>', 'A module provisioning module/level pair. For multiple modules, use multiple -m entries', map, modules)
    .option('-f, --foreground', 'Do the work - otherwise spawn a background process to do the work. If you are running in cloud init, you probably do not want this option.')
    .option('-o, --output <file>', 'Full path for log file if background process is spawned. Default is ' + logFileName)
    .parse(process.argv);

logFileName = options.output || logFileName;

try {
    logFile = fs.openSync(logFileName, 'a');

    console.log(process.argv[1] + " called with" + process.argv.slice().join(" "));

    // When running in cloud init, we need to exit so that cloud init can complete and
    // allow the Big-IP services to start
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

    bigIp = new BigIp(options.host, options.user, options.password);

    console.log("Setup starting at: " + new Date().toUTCString());
    console.log("Waiting for BIG-IP to be ready...");
    bigIp.ready(60, 10000) // 10 minutes
        .then(function() {
            console.log("BIG-IP is ready.");

            var nameServers = ["10.133.20.70", "10.133.20.71"];
            var timezone = 'UTC';
            var ntpServers = ["0.us.pool.ntp.org", "1.us.pool.ntp.org"];

            var initialConfig = {
                dns: {
                    nameServers: nameServers
                },
                ntp: {
                    timezone: timezone,
                    servers: ntpServers
                },
                hostname: options.hostName,
                globalSettings: globalSettings
            };

            if (Object.keys(initialConfig).length) {
                console.log("Performing initial setup...");
                previousOperationMessage = "Initial setup complete";
                return bigIp.initialSetup(initialConfig);
            }
            else {
                return q();
            }
        })
        .then(function() {
            if (previousOperationMessage) {
                console.log(previousOperationMessage);
                previousOperationMessage = '';
            }

            if (Object.keys(dbVars).length > 0) {
                console.log("Setting DB vars");
                previousOperationMessage = "Db vars set";
                return bigIp.setDbVars(dbVars);
            }
            else {
                return q();
            }
        })
        .then(function() {
            if (previousOperationMessage) {
                console.log(previousOperationMessage);
                previousOperationMessage = '';
            }

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

            return q();
        })
        .then(function(response) {
            if (response) {
                console.log(response);
            }

            if (Object.keys(modules).length > 0) {
                console.log("Provisioning modules: " + JSON.stringify(modules, null, 4));
                return bigIp.provision(modules);
            }
            else {
                return q();
            }
        })
        .then(function(response) {
            if (response) {
                console.log(response);
            }

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

