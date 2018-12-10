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

const q = require('q');
const uuid = require('uuid5');
const httpUtil = require('../../../f5-cloud-libs').httpUtil;
const metricsCollector = require('../../../f5-cloud-libs').metricsCollector;

const eseAnalyticsUrl = 'http://www.example.com/';

let googleAnalyticsCalledBody = '';
let eseAnalyticsCalledBody = '';

module.exports = {
    setUp(callback) {
        httpUtil.post = (url, options) => {
            if (url === eseAnalyticsUrl) {
                eseAnalyticsCalledBody = JSON.stringify(options.body);
            } else {
                googleAnalyticsCalledBody = options.body;
            }
        };
        // eslint-disable-next-line no-unused-vars
        httpUtil.get = (url, options) => {
            return q.resolve({
                primaryEndpoint: eseAnalyticsUrl
            });
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
        const googleAnalyticsString = `&v=1\
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
&ds=${metrics.cloudLibsVersion}`;
        const eseAnalyticsString = JSON.stringify({
            metadata: {
                service: 'cloud_templates',
                type: 'JSON'
            },
            data:
                {
                    customerId: metrics.customerId,
                    deploymentId: metrics.deploymentId,
                    solutionName: metrics.templateName,
                    solutionVersion: metrics.templateVersion,
                    licenseType: metrics.licenseType,
                    platformName: metrics.cloudName,
                    platformRegion: metrics.region,
                    hostVersion: metrics.bigIpVersion,
                    cloudLibsVersion: metrics.cloudLibsVersion,
                    cloudLibsAction: metrics.action,
                    syntheticTest: false
                }
        });

        metricsCollector.upload(metrics)
            .then(() => {
                test.strictEqual(googleAnalyticsCalledBody, googleAnalyticsString);
                test.strictEqual(eseAnalyticsCalledBody, eseAnalyticsString);
            })
            .catch((err) => {
                test.ok(false, err);
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
        const googleAnalyticsString = `&v=1\
&t=event&ec=run\
&tid=UA-47575237-11\
&cid=${uuid(metrics.customerId)}\
&aiid=${uuid(metrics.customerId)}\
&ea=unknown\
&cm=01234567890123456789012345678901234567890123456789`;

        metricsCollector.upload(metrics)
            .then(() => {
                test.strictEqual(googleAnalyticsCalledBody, googleAnalyticsString);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
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
