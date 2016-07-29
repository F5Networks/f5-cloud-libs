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
        return q();
    }
};

var argv;
var testOptions = {bigIp: bigIpMock};

module.exports = {
    setUp: function(callback) {
        argv = ['node', 'onboard', '--foreground', '--silent'];
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
    }
};