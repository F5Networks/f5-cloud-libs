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
        // upload to the ESE analytics service
        return q.all([
            eseAnalyticsUpload(metrics)
        ])
            .then(() => {
                return q.resolve('Metrics sent');
            })
            .catch((err) => {
                // do not reject, just log
                logger.error('Metrics upload error:', err && err.message ? err.message : err);
            });
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

function eseAnalyticsUpload(metrics) {
    const userAgent = 'F5CloudLibs/1.0';
    const getEndpointUrl = 'https://s3-us-west-1.amazonaws.com/eseanalytics/v1/info';
    const getEndpointHeaders = {
        'User-Agent': userAgent
    };
    const headers = {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        'x-api-key': 'klNnqVfprt8wWMmoNZIsa9GABxari6Y33K0JBkX6' // shared key for public service
    };

    // first query service containing endpoint
    return httpUtil.get(getEndpointUrl, { headers: getEndpointHeaders })
        .then((data) => {
            // expected output: { primaryEndpoint: 'url' }
            const endpoint = data ? data.primaryEndpoint : undefined;
            if (!endpoint) throw new Error('Missing endpoint');

            // certain values in data use OR operator to account for existing syntax
            const body = {
                metadata: {
                    service: 'cloud_templates',
                    type: 'JSON',
                    timestamp: new Date().toISOString(),
                    syntheticTest: metrics.syntheticTest || false
                },
                data: {
                    customerId: metrics.customerId,
                    deploymentId: metrics.deploymentId,
                    solutionName: metrics.solutionName || metrics.templateName,
                    solutionVersion: metrics.solutionVersion || metrics.templateVersion,
                    licenseType: metrics.licenseType,
                    platformName: metrics.platformName || metrics.cloudName,
                    platformRegion: metrics.platformRegion || metrics.region,
                    hostVersion: metrics.hostVersion || metrics.bigIpVersion,
                    cloudLibsVersion: metrics.cloudLibsVersion,
                    cloudLibsAction: metrics.action
                }
            };
            return httpUtil.post(endpoint, { body, headers });
        })
        .catch((error) => {
            return q.reject(error);
        });
}
