var options = require("commander");
var BigIp = require('./lib/bigIp');

var bigIp;

var createVirtualAndPool = function() {
    var pool;

    return bigIp.create(
        '/tm/ltm/pool',
        {
            'name': 'myPool',
            'members': [
                { 'name': '192.168.100.1:80', 'description': 'test-member-1' },
                { 'name': '192.168.100.2:80', 'description': 'test-member-2' },
                { 'name': '192.168.100.3:80', 'description': 'test-member-3' },
            ]
        }
    )
    .then(function(response) {
        pool = response;

        return bigIp.create(
            '/tm/ltm/virtual',
            {
                'name': 'myVirtual',
                'pool': pool.fullPath,
                'destination': '1.2.3.4:80'
            }
        );
    })
    .then(function(response) {
        console.log("Created virtual: " + JSON.stringify(response, null, 4));
    })
    .catch(function(error) {
        console.log("createVirtualAndPool failed: " + error.message);
    });
};

var collect = function(val, collection) {
    collection.push(val);
    return collection;
};

options
    .option('-h, --host <ip_address>', 'BIG-IP management IP')
    .option('-u, --user <user>', 'BIG-IP admin user')
    .option('-p, --password <password>', 'BIG-IP admin user password')
    .parse(process.argv);

bigIp = new BigIp(options.host, options.user, options.password);

bigIp.ready()
    .then(function() {
        console.log("BIG-IP is ready. Performing initial setup...");

        var nameServers = ["10.133.20.70", "10.133.20.71"];
        var timezone = 'UTC';
        var ntpServers = ["0.us.pool.ntp.org", "1.us.pool.ntp.org"];

        return bigIp.initialSetup(
            {
                dns: {
                    nameServers: nameServers
                },
                ntp: {
                    timezone: timezone,
                    servers: ntpServers
                }
            }
        );
    })
    .then(function() {
        console.log("BIG-IP setup complete.");
    })
    .catch(function(err) {
        console.log("BIG-IP setup failed: " + err);
    }
);
