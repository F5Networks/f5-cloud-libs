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
            '&tid=' + 'UA-107165927-1' +
            '&cid=' + uuid(metrics.customerId) +
            '&cd1=' + uuid(metrics.customerId) +
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
    }
};