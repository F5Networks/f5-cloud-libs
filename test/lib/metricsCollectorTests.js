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

const uuid = require('uuid5');
const httpUtil = require('../../../f5-cloud-libs').httpUtil;
const metricsCollector = require('../../../f5-cloud-libs').metricsCollector;

let calledBody;

module.exports = {
    setUp(callback) {
        calledBody = '';
        httpUtil.post = (url, options) => {
            calledBody = options.body;
        };

        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },

    testBasic(test) {
        const metrics = {
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

        test.strictEqual(calledBody, `&v=1\
&t=event&ec=run\
&tid=UA-47575237-11\
&cid=${uuid(metrics.customerId)}\
&aiid=${uuid(metrics.customerId)}\
&ea=${metrics.action}\
&an=${metrics.templateName}\
&aid=${metrics.deploymentId}\
&av=${metrics.templateVersion}\
&cn=${metrics.cloudName}\
&cm=${metrics.region}\
&cs=${metrics.bigIpVersion}\
&ck=${metrics.licenseType}\
&ds=${metrics.cloudLibsVersion}`);

        test.done();
    },

    testNoCustomerId(test) {
        const metrics = {
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
            .then(() => {
                test.ok(false, 'should have rejected no customerId');
            })
            .catch((err) => {
                test.notStictEqual(err.message.indexOf('customer id'), -1);
            })
            .finally(() => {
                test.done();
            });
    },

    testDataTruncated(test) {
        const metrics = {
            customerId: 'myCustomerId',
            region: '012345678901234567890123456789012345678901234567891'
        };
        metricsCollector.upload(metrics);
        test.strictEqual(calledBody, `&v=1\
&t=event&ec=run\
&tid=UA-47575237-11\
&cid=${uuid(metrics.customerId)}\
&aiid=${uuid(metrics.customerId)}\
&ea=unknown\
&cm=01234567890123456789012345678901234567890123456789`);
        test.done();
    },

    testSetLogger: ((test) => {
        test.doesNotThrow(() => {
            metricsCollector.setLogger({});
        });
        test.done();
    }),

    testSetLoggerOptions(test) {
        test.doesNotThrow(() => {
            metricsCollector.setLoggerOptions({});
        });
        test.done();
    }
};
