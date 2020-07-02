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

const cryptoUtil = require('./cryptoUtil');
const util = require('./util');
const q = require('q');
const url = require('url');

const MIN_PASSPHRASE_LENGTH = 16;
const SPECIALS = ['!', '"', '#', '$', '%', '&', '(', ')', '*', '+', '-', '.', '/', '?', '^', '<', '>', '-'];
const ASCII_UPPER_CASE_LOW = 65;
const ASCII_UPPER_CASE_HIGH = 90;
const ASCII_LOWER_CASE_LOW = 97;
const ASCII_LOWER_CASE_HIGH = 122;
const ASCII_NUMBER_LOW = 48;
const ASCII_NUMBER_HIGH = 57;

const STATUS_ACTIVATING_AUTOMATIC = 'ACTIVATING_AUTOMATIC';
const STATUS_NEEDS_EULA = 'ACTIVATING_AUTOMATIC_NEED_EULA_ACCEPT';
const STATUS_ACCEPT_EULA = 'ACTIVATING_AUTOMATIC_EULA_ACCEPTED';
const STATUS_EULA_ACCEPTED = 'ACTIVATING_AUTOMATIC_EULA_ACCEPTED';
const STATUS_READY = 'READY';
const STATUS_LICENSED = 'LICENSED';

/**
 * Functions that only pertain to BIG-IQ onboarding, not BIG-IP
 *
 * @mixin
 */
const bigIqOnboardMixins = {
    /**
     * Creates a license pool
     *
     * @param {String} name - The name to use for the pool
     * @param {String} regKey - The reg key to use for the pool
     *
     * @returns {Promise} A promise which is resolved when the pool is created and
     *                    all licenses are activated.
     */
    createLicensePool(name, regKey) {
        const INITIAL_ACTIVATION_PATH = '/cm/device/licensing/pool/initial-activation';

        const trimmedRegKey = regKey.trim();

        function waitForLicensed(licenseReference) {
            const path = url.parse(licenseReference.link).path;
            const prefix = '/mgmt';
            return this.core.list(path.substr(prefix.length), null, util.NO_RETRY, { silent: true })
                .then((response) => {
                    // To keep things interesting, this API returns different things
                    // based on the license type.
                    // Purchased pool uses state: LICENSED and utility uses status: READY
                    const status = response.state || response.status;
                    this.logger.silly('license state', status);
                    if (status === STATUS_LICENSED || status === STATUS_READY) {
                        this.logger.silly('pool ready');
                        return q();
                    }
                    return q.reject();
                })
                .catch((err) => {
                    this.logger.debug(
                        'got error waiting for licensed',
                        err && err.message ? err.message : err
                    );
                    return q.reject(err);
                });
        }

        this.logger.silly('creating license pool', name, trimmedRegKey);
        return this.core.create(
            INITIAL_ACTIVATION_PATH,
            {
                name,
                regKey: trimmedRegKey,
                status: STATUS_ACTIVATING_AUTOMATIC
            },
            null,
            null,
            { silent: true } // there is a private key in the response
        )
            .then(() => {
                return doCommonLicensePoolCreation.call(this, INITIAL_ACTIVATION_PATH, [trimmedRegKey]);
            })
            .then((responses) => {
                this.logger.silly('waiting for licensed');
                return util.tryUntil(
                    this,
                    util.DEFAULT_RETRY,
                    waitForLicensed,
                    [responses[0].licenseReference]
                );
            })
            .then(() => {
                this.logger.silly('license pool created');
                q();
            })
            .catch((err) => {
                q.reject(err);
            });
    },

    /**
     * Creates a license pool
     *
     * @param {String}   name       - The name to use for the pool
     * @param {String[]} regKeyList - A list of reg keys to add to the pool
     *
     * @returns {Promise} A promise which is resolved when the pool is created and
     *                    all licenses are activated.
     */
    createRegKeyPool(name, regKeyList) {
        const REG_KEY_POOL_PATH = '/cm/device/licensing/pool/regkey/licenses';
        const trimmedRegKeys = [];

        let pollingPrefix;

        function addRegKeys(regKeys) {
            const promises = [];
            regKeys.forEach((regKey) => {
                promises.push(
                    this.core.create(
                        pollingPrefix,
                        {
                            regKey,
                            description: regKey,
                            status: STATUS_ACTIVATING_AUTOMATIC
                        },
                        null,
                        null,
                        { silent: true }
                    )
                );
            });
            return q.all(promises);
        }

        regKeyList.forEach((regKey) => {
            trimmedRegKeys.push(regKey.trim());
        });

        this.logger.silly('creating reg key pool', name);
        return this.core.create(
            REG_KEY_POOL_PATH,
            {
                name
            }
        )
            .then((response) => {
                const uuid = response.id;
                pollingPrefix = `${REG_KEY_POOL_PATH}/${uuid}/offerings`;
                this.logger.silly('pool created, adding reg keys');
                return addRegKeys.call(this, trimmedRegKeys);
            })
            .then(() => {
                return doCommonLicensePoolCreation.call(this, pollingPrefix, trimmedRegKeys);
            })
            .then(() => {
                this.logger.silly('reg key pool created');
                return q();
            })
            .catch((err) => {
                q.reject(err);
            });
    },

    /**
     * Determines if primary key is already set
     *
     * @returns {Promise} A Promise which is resolved with true or false
     *                    based on whether or not the primary key is set
     */
    isPrimaryKeySet() {
        return this.core.list('/cm/shared/secure-storage/primarykey')
            .then((response) => {
                return q(response.isMkSet);
            });
    },

    /**
     * Sets the passphrase for the primary key (which, in turn, generates a new primary key)
     *
     * @param {String} passphrase - Passphrase for primary key
     *
     * @returns {Promise} A promise which is resolved when the operation is complete
     *                    or rejected if an error occurs.
     */
    setPrimaryPassphrase(passphrase) {
        return this.core.create(
            '/cm/shared/secure-storage/primarykey',
            { passphrase }
        );
    },

    /**
     * Sets the passphrase for the primary key to a random value
     *
     * @returns {Promise} A promise which is resolved when the operation is complete
     *                    or rejected if an error occurs.
     */
    setRandomPrimaryPassphrase() {
        // get random bytes of minimum length
        return cryptoUtil.generateRandomBytes(MIN_PASSPHRASE_LENGTH, 'base64')
            .then((data) => {
                let passphrase = data;

                // make sure there is at least one special char, number, lower case, and upper case
                const index = cryptoUtil.generateRandomIntInRange(0, SPECIALS.length - 1);
                passphrase += SPECIALS[index];

                let asciiCode = cryptoUtil.generateRandomIntInRange(ASCII_NUMBER_LOW, ASCII_NUMBER_HIGH);
                passphrase += String.fromCharCode(asciiCode);

                asciiCode = cryptoUtil.generateRandomIntInRange(ASCII_LOWER_CASE_LOW, ASCII_LOWER_CASE_HIGH);
                passphrase += String.fromCharCode(asciiCode);

                asciiCode = cryptoUtil.generateRandomIntInRange(ASCII_UPPER_CASE_LOW, ASCII_UPPER_CASE_HIGH);
                passphrase += String.fromCharCode(asciiCode);

                return this.setPrimaryPassphrase(passphrase);
            });
    }
};

