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

const icontrolMock = require('../testUtil/icontrolMock');

let BigIp;
let bigIp;
let bigIqOnboardMixins;

module.exports = {
    setUp(callback) {
        BigIp = require('../../../f5-cloud-libs').bigIp;
        bigIqOnboardMixins = require('../../../f5-cloud-libs').bigIqOnboardMixins;

        bigIp = new BigIp();
        bigIp.isInitialized = true;
        bigIp.icontrol = icontrolMock;

        bigIqOnboardMixins.core = bigIp;

        icontrolMock.reset();
        callback();
    },

    testIsMasterKeySet: {
        testIsSet(test) {
            icontrolMock.when(
                'list',
                '/cm/shared/secure-storage/masterkey',
                {
                    isMkSet: true
                }
            );

            test.expect(1);
            bigIqOnboardMixins.isMasterKeySet()
                .then((isSet) => {
                    test.ok(isSet);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testIsNotSet(test) {
            icontrolMock.when(
                'list',
                '/cm/shared/secure-storage/masterkey',
                {
                    isMkSet: false
                }
            );

            test.expect(1);
            bigIqOnboardMixins.isMasterKeySet()
                .then((isSet) => {
                    test.ok(!isSet);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testSetMasterPassphrase(test) {
        const passphrase = 'my passphrase';

        bigIqOnboardMixins.setMasterPassphrase(passphrase)
            .then(() => {
                const passphraseRequest =
                    icontrolMock.getRequest('create', '/cm/shared/secure-storage/masterkey');
                test.strictEqual(passphraseRequest.passphrase, passphrase);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testSetRandomMasterPassphrase(test) {
        bigIqOnboardMixins.setRandomMasterPassphrase()
            .then(() => {
                const passphraseRequest =
                    icontrolMock.getRequest('create', '/cm/shared/secure-storage/masterkey');
                test.ok(passphraseRequest.passphrase);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    }
};