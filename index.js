/**
 * Copyright 2016-2018 F5 Networks, Inc.
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

/* eslint-disable global-require */
module.exports = {
    activeError: require('./lib/activeError'),
    authn: require('./lib/authn'),
    autoscaleInstance: require('./lib/autoscaleInstance'),
    cloudProvider: require('./lib/cloudProvider'),
    bigIp: require('./lib/bigIp'),
    bigIpCluster: require('./lib/bigIpCluster'),
    bigIpOnboard: require('./lib/bigIpOnboard'),
    bigIq: require('./lib/bigIq'),
    bigIqOnboardMixins: require('./lib/bigIqOnboardMixins'),
    bigIqLicenseProviderFactory: require('./lib/bigIqLicenseProviderFactory'),
    cloudProviderFactory: require('./lib/cloudProviderFactory'),
    cryptoUtil: require('./lib/cryptoUtil'),
    dnsProvider: require('./lib/dnsProvider'),
    dnsProviderFactory: require('./lib/dnsProviderFactory'),
    gtmDnsProvider: require('./lib/gtmDnsProvider'),
    localCryptoUtil: require('./lib/localCryptoUtil'),
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
