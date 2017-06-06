/**
 * Copyright 2017 F5 Networks, Inc.
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

var util = require('util');
var AutoscaleProvider = require('../../../f5-cloud-libs').autoscaleProvider;

util.inherits(TestAutoscaleProvider, AutoscaleProvider);
function TestAutoscaleProvider(options) {
    TestAutoscaleProvider.super_.call(this, options);
}

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);
process.setMaxListeners(0);

var testAutoscaleProvider;

module.exports = {
    setUp: function(callback) {
        testAutoscaleProvider = new TestAutoscaleProvider();
        callback();
    },

    testClOptions: function(test) {
        var clOptions = {
            foo: 'bar',
            hello: 'world'
        };

        testAutoscaleProvider = new TestAutoscaleProvider({clOptions: clOptions});
        test.deepEqual(testAutoscaleProvider.clOptions, clOptions);
        test.done();
    },

    testInit: function(test) {
        test.expect(1);
        testAutoscaleProvider.init()
            .then(function() {
                test.ok(true);
                test.done();
            });
    },

    testUnimplementedGetInstanceId: function(test) {
        test.throws(function() {
            testAutoscaleProvider.getInstanceId();
        });
        test.done();
    },

    testUnimplementedGetInstances: function(test) {
        test.throws(function() {
            testAutoscaleProvider.getInstances();
        });
        test.done();
    },

    testUnimplementedElectMaster: function(test) {
        test.throws(function() {
            testAutoscaleProvider.electMaster();
        });
        test.done();
    },

    testUnimplementedGetMasterCredentials: function(test) {
        test.throws(function() {
            testAutoscaleProvider.getMasterCredentials();
        });
        test.done();
    },

    testUnimplementedPutMasterCredentials: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.putMasterCredentials();
        });
        test.done();
    },

    testUnimplementedGetNicsByTag: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.getNicsByTag();
            });
            test.done();
    },

    testUnimplementedGetVmsByTag: function(test) {
            test.doesNotThrow(function() {
                testAutoscaleProvider.getVmsByTag();
            });
            test.done();
    },

    testUnimplementedIsValidMaster: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.isValidMaster();
        });
        test.done();
    },

    testUnimplementedMasterElected: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.masterElected();
        });
        test.done();
    },

    testUnimplementedPutInstance: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.putInstance();
        });
        test.done();
    },

    testUnimplementedSetInstanceProtection: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.setInstanceProtection();
        });
        test.done();
    },

    testUnimplementedUnsetInstanceProtection: function(test) {
        test.doesNotThrow(function() {
            testAutoscaleProvider.unsetInstanceProtection();
        });
        test.done();
    }
};
