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

module.exports = process.env.TEST_COVERAGE ?
{
    activeError: require('./lib-cov/activeError'),
    autoscaleProvider: require('./lib-cov/autoscaleProvider'),
    bigIp: require('./lib-cov/bigIp'),
    bigIpCluster: require('./lib-cov/bigIpCluster'),
    bigIpOnboard: require('./lib-cov/bigIpOnboard'),
    cryptoUtil: require('./lib-cov/cryptoUtil'),
    localKeyUtil: require('./lib-cov/localKeyUtil'),
    httpUtil: require('./lib-cov/httpUtil'),
    iControl: require('./lib-cov/iControl'),
    ipc: require('./lib-cov/ipc'),
    logger: require('./lib-cov/logger'),
    metricsCollector: require('./lib-cov/metricsCollector'),
    sharedConstants: require('./lib-cov/sharedConstants'),
    signals: require('./lib-cov/signals'),
    util: require('./lib-cov/util')
} :
{
    activeError: require('./lib/activeError'),
    autoscaleProvider: require('./lib/autoscaleProvider'),
    bigIp: require('./lib/bigIp'),
    bigIpCluster: require('./lib/bigIpCluster'),
    bigIpOnboard: require('./lib/bigIpOnboard'),
    cryptoUtil: require('./lib/cryptoUtil'),
    localKeyUtil: require('./lib/localKeyUtil'),
    httpUtil: require('./lib/httpUtil'),
    iControl: require('./lib/iControl'),
    ipc: require('./lib/ipc'),
    logger: require('./lib/logger'),
    metricsCollector: require('./lib/metricsCollector'),
    sharedConstants: require('./lib/sharedConstants'),
    signals: require('./lib/signals'),
    util: require('./lib/util')
};