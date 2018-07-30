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
const q = require('q');

const MIN_PASSPHRASE_LENGTH = 16;
const SPECIALS = ['!', '"', '#', '$', '%', '&', '(', ')', '*', '+', '-', '.', '/', '?', '^', '<', '>', '-'];
const ASCII_UPPER_CASE_LOW = 65;
const ASCII_UPPER_CASE_HIGH = 90;
const ASCII_LOWER_CASE_LOW = 97;
const ASCII_LOWER_CASE_HIGH = 122;
const ASCII_NUMBER_LOW = 48;
const ASCII_NUMBER_HIGH = 57;

/**
 * Functions that only pertain to BIG-IQ onboarding, not BIG-IP
 *
 * @mixin
 */
const bigIqOnboardMixins = {
    /**
     * Determines if master key is already set
     *
     * @returns {Promise} A Promise which is resolved with true or false
     *                    based on whether or not the master key is set
     */
    isMasterKeySet() {
        return this.core.list('/cm/shared/secure-storage/masterkey')
            .then((response) => {
                return q(response.isMkSet);
            });
    },

    /**
     * Sets the passphrase for the master key (which, in turn, generates a new master key)
     *
     * @param {String} passphrase - Passphrase for master key
     *
     * @returns {Promise} A promise which is resolved when the operation is complete
     *                    or rejected if an error occurs.
     */
    setMasterPassphrase(passphrase) {
        return this.core.create(
            '/cm/shared/secure-storage/masterkey',
            { passphrase }
        );
    },

    /**
     * Sets the passphrase for the master key to a random value
     *
     * @returns {Promise} A promise which is resolved when the operation is complete
     *                    or rejected if an error occurs.
     */
    setRandomMasterPassphrase() {
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

                return this.setMasterPassphrase(passphrase);
            });
    }
};

module.exports = bigIqOnboardMixins;
