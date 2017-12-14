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

var uuid = require('uuid5');
var httpUtil = require('../../../f5-cloud-libs').httpUtil;
var metricsCollector = require('../../../f5-cloud-libs').metricsCollector;

var calledBody;

module.exports = {
    setUp: function(callback) {
        calledBody = '';
        httpUtil.post = function(url, options) {
            calledBody = options.body;
        };

        callback();
    },

    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });
        callback();
    },

    testBasic: function(test) {
        var metrics = {
            customerId: 'myCustomerId',
            action: 'myAction',
            templateName: 'myTemplateName',
            deploymentId: 'myDeploymentId',
            templateVersion: 'myTemplateVersion',
            cloudName: 'myCloudName',
            region: 'myRegion',
            bigIpVersion: 'myBigIpVersion',
            licenseType: 'myLicenseType',
            cloudLibsVersion: 'myCloudLibsVersion'
        };
        metricsCollector.upload(metrics);
        test.strictEqual(calledBody,
            '&v=1' +
            '&t=event&ec=run' +
            '&tid=' + 'UA-47575237-11' +
            '&cid=' + uuid(metrics.customerId) +
            '&aiid=' + uuid(metrics.customerId) +
            '&ea=' + metrics.action +
            '&an=' + metrics.templateName +
            '&aid=' + metrics.deploymentId +
            '&av=' + metrics.templateVersion +
            '&cn=' + metrics.cloudName +
            '&cm=' + metrics.region +
            '&cs=' + metrics.bigIpVersion +
            '&ck=' + metrics.licenseType +
            '&ds=' + metrics.cloudLibsVersion);
        test.done();
    },

    testNoCustomerId: function(test) {
        var metrics = {
            action: 'myAction',
            templateName: 'myTemplateName',
            deploymentId: 'myDeploymentId',
            templateVersion: 'myTemplateVersion',
            cloudName: 'myCloudName',
            region: 'myRegion',
            bigIpVersion: 'myBigIpVersion',
            licenseType: 'myLicenseType',
            cloudLibsVersion: 'myCloudLibsVersion'
        };
        metricsCollector.upload(metrics)
            .then(function() {
                test.ok(false, 'should have rejected no customerId');
            })
            .catch(function(err) {
                test.notStictEqual(err.message.indexOf('customer id'), -1);
            })
            .finally(function() {
                test.done();
            });
    },

    testDataTruncated: function(test) {
        var metrics = {
            customerId: 'myCustomerId',
            region: '012345678901234567890123456789012345678901234567891'
        };
        metricsCollector.upload(metrics);
        test.strictEqual(calledBody,
            '&v=1' +
            '&t=event&ec=run' +
            '&tid=' + 'UA-47575237-11' +
            '&cid=' + uuid(metrics.customerId) +
            '&aiid=' + uuid(metrics.customerId) +
            '&ea=unknown' +
            '&cm=' + '01234567890123456789012345678901234567890123456789'
        );
        test.done();
    },

    testSetLogger: (function(test) {
        test.doesNotThrow(function() {
            metricsCollector.setLogger({});
        });
        test.done();
    }),

    testSetLoggerOptions: function(test) {
        test.doesNotThrow(function() {
            metricsCollector.setLoggerOptions({});
        });
        test.done();
    }
};