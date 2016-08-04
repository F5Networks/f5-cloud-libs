var q = require('q');
var BigIp = require('../../lib/bigIp');

var requestMap = {};
var lastCall = {};

var icontrolMock = {
    responseMap: {},

    list: function(path, opts, cb) {
        this.recordCall('list', path, null, opts);
        this.respond('list', path, cb);
    },

    create: function(path, body, opts, cb) {
        this.recordCall('create', path, body, opts);
        this.respond('create', path, cb);
    },

    modify: function(path, body, opts, cb) {
        this.recordCall('modify', path, body, opts);
        this.respond('modify', path, cb);
    },

    delete: function(path, opts, cb) {
        this.recordCall('delete', path, null, opts);
        this.respond('delete', path, cb);
    },

    when: function(method, path, response) {
        this.responseMap[method + '_' + path] = response;
    },

    reset: function() {
        this.responseMap = {};

        requestMap = {};
        lastCall.method = '';
        lastCall.path = '';
        lastCall.body = null;
        lastCall.opts = {};
    },

    recordCall: function(method, path, body, opts) {
        requestMap[method + '_' + path] = body;
        lastCall.method = method;
        lastCall.path = path;
        lastCall.body = body;
        lastCall.opts = opts;
    },

    respond: function(method, path, cb) {
        cb(false, this.responseMap[method + '_' + path] || true);
    }
};

var bigIp = new BigIp('host', 'user', 'password', {icontrol: icontrolMock});
bigIp.ready = function() {
    return q();
};

module.exports = {
    setUp: function(callback) {
        icontrolMock.reset();
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
    },

    testProvision: {
        setUp: function(callback) {
            var TRANSACTION_PATH = '/tm/transaction/';
            var TRANSACTION_ID = '1234';

            icontrolMock.when(
                'create',
                TRANSACTION_PATH,
                {
                    transId: TRANSACTION_ID
                }
            );

            icontrolMock.when(
                'modify',
                TRANSACTION_PATH + TRANSACTION_ID,
                {
                    state: 'COMPLETED'
                }
            );
            callback();
        },

        testBasic: function(test) {
            var provisionSettings = {
                mod1: 'level2',
                mod2: 'level2'
            };

            icontrolMock.when(
                'list',
                '/tm/sys/provision/',
                [
                    {
                        name: 'mod1',
                        level: 'level1'
                    },
                    {
                        name: 'mod2',
                        level: 'level2'
                    }
                ]
            );

            bigIp.provision(provisionSettings)
                .then(function() {
                    test.deepEqual(
                        requestMap['modify_/tm/sys/provision/mod1'],
                        {
                            level: 'level2'
                        }
                    );
                    test.done();
                })
                .catch(function(err) {
                    test.ok(false, err);
                    test.done();
                });
        },

        testNotProvisionable: function(test) {
            var provisionSettings = {
                foo: 'bar'
            };

            icontrolMock.when(
                'list',
                '/tm/sys/provision/',
                [
                    {
                        name: 'mod1',
                        level: 'level1'
                    }
                ]
            );

            bigIp.provision(provisionSettings)
                .then(function() {
                    test.ok(false, "Should have thrown as not provisionable.");
                    test.done();
                })
                .catch(function(err) {
                    test.notEqual(err.message.indexOf('foo'), -1);
                    test.notEqual(err.message.indexOf('not provisionable'), -1);
                    test.done();
                });
        }
    }
};