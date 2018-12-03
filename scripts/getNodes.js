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

/* This is a replacement for the cloud nodes worker. Once we started encrypting
   credentials with private keys, that worker failed because resnoded has
   no priveledges to read the private keys */

const q = require('q');
const options = require('commander');
const path = require('path');
const fs = require('fs');

const LOG_ID = 'getNodes.js';

const util = require('../lib/util');
const localCryptoUtil = require('../lib/localCryptoUtil');
const cloudProviderFactory = require('../lib/cloudProviderFactory');
const Logger = require('../lib/logger');

(function run() {
    const runner = {
        run(argv, testOpts, cb) {
            const DEFAULT_LOG_FILE = '/var/log/cloudlibs/getNodes.log';
            const REQUIRED_OPTIONS = ['cloud', 'memberAddressType'];
            const REQUIRED_UNIQUE_OPTIONS = [['memberTag', 'uri']];
            const KEYS_TO_MASK = ['--provider-options'];

            const providerOptions = {};
            const loggerOptions = {};
            const optionsForTest = {};

            let provider;
            let loggableArgs;

            Object.assign(optionsForTest, testOpts);

            try {
                /* eslint-disable max-len */
                options
                    .version('4.6.0-beta.4')
                    .option(
                        '--cloud <cloud_provider>',
                        'Cloud provider (aws | azure | etc.)'
                    )
                    .option(
                        '--member-address-type <public | private>',
                        'Type of ip address to look for - public or private.'
                    )
                    .option(
                        '--member-tag <member_tag>',
                        'Tag that is on the members in the cloud provider. Ex: value, or key=value'
                    )
                    .option(
                        '--provider-options <cloud_options>',
                        'Options specific to cloud_provider. Ex: param1:value1,param2:value2',
                        util.map,
                        providerOptions
                    )
                    .option(
                        '--uri <uri>',
                        'Location of JSON data containing nodes.'
                    )
                    .option(
                        '--log-level <level>',
                        'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info'
                    )
                    .option(
                        '-o, --output <file>',
                        `Log to file. Default is ${DEFAULT_LOG_FILE}`, DEFAULT_LOG_FILE
                    )
                    .option(
                        'console',
                        'Log to console. Default false (log to file only).'
                    )
                    .parse(argv);
                /* eslint-enable max-len */

                loggerOptions.console = options.console;
                loggerOptions.logLevel = options.logLevel;
                loggerOptions.fileName = options.output;
                loggerOptions.module = module;

                if (loggerOptions.fileName) {
                    const dirName = path.dirname(loggerOptions.fileName);
                    if (!fs.existsSync(dirName)) {
                        fs.mkdirSync(dirName);
                    }
                }

                this.logger = Logger.getLogger(loggerOptions);
                util.setLoggerOptions(loggerOptions);
                localCryptoUtil.setLoggerOptions(loggerOptions);

                // Log the input, but don't log passwords
                loggableArgs = argv.slice();
                for (let i = 0; i < loggableArgs.length; i++) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = '*******';
                    }
                }
                this.logger.info(LOG_ID, `${loggableArgs[1]} called with`, loggableArgs.join(' '));

                for (let i = 0; i < REQUIRED_OPTIONS.length; i++) {
                    if (!options[REQUIRED_OPTIONS[i]]) {
                        util.logAndExit(
                            `${REQUIRED_OPTIONS[i]} is a required command line option.`,
                            'error',
                            1
                        );
                        return;
                    }
                }

                for (let i = 0; i < REQUIRED_UNIQUE_OPTIONS.length; i++) {
                    const foundOpts = Object.keys(options).filter((opt) => {
                        return REQUIRED_UNIQUE_OPTIONS[i].indexOf(opt) > -1;
                    });
                    if (foundOpts.length !== 1) {
                        const opts = (foundOpts.length > 0 ? foundOpts : REQUIRED_UNIQUE_OPTIONS[i]);
                        util.logAndExit(
                            `Must include ${foundOpts.length > 1 ? 'only ' : ''}one of the `
                            + `following command line options: ${opts.join(', ')}`,
                            'error',
                            1
                        );
                        return;
                    }
                }

                provider = optionsForTest.cloudProvider;
                if (!provider) {
                    provider = cloudProviderFactory.getCloudProvider(
                        options.cloud,
                        {
                            loggerOptions,
                            clOptions: options
                        }
                    );
                }

                let credentialsPromise;
                if (providerOptions.secretData) {
                    credentialsPromise = localCryptoUtil.decryptData(
                        providerOptions.secretData,
                        providerOptions.secretPrivateKeyFolder,
                        providerOptions.secretPrivateKeyName,
                        {
                            encryptedKey: providerOptions.secretKey,
                            iv: providerOptions.secretIv
                        }
                    );
                } else {
                    credentialsPromise = q();
                }

                credentialsPromise
                    .then((credentials) => {
                        if (credentials) {
                            providerOptions.secret = credentials;
                        }
                        this.logger.info(LOG_ID, 'Initializing cloud provider');
                        return provider.init(providerOptions);
                    })
                    .then(() => {
                        const promises = [];
                        if (options.memberTag) {
                            this.logger.debug(LOG_ID, 'Getting NICs');

                            const keyValue = options.memberTag.split('=');
                            let key;
                            let value;

                            if (keyValue.length > 1) {
                                key = keyValue[0];
                                value = keyValue[1];
                            } else {
                                value = keyValue[0];
                            }

                            this.logger.silly(LOG_ID, 'key', key);
                            this.logger.silly(LOG_ID, 'value', value);

                            promises.push(provider.getNicsByTag({ key, value }));
                            promises.push(provider.getVmsByTag({ key, value }));
                        } else if (options.uri) {
                            this.logger.debug(LOG_ID, 'Getting Nodes');

                            this.logger.silly(LOG_ID, 'URI', options.uri);

                            promises.push(provider.getNodesFromUri(options.uri));
                        }

                        return Promise.all(promises);
                    })
                    .then((responses) => {
                        let nodes = [];
                        const nics = responses[0] || [];
                        const vms = responses[1] || [];

                        if (options.memberTag) {
                            this.logger.silly(LOG_ID, 'nics', JSON.stringify(nics));
                            this.logger.silly(LOG_ID, 'vms', JSON.stringify(vms));
                        } else if (options.uri) {
                            this.logger.silly(LOG_ID, 'uri nodes', JSON.stringify(nics));
                        }

                        nodes = nics.reduce((result, nic) => {
                            const node = getNode(nic);
                            if (node) {
                                result.push(node);
                            }
                            return result;
                        }, []);

                        if (options.memberTag && nodes.length === 0) {
                            this.logger.debug(LOG_ID, 'no valid nics found, trying vms');
                            nodes = vms.reduce((result, vm) => {
                                const node = getNode(vm);
                                if (node) {
                                    result.push(node);
                                }
                                return result;
                            }, []);
                        }

                        if (nodes.length === 0) {
                            this.logger.debug(LOG_ID, 'no valid pool nodes found');
                        }

                        console.log(JSON.stringify(nodes)); // eslint-disable-line no-console
                    })
                    .catch((err) => {
                        if (err && err.code && err.message) {
                            this.logger.error(LOG_ID, 'error code:', err.code, 'message:', err.message);
                        } else {
                            this.logger.error(LOG_ID, 'error:', err && err.message ? err.message : err);
                        }
                        return err;
                    })
                    .done((err) => {
                        if (cb) {
                            cb(err);
                        }

                        // Exit so that any listeners don't keep us alive
                        util.logAndExit('getNodes finished.');
                    });
            } catch (err) {
                if (this.logger) {
                    this.logger.error(LOG_ID, 'error:', err && err.message ? err.message : err);
                }

                if (cb) {
                    cb();
                }
            }
        }
    };

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());


function getNode(owner) {
    const ip = options.memberAddressType.toLowerCase() === 'public' ? owner.ip.public : owner.ip.private;
    if (ip) {
        return {
            ip,
            id: `${owner.id}-${options.memberAddressType.toLowerCase()}`,
        };
    }
    return '';
}
