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
var q = require('q');
var httpUtil = require('./httpUtil');
var Logger = require('./logger');
var logger = Logger.getLogger({logLevel: 'none', module: module});

/**
 * @module
 */
module.exports = {
    upload: function(metrics) {

        const METRICS_URL = 'https://www.google-analytics.com/collect';
        const headers = {
            'User-Agent': 'Mozilla/5.0'
        };
        const METRICS_TRACKING_ID = 'UA-107165927-1';

        var payload = '';

        if (!metrics.customerId) {
            return q.reject(new Error('customer id is required'));
        }

        const customerUuid = uuid(metrics.customerId);

        payload = addMetricsComponent(payload, 'v', '1');
        payload = addMetricsComponent(payload, 't', 'event');
        payload = addMetricsComponent(payload, 'ec', 'run', 150);
        payload = addMetricsComponent(payload, 'tid', METRICS_TRACKING_ID);
        payload = addMetricsComponent(payload, 'cid', customerUuid, 150);
        payload = addMetricsComponent(payload, 'cd1', customerUuid, 150); // custom dimension to filter our customer IDs
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
        return httpUtil.post(METRICS_URL, {headers: headers, body: payload});
    },

    setLogger: function(aLogger) {
        logger = aLogger;
    },

    setLoggerOptions: function(loggerOptions) {
        loggerOptions.module = module;
        logger = Logger.getLogger(loggerOptions);
    }
};

var addMetricsComponent = function(payload, metric, data, maxLength) {
    if (data) {
        if (maxLength && data.length > maxLength) {
            data = data.substr(0, maxLength);
        }
        return payload + '&' + metric + '=' + encodeURIComponent(data);
    }
    else {
        return payload;
    }
};