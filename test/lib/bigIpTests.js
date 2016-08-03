var q = require('q');
var BigIp = require('../../lib/bigIp');

var recordCall = function(method, path, body, opts) {
    lastCall.method = method;
    lastCall.path = path;
    lastCall.body = body;
    lastCall.opts = opts;
};

var icontrolMock = {
    list: function(path, opts, cb) {
        recordCall('list', path, null, opts);
        cb(false, true);
    },

    create: function(path, body, opts, cb) {
        recordCall('create', path, body, opts);
        cb(false, true);
    },

    modify: function(path, body, opts, cb) {
        recordCall('modify', path, body, opts);
        cb(false, true);
    },

    delete: function(path, opts, cb) {
        recordCall('delete', path, null, opts);
        cb(false, true);
    }
};

var bigIp = new BigIp('host', 'user', 'password', {icontrol: icontrolMock});
bigIp.ready = function() {
    return q();
};

var lastCall = {};

module.exports = {
    setUp: function(callback) {
        lastCall.method = '';
        lastCall.path = '';
        lastCall.body = null;
        lastCall.opts = {};

        callback();
    },

    testListSuccess: function(test) {
        bigIp.list();
        test.strictEqual(lastCall.method, 'list');
        test.done();
    },

    testLoadNoFile: function(test) {
        bigIp.load()
            .then(function() {
                test.strictEqual(lastCall.method, 'create');
                test.strictEqual(lastCall.path, '/tm/sys/config');
                test.strictEqual(lastCall.body.command, 'load');
                test.strictEqual(lastCall.body.name, 'default');
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });
    },

    testLoadFile: function(test) {
        var fileName = 'foobar';

        bigIp.load(fileName)
            .then(function() {
                test.strictEqual(lastCall.body.options[0].file, fileName);
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });
    },

    testLoadOptions: function(test) {
        var options = {
            foo: 'bar',
            hello: 'world'
        };

        bigIp.load(null, options)
            .then(function() {
                test.strictEqual(lastCall.body.options[0].foo, options.foo);
                test.strictEqual(lastCall.body.options[1].hello, options.hello);
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });

    },

    testPasswordNonRoot: function(test) {
        var user = 'someuser';
        var newPassword = 'abc123';

        bigIp.password(user, newPassword)
            .then(function() {
                test.strictEqual(lastCall.method, 'modify');
                test.strictEqual(lastCall.path, '/tm/auth/user/' + user);
                test.strictEqual(lastCall.body.password, newPassword);
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });
    },

    testPasswordRoot: function(test) {
        var user = 'root';
        var newPassword = 'abc123';
        var oldPassword = 'def456';

        bigIp.password(user, newPassword, oldPassword)
            .then(function() {
                test.strictEqual(lastCall.method, 'create');
                test.strictEqual(lastCall.path, '/shared/authn/root');
                test.strictEqual(lastCall.body.newPassword, newPassword);
                test.strictEqual(lastCall.body.oldPassword, oldPassword);
                test.done();
            })
            .catch(function(err) {
                test.ok(false, err.message);
                test.done();
            });
    }
};