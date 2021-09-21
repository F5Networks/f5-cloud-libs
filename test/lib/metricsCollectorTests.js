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
const assert = require('assert');
const httpUtil = require('../../../f5-cloud-libs').httpUtil;
const metricsCollector = require('../../../f5-cloud-libs').metricsCollector;

describe('Metrics Collector Unit Tests', () => {
    const eseAnalyticsUrl = 'http://www.example.com/';

    let googleAnalyticsCalledBody = '';
    let eseAnalyticsCalledBody = '';

    beforeEach(() => {
        httpUtil.post = (url, options) => {
            if (url === eseAnalyticsUrl) {
                eseAnalyticsCalledBody = options.body;
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
    });
    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('basic test', () => {
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
        const googleAnalyticsString = '&v=1' +
            '&t=event&ec=run' +
            '&tid=UA-47575237-11' +
            `&cid=${uuid(metrics.customerId)}` +
            `&aiid=${uuid(metrics.customerId)}` +
            `&ea=${metrics.action}` +
            `&an=${metrics.templateName}` +
            `&aid=${metrics.deploymentId}` +
            `&av=${metrics.templateVersion}` +
            `&cn=${metrics.cloudName}` +
            `&cm=${metrics.region}` +
            `&cs=${metrics.bigIpVersion}` +
            `&ck=${metrics.licenseType}` +
            `&ds=${metrics.cloudLibsVersion}`;
        const eseAnalyticsObject = {
            metadata: {
                service: 'cloud_templates',
                type: 'JSON',
                timestamp: 'foo',
                syntheticTest: false
            },
            data: {
                customerId: metrics.customerId,
                deploymentId: metrics.deploymentId,
                solutionName: metrics.templateName,
                solutionVersion: metrics.templateVersion,
                licenseType: metrics.licenseType,
                platformName: metrics.cloudName,
                platformRegion: metrics.region,
                hostVersion: metrics.bigIpVersion,
                cloudLibsVersion: metrics.cloudLibsVersion,
                cloudLibsAction: metrics.action
            }
        };

        return metricsCollector.upload(metrics)
            .then(() => {
                assert.strictEqual(googleAnalyticsCalledBody, googleAnalyticsString);

                // replace with actual timestamp first
                eseAnalyticsObject.metadata.timestamp = eseAnalyticsCalledBody.metadata.timestamp;
                assert.deepStrictEqual(eseAnalyticsCalledBody, eseAnalyticsObject);
            });
    });

    it('truncated data test', () => {
        const metrics = {
            customerId: 'myCustomerId',
            region: '012345678901234567890123456789012345678901234567891'
        };
        const googleAnalyticsString = '&v=1' +
            '&t=event&ec=run' +
            '&tid=UA-47575237-11' +
            `&cid=${uuid(metrics.customerId)}` +
            `&aiid=${uuid(metrics.customerId)}` +
            '&ea=unknown' +
            '&cm=01234567890123456789012345678901234567890123456789';

        return metricsCollector.upload(metrics)
            .then(() => {
                assert.strictEqual(googleAnalyticsCalledBody, googleAnalyticsString);
            });
    });

    it('set logger test', () => {
        assert.doesNotThrow(() => {
            metricsCollector.setLogger({});
        });
    });

    it('set logger options', () => {
        assert.doesNotThrow(() => {
            metricsCollector.setLoggerOptions({});
        });
    });
});
