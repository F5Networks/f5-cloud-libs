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

/* eslint-disable no-console */

const q = require('q');
const CloudProvider = require('../../lib/cloudProvider');
const BACKUP = require('../../lib/sharedConstants').BACKUP;
const util = require('util');

let argv;
let setMasterKey;
let BigIp;
let bigIpMock;
let fsMock;
let cloudUtilMock;
let icontrolMock;
let providerMock;
let cloudProviderFactoryMock;
let existsSync;
let mkdirSync;
let writeFile;
let testOptions;

util.inherits(ProviderMock, CloudProvider);
function ProviderMock() {
    ProviderMock.super_.call(this);
    this.functionCalls = {};
}

ProviderMock.prototype.init = function init() {
    this.functionCalls.init = arguments;
    return q();
};

ProviderMock.prototype.getStoredUcs = function getStoredUcs() {
    return q(true);
};


module.exports = {
    setUp(callback) {
        console.log = function log() {
        };
        /* eslint-disable global-require */
        setMasterKey = require('../../scripts/setMasterKey');
        BigIp = require('../../lib/bigIp');
        icontrolMock = require('../testUtil/icontrolMock');
        cloudProviderFactoryMock = require('../../lib/cloudProviderFactory');
        fsMock = require('fs');
        icontrolMock.when(
            'list',
            '/shared/identified-devices/config/device-info',
            {
                product: 'BIG-IP'
            }
        );
        cloudUtilMock = require('../../lib/util');
        cloudUtilMock.callInSerial = () => {
            return q();
        };
        providerMock = new ProviderMock();
        cloudProviderFactoryMock.getCloudProvider = () => {
            return providerMock;
        };
        bigIpMock = new BigIp();
        bigIpMock.ready = () => {
            return q();
        };
        bigIpMock.init('localhost', 'admin', 'admin')
            .then(() => {
                bigIpMock.icontrol = icontrolMock;

                icontrolMock.reset();

                testOptions = {
                    bigIp: bigIpMock,
                    cloudProvider: providerMock
                };

                bigIpMock.ready = () => {
                    return q();
                };
                callback();
            });
        existsSync = fsMock.existsSync;
        mkdirSync = fsMock.mkdirSync;
        writeFile = fsMock.wrwriteFile;
        argv = ['node', 'setMasterKey', '--log-level', 'none'];
    },

    tearDown(callback) {
        fsMock.existsSync = existsSync;
        fsMock.mkdirSync = mkdirSync;
        fsMock.writeFile = writeFile;
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },
    normalExecuteCase(test) {
        const validationResults = {};
        argv.push(
            '--cloud',
            'aws',
            '--provider-options',
            's3Bucket:s3-bucket-name,' +
            's3-bucket-name'
        );
        validationResults.cloudUtilMock = {};
        validationResults.cloudUtilMock.callInSerial = [];
        cloudUtilMock.callInSerial = () => {
            validationResults.cloudUtilMock.callInSerial.push(1);
            return q();
        };

        cloudUtilMock.tryUntil = () => {
            return q();
        };

        validationResults.cloudUtilMock.runShellCommand = [];
        cloudUtilMock.runShellCommand = (command) => {
            validationResults.cloudUtilMock.runShellCommand.push(command);
            return q();
        };
        validationResults.cloudUtilMock.readDataFromFile = [];
        cloudUtilMock.readDataFromFile = (fileName) => {
            validationResults.cloudUtilMock.readDataFromFile.push(fileName);
            return q();
        };
        validationResults.cloudUtilMock.writeDataToFile = [];
        cloudUtilMock.writeDataToFile = (data, fileName) => {
            validationResults.cloudUtilMock.writeDataToFile.push({ d: data, f: fileName });
            return q();
        };
        validationResults.fsMock = {};
        validationResults.fsMock.existsSync = [];
        fsMock.existsSync = (dirName) => {
            validationResults.fsMock.existsSync.push(dirName);
            return true;
        };
        validationResults.fsMock.mkdirSync = [];
        fsMock.mkdirSync = (dirName) => {
            validationResults.fsMock.mkdirSync.push(dirName);
        };
        validationResults.fsMock.writeFile = [];
        fsMock.writeFile = (ucsFilePath, ucsData, cb) => {
            validationResults.fsMock.writeFile.push({ p: ucsFilePath, d: ucsData });
            cb();
        };
        bigIpMock.ready = () => {
            return q();
        };
        test.expect(11);
        setMasterKey.run(argv, testOptions, () => {})
            .then(() => {
                test.strictEqual(
                    validationResults.cloudUtilMock.readDataFromFile[0],
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsContent${BACKUP.MASTER_KEY_DIR}`
                );
                test.strictEqual(validationResults.cloudUtilMock.readDataFromFile[1],
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsContent${BACKUP.UNIT_KEY_DIR}`);
                test.strictEqual(validationResults.cloudUtilMock.runShellCommand[0],
                    'bigstart stop');
                test.strictEqual(validationResults.cloudUtilMock.runShellCommand[1],
                    `tar --warning=no-timestamp -xf ${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/temp.ucs ` +
                    `-C ${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsContent/`);
                test.strictEqual(validationResults.cloudUtilMock.runShellCommand[2], 'bigstart start');
                test.strictEqual(validationResults.cloudUtilMock.runShellCommand[3],
                    'bigstart restart dhclient');
                test.strictEqual(validationResults.fsMock.existsSync[0],
                    '/var/log/cloudlibs');
                test.strictEqual(validationResults.fsMock.mkdirSync[0],
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}`);
                test.strictEqual(validationResults.fsMock.mkdirSync[1],
                    '/shared/tmp/ucs/ucsContent/');
                test.strictEqual(validationResults.fsMock.writeFile[0].p,
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/temp.ucs`);
                test.strictEqual(true, true);
                test.done();
            });
    }
};
