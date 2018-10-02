/**
 * Copyright 2018 F5 Networks, Inc.
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
const util = require('./util');
const IControl = require('./iControl');

/**
 * Functions that only pertain to BIG-IQ clustering, not BIG-IP
 *
 * @mixin
 */
const bigIqClusterMixins = {

    /**
     * Configures the specified failover peer as a secondary in a BIQ-IQ High Availability configuration
     *
     * @param {String}  failoverPeerIp          - IP address of the failover peer
     * @param {String}  failoverPeerUsername    - Username of the admin user on the failover peer
     * @param {String}  failoverPeerPassword    - Password of the admin user on the failover peer
     * @param {String}  rootPassword            - Password of the root user on the failover peer
     * @param {Object}  [testOpts]              - testOpts - Options used during testing
     * @param {Object}  [testOpts.bigIp]        - BigIp object to use for testing
     *
     * @returns {Promise} A Promise which is resolved with the status of the BIG-IQ peering task
     */
    addSecondary(failoverPeerIp, failoverPeerUsername, failoverPeerPassword, rootPassword, testOpts) {
        return q()
            .then(() => {
                let remoteBigIp;
                if (testOpts && typeof testOpts.bigIp !== 'undefined') {
                    remoteBigIp = testOpts.bigIp;
                } else {
                    const BigIp = require('./bigIp'); // eslint-disable-line global-require
                    remoteBigIp = new BigIp({ loggerOptions: this.loggerOptions });
                }
                // wait for peer to be ready
                return this.waitForPeerReady(
                    remoteBigIp,
                    failoverPeerIp,
                    failoverPeerUsername,
                    failoverPeerPassword,
                    {
                        maxRetries: 12,
                        retryIntervalMs: 75000
                    }
                );
            })
            .then(() => {
                return getFailoverPeerFingerprint.call(this, failoverPeerIp);
            })
            .then((fingerprint) => {
                this.logger.debug('Retrieved ssh fingerprint for failover peer');
                return addFailoverPeer.call(
                    this,
                    fingerprint,
                    failoverPeerUsername,
                    failoverPeerPassword,
                    rootPassword,
                    failoverPeerIp
                );
            })
            .then((response) => {
                this.logger.debug('waiting for devices to complete peering');
                return this.waitForPeered(response);
            })
            .catch((err) => {
                return q.reject(err);
            });
    },

    /**
     * Polls the status of a BIG-IQ high-availability peering task.
     *
     * @param {String}  task                            - Task ID value from BIG-IQ add-peer-task call
     * @param {Object}  [retryOptions]                  - Options for retrying the request.
     * @param {Integer} [retryOptions.maxRetries]       - Number of times to retry if first
     * @param {Integer} [retryOptions.retryIntervalMs]  - Milliseconds between retries.
     *
     * @returns {Promise} A Promise which is resolved with the peering task response
     *                      or a peering task failure message
     */
    waitForPeered(task, retryOptions) {
        const taskId = task.id;

        const func = function () {
            return this.core.list(`/shared/ha/add-peer-task/${taskId}`)
                .then((response) => {
                    this.logger.silly(`${response.progress} for task ${taskId}, on step ${response.step}`);
                    if (response.status === 'FINISHED') {
                        this.logger.silly('peering task completed');
                        return q(response);
                    } else if (response.status === 'FAILED') {
                        // force 400 error to break util.tryUntil loop
                        const taskError = {
                            message: response && response.errorMessage
                                ? response.errorMessage
                                : 'peering task FAILED',
                            code: 400
                        };
                        return q.reject(taskError);
                    }
                    this.logger.silly(`peering task ${taskId} not yet complete`);
                    return q.reject();
                })
                .catch((err) => {
                    this.logger.debug(
                        'peering task not yet complete',
                        err && err.message ? err.message : err
                    );
                    return q.reject(err);
                });
        };

        return util.tryUntil(this, retryOptions || util.DEFAULT_RETRY, func);
    },

    /**
     * Polls the failover peer BIG-IQ in a high-availabilty configuration to see if the failover peer is
     * ready to accept a peering task request.
     *
     * @param {Object}  remoteBigIp                     - BIG-IQ instance for the failover peer BIG-IQ
     * @param {String}  failoverPeerIp                  - IP address of the failover peer
     * @param {String}  failoverPeerUsername            - Username of the admin user on the failover peer
     * @param {String}  failoverPeerPassword            - Password of the admin user on the failover peer
     * @param {Integer} [retryOptions.maxRetries]       - Number of times to retry if first
     * @param {Integer} [retryOptions.retryIntervalMs]  - Milliseconds between retries.
     *
     * @returns {Promise} A Promise which is resolved when the failover peer BIG-IQ is ready, or an error
     *                      if the BIG-IQ is not ready within the retry period
     */
    waitForPeerReady(remoteBigIp, failoverPeerIp, failoverPeerUsername, failoverPeerPassword, retryOptions) {
        const func = function () {
            return q()
                .then(() => {
                    const icontrol = this.icontrol || new IControl(
                        {
                            port: '443',
                            host: failoverPeerIp.trim(),
                            user: failoverPeerUsername.trim(),
                            password: failoverPeerPassword.trim(),
                            basePath: '/mgmt',
                            strict: false,
                        }
                    );
                    icontrol.authToken = null;
                    return icontrol.create('/shared/authn/login',
                        {
                            failoverPeerUsername, failoverPeerPassword
                        });
                })
                .then(() => {
                    return remoteBigIp.init(
                        failoverPeerIp,
                        failoverPeerUsername,
                        failoverPeerPassword,
                        {
                            port: 443,
                            passwordIsUrl: false,
                            passwordEncrypted: false
                        }
                    );
                })
                .then(() => {
                    return remoteBigIp.list('/tm/sys/db/systemauth.disablerootlogin');
                })
                .then((response) => {
                    if (response && response.value === 'false') {
                        this.logger.debug('Failover peer is ready for peering');
                    } else {
                        const message = 'Failover peer not ready for peering. Root not yet enabled on peer';
                        this.logger.silly(message);

                        return q.reject({ message });
                    }
                    return q(response);
                })
                .catch((err) => {
                    this.logger.silly(
                        'Failover peer not yet ready for peering.',
                        err && err.message ? err.message : err
                    );
                    return q.reject(err);
                });
        };

        return util.tryUntil(this, retryOptions || util.DEFAULT_RETRY, func);
    }
};

function getFailoverPeerFingerprint(ipAddress) {
    return this.core.list(`/shared/ssh-trust-setup?ipAddress=${ipAddress}`)
        .then((response) => {
            return q(response.fingerprint);
        });
}

function addFailoverPeer(fingerprint, userName, password, rootPassword, ipAddress) {
    this.logger.debug('Adding BIG-IQ as failover peer');
    return this.core.create(
        '/shared/ha/add-peer-task',
        {
            fingerprint,
            userName,
            password,
            rootPassword,
            ipAddress
        },
        null,
        null,
        { silent: true }
    );
}
module.exports = bigIqClusterMixins;
