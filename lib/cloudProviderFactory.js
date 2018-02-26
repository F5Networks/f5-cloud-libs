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

module.exports = {
    /**
     * Creates a cloud provider for the given name
     *
     * @param {String} name                    - Name of the provider
     * @param {Ojbect} [options]               - Options for the instance.
     * @param {Object} [options.clOptions]     - Command line options if called from a script.
     * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
     * @param {Object} [options.loggerOptions] - Options for the logger.
     *                                           See {@link module:logger.getLogger} for details.
     */
    getCloudProvider(name, options) {
        // eslint-disable-next-line global-require
        const ProviderImplementation = require(`../../f5-cloud-libs-${name}`).provider;

        if (ProviderImplementation) {
            return new ProviderImplementation(options);
        }

        throw new Error('Unsupported cloud provider');
    }
};
