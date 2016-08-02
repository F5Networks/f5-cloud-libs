var onboard = require('../onboard');
var q = require('q');

var bigIpMock = {
    list: function() {
        return q();
    },

    modify: function() {
        return q();
    },

    create: function() {
        return q();
    },

    delete: function() {
        return q();
    },

    ready: function() {
        return q();
    },

    globalSettings: function() {
        return q();
    },

    save: function() {
        return q();
    },

    rebootRequired: function() {
        return q('reboot');
    },

    reboot: function() {
        rebootRequested = true;
        return q();
    }
};

var testOptions = {bigIp: bigIpMock};
var argv;
var rebootRequested;

module.exports = {
    setUp: function(callback) {
        argv = ['node', 'onboard', '--foreground', '--silent'];
        rebootRequested = false;
        callback();
    },

    testCollect: function(test) {
        argv.push('--ntp', 'one', '--ntp', 'two');
        onboard.run(argv, testOptions);
        test.strictEqual(onboard.getOptions().ntp.length, 2);
        test.done();
    },

    testMapSimple: function(test) {
        argv.push('--global-setting', 'name1:value1');
        onboard.run(argv, testOptions);
        test.strictEqual(onboard.getGlobalSettings().name1, 'value1');
        test.done();
    },

    testMapSpaces: function(test) {
        argv.push('--global-setting', ' name1 : value1 ');
        onboard.run(argv, testOptions);
        test.strictEqual(onboard.getGlobalSettings().name1, 'value1');
        test.done();
    },

    testMapMultiple: function(test) {
        argv.push('--global-setting', 'name1:value1');
        argv.push('--global-setting', 'name2:value2');
        onboard.run(argv, testOptions);
        test.strictEqual(onboard.getGlobalSettings().name1, 'value1');
        test.strictEqual(onboard.getGlobalSettings().name2, 'value2');
        test.done();
    },

    testReboot: function(test) {
        onboard.run(argv, testOptions, function() {
            test.ok(rebootRequested);
            test.done();
        });
    },

    testNoReboot: function(test) {
        argv.push('--no-reboot');
        onboard.run(argv, testOptions, function() {
            test.ifError(rebootRequested);
            test.done();
        });
    }
};