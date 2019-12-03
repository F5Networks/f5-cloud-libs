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

/* eslint-disable no-console */

const q = require('q');
const options = require('commander');
const fs = require('fs');
const util = require('../lib/util');
const path = require('path');
const BigIp = require('../lib/bigIp');

const LOG_ID = 'setMasterKey.js';
const Logger = require('../lib/logger');
const cloudProviderFactory = require('../lib/cloudProviderFactory');
const BACKUP = require('../lib/sharedConstants').BACKUP;


(function run() {
    let logger;
    let bigIp;
    const runner = {
        run(argv) {
            const providerOptions = {};
            const loggerOptions = {};
            const tempUcsDir = `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/`;
            const DEFAULT_LOG_FILE = '/var/log/cloudlibs/setMasterKey.log';
            const MASTER_KEY_DIR = BACKUP.MASTER_KEY_DIR;
            const UNIT_KEY_DIR = BACKUP.UNIT_KEY_DIR;
            let cloudProvider;
            options
                .version('4.10.3')
                .option(
                    '--hostname <username>',
                    'Hostname for BIGIP device',
                    'localhost'
                )
                .option(
                    '--username <username>',
                    'Username to access BIGIP device',
                    'admin'
                )
                .option(
                    '--password <password>',
                    'Password to access BIGIP device',
                    'admin'
                )
                .option(
                    '--mgmtPort <port>',
                    'Managment port on BIGIP device',
                    '8443'
                )
                .option(
                    '--cloud <cloud_provider>',
                    'Cloud provider (aws | azure | etc.)'
                )
                .option(
                    '--provider-options <cloud_options>',
                    'Options specific to cloud_provider. Ex: param1:value1,param2:value2',
                    util.map,
                    providerOptions
                )
                .option(
                    '--log-level <level>',
                    'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info'
                )
                .option(
                    '-o, --output <file>',
                    `Log to file. Default is ${DEFAULT_LOG_FILE}`, DEFAULT_LOG_FILE
                )
                .parse(argv);

            /* eslint-enable max-len */
            loggerOptions.console = true;
            loggerOptions.logLevel = options.logLevel;
            loggerOptions.fileName = options.output;
            loggerOptions.module = module;
            if (loggerOptions.fileName) {
                const dirName = path.dirname(loggerOptions.fileName);
                if (!fs.existsSync(dirName)) {
                    fs.mkdirSync(dirName);
                }
            }
            logger = Logger.getLogger(loggerOptions);
            bigIp = new BigIp({ loggerOptions });
            util.setLoggerOptions(loggerOptions);
            logger.silly(LOG_ID, `Options: ${JSON.stringify(options)}`);
            logger.silly(LOG_ID, `Provider Options: ${JSON.stringify(providerOptions)}`);
            logger.info(LOG_ID, 'Starting setting master key....');
            return bigIp.init(
                options.hostname,
                options.username,
                options.password,
                {
                    port: options.mgmtPort
                }
            )
                .then(() => {
                    logger.info(LOG_ID, `Cloud Provider ${options.cloud}`);
                    cloudProvider = cloudProviderFactory.getCloudProvider(
                        options.cloud,
                        {
                            loggerOptions,
                            clOptions: options
                        }
                    );
                    logger.info(LOG_ID, 'Initializing cloud provider');
                    return util.tryUntil(
                        cloudProvider,
                        util.MEDIUM_RETRY,
                        cloudProvider.init,
                        [providerOptions]
                    );
                })
                .then(() => {
                    logger.silly(LOG_ID, `provider is configured for ${options.cloud} cloud`);
                    logger.silly(LOG_ID, 'Grabbing ucs from cloud storage');
                    return cloudProvider.getStoredUcs();
                })
                .then((ucsData) => {
                    if (ucsData) {
                        return util.writeUcsFile(`${tempUcsDir}temp.ucs`, ucsData);
                    }
                    return q.resolve(false);
                })
                .then((response) => {
                    if (!response) {
                        util.logAndExit('no ucs file available - skipping step for setting master key');
                        return Promise.reject(new Error('no ucs file available'));
                    }
                    logger.silly('stopping bigip to set master key');
                    return util.runShellCommand('bigstart stop');
                })
                .then(() => {
                    logger.silly(LOG_ID, 'bigstart stopped. untarring ucs');
                    fs.mkdirSync(`${tempUcsDir}ucsContent/`);
                    return util.runShellCommand(
                        `tar --warning=no-timestamp -xf ${tempUcsDir}temp.ucs -C ${tempUcsDir}ucsContent/`
                    );
                })
                .then(() => {
                    logger.silly(LOG_ID, 'untar success, reading key');
                    return util.readDataFromFile(`${tempUcsDir}ucsContent${MASTER_KEY_DIR}`);
                })
                .then((oldMasterKey) => {
                    logger.silly(LOG_ID, 'read success, writing key');
                    return util.writeDataToFile(oldMasterKey, MASTER_KEY_DIR);
                })
                .then(() => {
                    logger.silly(LOG_ID, 'wrote master key, reading unit key');
                    return util.readDataFromFile(`${tempUcsDir}ucsContent${UNIT_KEY_DIR}`);
                })
                .then((oldUnitKey) => {
                    logger.silly(LOG_ID, 'read unitkey success, writing unit key');
                    return util.writeDataToFile(oldUnitKey, UNIT_KEY_DIR);
                })
                .then(() => {
                    logger.silly(LOG_ID, 'wrote master key; calling bigstart restart');
                    return util.runShellCommand('bigstart start');
                })
                .then(() => {
                    return bigIp.ready();
                })
                .then(() => {
                    logger.info(LOG_ID, 'Master Key is configured; ' +
                        'Restarting dhclient to set mgmt ip address');
                    return util.runShellCommand('bigstart restart dhclient');
                })
                .then(() => {
                    return util.tryUntil(this, util.MEDIUM_RETRY, () => {
                        return util.runShellCommand('tmsh list sys management-ip')
                            .then((response) => {
                                logger.silly(`Response for Managemetn Ip: ${response}`);
                                if (response) {
                                    return Promise.resolve();
                                }
                                return Promise.reject(new Error('management ip is not configured on device'));
                            });
                    }, {});
                })
                .catch((err) => {
                    if (err.message === 'no ucs file available') {
                        process.exit(0);
                    }
                    logger.error(err.message);
                })
                .finally(() => {
                    if (fs.existsSync(tempUcsDir)) {
                        logger.silly(LOG_ID, 'cleaning up working directory');
                        return util.runShellCommand(`rm -rf ${tempUcsDir}`);
                    }
                    return Promise.resolve();
                });
        }
    };

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
