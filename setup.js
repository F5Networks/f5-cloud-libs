var options = require("commander");
var q = require("q");
var BigIp = require('./lib/bigIp');
var globalSettings = {
    guiSetup: 'disabled'
};
var dbVars = {};
var previousOperationMessage;
var bigIp;

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
    .parse(process.argv);

bigIp = new BigIp(options.host, options.user, options.password);

console.log("Waiting for BIG-IP to be ready...");
bigIp.ready()
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

        console.log("BIG-IP setup complete.");
    })
    .catch(function(err) {
        console.log("BIG-IP setup failed: " + (typeof err === 'object' ? err.message : err));
    })
    .done();
