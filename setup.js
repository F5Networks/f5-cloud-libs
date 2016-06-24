var BigIp = require('./lib/bigIp');

var bigIp = new BigIp('10.146.1.141', 'admin', 'admin');

bigIp.ready()
    .then(function() {
        console.log("BIG-IP is ready");
    })
    .catch(function(err) {
        console.log("BIG-IP not ready: " + err);
    }
);
