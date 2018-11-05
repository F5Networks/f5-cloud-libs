/**
 * Copyright 2018 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const icontrolMock = require('../testUtil/icontrolMock');
const Logger = require('../../../f5-cloud-libs').logger;
const q = require('q');

let utilMock;

let BigIp;
let bigIp;
let bigIqClusterMixins;

let passedInitParams;
let waitForPeeredParams;
let bigIqClusterMixinsWaitForPeered;
let bigIqClusterMixinsWaitForPeerReady;

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        BigIp = require('../../../f5-cloud-libs').bigIp;
        bigIqClusterMixins = require('../../../f5-cloud-libs').bigIqClusterMixins;

        utilMock = require('../../lib/util');

        utilMock.logAndExit = () => { };
        utilMock.logError = () => { };

        bigIp = new BigIp();
        bigIp.isInitialized = true;
        bigIp.icontrol = icontrolMock;
        bigIp.init = function init() {
            passedInitParams = Array.from(arguments);
            return q();
        };

        bigIqClusterMixins.core = bigIp;
        bigIqClusterMixins.logger = Logger.getLogger({ console: false });

        icontrolMock.reset();
        callback();
    },


    testAddSecondary: {
        setUp(callback) {
            bigIqClusterMixinsWaitForPeered = bigIqClusterMixins.waitForPeered;
            bigIqClusterMixins.waitForPeered = (response) => {
                waitForPeeredParams = response;
                return q(response);
            };

            bigIqClusterMixinsWaitForPeerReady = bigIqClusterMixins.waitForPeerReady;
            bigIqClusterMixins.waitForPeerReady = () => {
                return q();
            };

            callback();
        },
        testAddSecondarySuccess(test) {
            icontrolMock.when(
                'list',
                '/shared/ssh-trust-setup?ipAddress=1.2.3.4',
                {
                    fingerprint: '2048 1:2:3:4 1.2.3.4 (RSA)'
                }
            );

            const addPeerTaskResponse = {
                id: 'aa37ffa0-fd1a-4f68-9385-b0bf122fe721',
                progress: 'Adding Peer to BIG-IQ Device Group',
                startDateTime: '2018-09-26T18:17:09.024+0000',
                status: 'FINISHED',
                step: 'ADD_TO_HA_GROUP',
            };

            icontrolMock.when(
                'create',
                '/shared/ha/add-peer-task',
                addPeerTaskResponse
            );

            bigIqClusterMixins.addSecondary('1.2.3.4', 'admin', 'password', 'rootPassword', { bigIp })
                .then(() => {
                    test.expect(1);
                    test.deepEqual(addPeerTaskResponse, waitForPeeredParams);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        tearDown(callback) {
            bigIqClusterMixins.waitForPeerReady = bigIqClusterMixinsWaitForPeerReady;
            bigIqClusterMixins.waitForPeered = bigIqClusterMixinsWaitForPeered;
            callback();
        }
    },

    testWaitFunctions: {
        setUp(callback) {
            callback();
        },

        testWaitForPeered(test) {
            const listResponse = {
                step: 'ADD_TO_HA_GROUP',
                progress: 'Adding Peer to BIG-IQ Device Group',
                status: 'FINISHED'
            };
            bigIp.list = () => {
                return q(listResponse);
            };

            bigIqClusterMixins.waitForPeered('task1')
                .then((response) => {
                    test.expect(1);
                    test.deepEqual(response, listResponse);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testWaitForPeeredFailed(test) {
            const errorMessage =
                'Authentication Failure to host 18.235.136.32. Please check the credentials provided.';
            const listResponse = {
                step: 'ADD_TO_HA_GROUP',
                progress: 'Adding Peer to BIG-IQ Device Group',
                errorMessage,
                status: 'FAILED'
            };
            bigIp.list = () => {
                return q(listResponse);
            };

            bigIqClusterMixins.waitForPeered('task1')
                .then(() => {
                    test.ok(false, 'Should have thrown authentication failure');
                })
                .catch((err) => {
                    test.expect(2);
                    test.strictEqual(err.message, errorMessage);
                    test.strictEqual(err.code, 400);
                })
                .finally(() => {
                    test.done();
                });
        },

        testWaitForPeerReady(test) {
            const listResponse = {
                discoveryAddress: '1.2.3.4',
                generation: 2,
                lastUpdateMicros: 1538757916491067,
                kind: 'shared:identified-devices:config:discovery:discoveryconfigworkerstate',
                selfLink: 'https://localhost/mgmt/shared/identified-devices/config/discovery'
            };
            bigIp.list = () => {
                return q(listResponse);
            };
            bigIqClusterMixins.icontrol = icontrolMock;
            icontrolMock.when(
                'create',
                '/shared/authn/login',
                {
                    result: 'true'
                }
            );
            bigIqClusterMixins.waitForPeerReady(bigIp, '1.2.3.4', 'user', 'password1')
                .then((response) => {
                    test.expect(2);
                    test.deepEqual(listResponse, response);
                    test.deepEqual(
                        passedInitParams,
                        [
                            '1.2.3.4',
                            'user',
                            'password1',
                            { port: 443, passwordIsUrl: false, passwordEncrypted: false }
                        ]
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testWaitForPeerReadyNotReady(test) {
            const listResponse = {
                name: 'systemauth.disablerootlogin',
                value: 'true'
            };
            bigIp.list = () => {
                return q(listResponse);
            };

            bigIqClusterMixins.waitForPeerReady(
                bigIp,
                '1.2.3.4',
                'user',
                'password1',
                { maxRetries: 2, retryIntervalMs: 100 }
            )
                .then(() => {
                    test.ok(false, 'should have received error that secondary is not ready');
                })
                .catch((err) => {
                    test.expect(1);
                    test.strictEqual(
                        err.message,
                        // eslint-disable-next-line max-len
                        'tryUntil: max tries reached: Failover peer not ready for peering. Root not yet enabled on peer'
                    );
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
