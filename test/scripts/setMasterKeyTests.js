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
const assert = require('assert');
const CloudProvider = require('../../lib/cloudProvider');
const BACKUP = require('../../lib/sharedConstants').BACKUP;
const util = require('util');

describe('set master key tests', () => {
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

    beforeEach((done) => {
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
                done();
            });
        existsSync = fsMock.existsSync;
        mkdirSync = fsMock.mkdirSync;
        writeFile = fsMock.wrwriteFile;
        argv = ['node', 'setMasterKey', '--log-level', 'none'];
    });

    afterEach(() => {
        fsMock.existsSync = existsSync;
        fsMock.mkdirSync = mkdirSync;
        fsMock.writeFile = writeFile;
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    it('normal execute test', (done) => {
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
        setMasterKey.run(argv, testOptions, () => {})
            .then(() => {
                assert.strictEqual(
                    validationResults.cloudUtilMock.readDataFromFile[0],
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsContent${BACKUP.PRIMARY_KEY_DIR}`
                );
                assert.strictEqual(validationResults.cloudUtilMock.readDataFromFile[1],
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsContent${BACKUP.UNIT_KEY_DIR}`);
                assert.strictEqual(validationResults.cloudUtilMock.runShellCommand[0],
                    'bigstart stop');
                assert.strictEqual(validationResults.cloudUtilMock.runShellCommand[1],
                    `tar --warning=no-timestamp -xf ${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/temp.ucs ` +
                    `-C ${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/ucsContent/`);
                assert.strictEqual(validationResults.cloudUtilMock.runShellCommand[2], 'bigstart start');
                assert.strictEqual(validationResults.cloudUtilMock.runShellCommand[3],
                    'bigstart restart dhclient');
                assert.strictEqual(validationResults.fsMock.existsSync[0],
                    '/var/log/cloudlibs');
                assert.strictEqual(validationResults.fsMock.mkdirSync[0],
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}`);
                assert.strictEqual(validationResults.fsMock.mkdirSync[1],
                    '/shared/tmp/ucs/ucsContent/');
                assert.strictEqual(validationResults.fsMock.writeFile[0].p,
                    `${BACKUP.UCS_LOCAL_TMP_DIRECTORY}/temp.ucs`);
                assert.strictEqual(true, true);
                done();
            });
    });
});
