var BigIp = require('./lib/bigIp');

var host = '10.146.1.141';
var user = 'admin';
var password = 'admin';

var bigIp = new BigIp(host, user, password);

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
