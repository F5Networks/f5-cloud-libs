var BigIp = require('../../lib/bigIp');

var recordCall = function(method, path, opts) {
    lastMethod = method;
    lastPath = path;
    lastOpts = opts;
};

var icontrolMock = {
    list: function(path, opts, cb) {
        recordCall('list', path, opts);
        cb(false, true);
    },

    create: function(path, opts, cb) {
        recordCall('create', path, opts);
        cb(false, true);
    },

    modify: function(path, opts, cb) {
        recordCall('modify', path, opts);
        cb(false, true);
    },

    delete: function(path, opts, cb) {
        recordCall('delete', path, opts);
        cb(false, true);
    }
};

var bigIp = new BigIp('host', 'user', 'password', {icontrol: icontrolMock});

var lastMethod;
var lastPath;
var lastOpts;

module.exports = {
    setUp: function(callback) {
        lastMethod = '';
        lastPath = '';
        lastOpts = {};

        callback();
    },

    testListSuccess: function(test) {
        bigIp.list();
        test.strictEqual(lastMethod, 'list');
        test.done();
    },

    testLoadNoFile: function(test) {
        bigIp.load();
        test.strictEqual(lastMethod, 'create');
        test.strictEqual(lastPath, '/tm/sys/config');
        test.strictEqual(lastOpts.command, 'load');
        test.strictEqual(lastOpts.name, 'default');
        test.done();
    },

    testLoadFile: function(test) {
        var fileName = 'foobar';

        bigIp.load(fileName);
        test.strictEqual(lastOpts.options[0].file, fileName);
        test.done();
    },

    testLoadOptions: function(test) {
        var options = {
            foo: 'bar',
            hello: 'world'
        };

        bigIp.load(null, options);
        test.strictEqual(lastOpts.options[0].foo, options.foo);
        test.strictEqual(lastOpts.options[1].hello, options.hello);
        test.done();
    },

    testPasswordNonRoot: function(test) {
        var user = 'someuser';
        var newPassword = 'abc123';

        bigIp.password(user, newPassword);
        test.strictEqual(lastMethod, 'modify');
        test.strictEqual(lastPath, '/tm/auth/user/' + user);
        test.strictEqual(lastOpts.password, newPassword);
        test.done();
    },

    testPasswordRoot: function(test) {
        var user = 'root';
        var newPassword = 'abc123';
        var oldPassword = 'def456';

        bigIp.password(user, newPassword, oldPassword);
        test.strictEqual(lastMethod, 'create');
        test.strictEqual(lastPath, '/shared/authn/root');
        test.strictEqual(lastOpts.newPassword, newPassword);
        test.strictEqual(lastOpts.oldPassword, oldPassword);
        test.done();
    }
};