function pollRegKeys(pollingPath, regKeys) {
    const promises = [];

    regKeys.forEach((regKey) => {
        promises.push(
            this.core.list(`${pollingPath}/${regKey}`, null, null, { silent: true })
        );
    });

    return q.all(promises);
}

function waitForEulas(pollingPath, regKeys) {
    const eulas = [];

    return pollRegKeys.call(this, pollingPath, regKeys)
        .then((responses) => {
            for (let i = 0; i < responses.length; i++) {
                this.logger.silly('current status', regKeys[i], responses[i].status);
                if (responses[i].status === STATUS_NEEDS_EULA) {
                    this.logger.silly('got eula for', regKeys[i]);
                    eulas.push(
                        {
                            regKey: regKeys[i],
                            eulaText: responses[i].eulaText
                        }
                    );
                } else {
                    this.logger.silly('still waiting for eula for', regKeys[i]);
                    return q.reject();
                }
            }
            return q(eulas);
        })
        .catch((err) => {
            this.logger.debug('still waiting for eulas', err && err.message ? err.message : err);
            return q.reject(err);
        });
}

function waitForEulasAccepted(pollingPath, regKeys) {
    return pollRegKeys.call(this, pollingPath, regKeys)
        .then((responses) => {
            for (let i = 0; i < responses.length; i++) {
                this.logger.silly('current status', regKeys[i], responses[i].status);
                if (responses[i].status === STATUS_EULA_ACCEPTED) {
                    this.logger.silly('eula accepted for', regKeys[i]);
                } else {
                    this.logger.silly('eula not yet accepted for', regKeys[i]);
                    return q.reject();
                }
            }
            return q(responses);
        })
        .catch((err) => {
            this.logger.debug('not all eulas accepted', err && err.message ? err.message : err);
            return q.reject(err);
        });
}

function waitForLicensesReady(pollingPath, regKeys) {
    return pollRegKeys.call(this, pollingPath, regKeys)
        .then((responses) => {
            for (let i = 0; i < responses.length; i++) {
                this.logger.silly('current status', regKeys[i], responses[i].status);

                if (responses[i].status === STATUS_READY) {
                    this.logger.silly('license ready', regKeys[i]);
                } else {
                    this.logger.silly('license not yet ready for', regKeys[i]);
                    return q.reject();
                }
            }
            return q(responses);
        })
        .catch((err) => {
            this.logger.debug(
                'not all licenses are ready',
                err && err.message ? err.message : err
            );
            return q.reject(err);
        });
}

function doCommonLicensePoolCreation(pollingPath, regKeys) {
    this.logger.silly('waiting for eulas');
    return util.tryUntil(
        this,
        util.QUICK_BUT_LONG_RETRY,
        waitForEulas,
        [pollingPath, regKeys]
    )
        .then((responses) => {
            this.logger.silly('accepting eulas');
            const promises = [];
            responses.forEach((response) => {
                promises.push(
                    this.core.modify(
                        `${pollingPath}/${response.regKey}`,
                        {
                            status: STATUS_ACCEPT_EULA,
                            eulaText: response.eulaText
                        },
                        null,
                        null,
                        { silent: true }
                    )
                );
            });
            return q.all(promises);
        })
        .then(() => {
            this.logger.silly('waiting for eulas accepted');
            return util.tryUntil(
                this,
                util.QUICK_BUT_LONG_RETRY,
                waitForEulasAccepted,
                [pollingPath, regKeys]
            );
        })
        .then(() => {
            this.logger.silly('waiting for licenses ready');
            return util.tryUntil(
                this,
                util.DEFAULT_RETRY,
                waitForLicensesReady,
                [pollingPath, regKeys]
            );
        });
}

module.exports = bigIqOnboardMixins;
