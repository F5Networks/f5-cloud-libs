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
    }
};

var argv;

module.exports = {
    setUp: function(callback) {
        argv = ['node', 'onboard', '--foreground', '--silent'];
        callback();
    },

    testMapSimple: function(test) {
        argv.push('--global-setting', 'myName:myVal');
        onboard.run(argv, {bigIp: bigIpMock});
        test.strictEqual(onboard.getGlobalSettings().myName, 'myVal');
        test.done();
    },

    testMapSpaces: function(test) {
        argv.push('--global-setting', 'myName : myVal');
        onboard.run(argv, {bigIp: bigIpMock});
        test.strictEqual(onboard.getGlobalSettings().myName, 'myVal');
        test.done();
    }
};