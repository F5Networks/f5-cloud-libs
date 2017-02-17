/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var onboard = require('../../scripts/onboard');
var ipc = require('../../lib/ipc');
var q = require('q');

var bigIpMock = {
    init: function() {
        return q();
    },

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

    save: function() {
        return q();
    },

    active: function() {
        return q();
    },

    rebootRequired: function() {
        return q('reboot');
    },

    reboot: function() {
        rebootRequested = true;
        return q();
    },

    onboard: {
        globalSettings: function() {
            return q();
        },

        updateUser: function(user, password, role, shell) {
            this.updatedUsers = this.updatedUsers || [];
            this.updatedUsers.push({
                user: user,
                password: password,
                role: role,
                shell: shell
            });

            return q();
        }
    },
};

var testOptions = {
    bigIp: bigIpMock
};

var argv;
var rebootRequested;

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);

// Don't let onboard exit - we need the nodeunit process to run to completion
process.exit = function() {};

// Just resolve right away, otherwise these tests never exit
ipc.once = function() {
    var deferred = q.defer();
    deferred.resolve();
    return deferred;
};

module.exports = {
    setUp: function(callback) {
        argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];
        rebootRequested = false;
        callback();
    },

    testCollect: function(test) {
        argv.push('--ntp', 'one', '--ntp', 'two');
        onboard.run(argv, testOptions, function() {
            test.strictEqual(onboard.getOptions().ntp.length, 2);
            test.done();
        });
    },

    testPairSimple: function(test) {
        argv.push('--global-setting', 'name1:value1');
        onboard.run(argv, testOptions, function() {
            test.strictEqual(onboard.getGlobalSettings().name1, 'value1');
            test.done();
        });
    },

    testPairSpaces: function(test) {
        argv.push('--global-setting', ' name1 : value1 ');
        onboard.run(argv, testOptions, function() {
            test.strictEqual(onboard.getGlobalSettings().name1, 'value1');
            test.done();
        });
    },

    testPairMultiple: function(test) {
        argv.push('--global-setting', 'name1:value1');
        argv.push('--global-setting', 'name2:value2');
        onboard.run(argv, testOptions, function() {
            test.strictEqual(onboard.getGlobalSettings().name1, 'value1');
            test.strictEqual(onboard.getGlobalSettings().name2, 'value2');
            test.done();
        });
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
    },

    testUpdateUser: function(test) {
        argv.push('--update-user', 'user:user1,password:pass1,role:role1,shell:shell1', '--update-user', 'user:user2,password:pass2,shell:shell2');
        onboard.run(argv, testOptions, function() {
            test.strictEqual(bigIpMock.onboard.updatedUsers.length, 2);
            test.deepEqual(bigIpMock.onboard.updatedUsers[0], {
                user: "user1",
                password: "pass1",
                role: "role1",
                shell: "shell1"
            });
            test.deepEqual(bigIpMock.onboard.updatedUsers[1], {
                user: "user2",
                password: "pass2",
                role: undefined,
                shell: "shell2"
            });
            test.done();
        });
    }
};