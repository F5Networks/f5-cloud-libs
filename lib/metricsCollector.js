/**
 * Copyright 2017-2018 F5 Networks, Inc.
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
const q = require('q');
const httpUtil = require('./httpUtil');
const Logger = require('./logger');

let logger = Logger.getLogger({
    logLevel: 'none',
    module
});

/**
 * @module
 */
module.exports = {
    upload(metrics) {
        const METRICS_URL = 'https://www.google-analytics.com/collect';
        const headers = {
            'User-Agent': 'Mozilla/5.0'
        };
        const METRICS_TRACKING_ID = 'UA-47575237-11';

        let payload = '';

        if (!metrics.customerId) {
            return q.reject(new Error('customer id is required'));
        }

        const customerUuid = uuid(metrics.customerId);

        payload = addMetricsComponent(payload, 'v', '1');
        payload = addMetricsComponent(payload, 't', 'event');
        payload = addMetricsComponent(payload, 'ec', 'run', 150);
        payload = addMetricsComponent(payload, 'tid', METRICS_TRACKING_ID);
        payload = addMetricsComponent(payload, 'cid', customerUuid, 150);
        // customerUuid added here too because cid is not visible to queries
        payload = addMetricsComponent(payload, 'aiid', customerUuid, 150);
        payload = addMetricsComponent(payload, 'ea', metrics.action || 'unknown', 500);
        payload = addMetricsComponent(payload, 'an', metrics.templateName, 100);
        payload = addMetricsComponent(payload, 'aid', metrics.deploymentId, 150);
        payload = addMetricsComponent(payload, 'av', metrics.templateVersion, 100);
        payload = addMetricsComponent(payload, 'cn', metrics.cloudName, 100);
        payload = addMetricsComponent(payload, 'cm', metrics.region, 50);
        payload = addMetricsComponent(payload, 'cs', metrics.bigIpVersion, 100);
        payload = addMetricsComponent(payload, 'ck', metrics.licenseType, 500);
        payload = addMetricsComponent(payload, 'ds', metrics.cloudLibsVersion);

        logger.silly('sending metrics payload:', payload);
        return httpUtil.post(
            METRICS_URL,
            {
                body: payload,
                headers
            }
        );
    },

    setLogger(aLogger) {
        logger = aLogger;
    },

    setLoggerOptions(loggerOptions) {
        const loggerOpts = Object.assign({}, loggerOptions);
        loggerOpts.module = module;
        logger = Logger.getLogger(loggerOpts);
    }
};

function addMetricsComponent(payload, metric, data, maxLength) {
    let mungedData = data;
    if (mungedData) {
        if (maxLength && mungedData.length > maxLength) {
            mungedData = mungedData.substr(0, maxLength);
        }
        return `${payload}&${metric}=${encodeURIComponent(mungedData)}`;
    }

    return payload;
}
