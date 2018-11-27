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

const LOCAL_PUBLIC_KEY_DIR = '/config/cloud/keys/';

/**
 * Constants used across two or more files
 *
 * @module
 */
module.exports = {
    /** @constant */
    KEYS: {
        LOCAL_PUBLIC_KEY_DIR,
        LOCAL_PUBLIC_KEY_PATH: `${LOCAL_PUBLIC_KEY_DIR}cloudLocalPublic.pub`,
        LOCAL_PRIVATE_KEY: 'cloudLibsLocalPrivate',
        LOCAL_PRIVATE_KEY_FOLDER: 'CloudLibsLocal'
    },
    /** @constant */
    PRODUCTS: {
        BIGIP: 'BIG-IP',
        BIGIQ: 'BIG-IQ'
    },
    /** @constant */
    REG_EXPS: {
        UUID: new RegExp(/^[A-F\d]{8}-[A-F\d]{4}-4[A-F\d]{3}-[89AB][A-F\d]{3}-[A-F\d]{12}$/i)
    },
    /** @constant */
    LICENSE_API_TYPES: {
        REG_KEY: 'REG_KEY',
        UTILITY: 'UTILITY',
        UNREACHABLE: 'UNREACHABLE'
    }
};
