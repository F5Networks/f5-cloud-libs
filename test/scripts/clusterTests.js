/**
 * Copyright 2017 F5 Networks, Inc.
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

const q = require('q');
const signals = require('../../lib/signals');
const util = require('util');
const CloudProvider = require('../../lib/cloudProvider');

let fsMock;
let ipcMock;
let utilMock;
let localCryptoUtilMock;
let argv;
let cluster;
let realWriteFile;
let realReadFile;

let bigIpMock;
let providerMock;

const testOptions = {};

let functionsCalled;
let sentSignals;

let exitMessage;
let exitCode;

util.inherits(ProviderMock, CloudProvider);
function ProviderMock() {
    ProviderMock.super_.call(this);
    this.functionCalls = {};
}

ProviderMock.prototype.init = function init() {
    this.functionCalls.init = arguments;
    return q();
};

ProviderMock.prototype.bigIpReady = function bigIpReady() {
    this.functionCalls.bigIpReady = arguments;
    return q();
};

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        fsMock = require('fs');
        utilMock = require('../../lib/util');
        ipcMock = require('../../lib/ipc');
        localCryptoUtilMock = require('../../lib/localCryptoUtil');

        utilMock.logAndExit = (message, level, code) => {
            exitMessage = message;
            exitCode = code;
        };
        utilMock.logError = () => { };
        utilMock.saveArgs = function saveArgs() {
            return q();
        };

        sentSignals = [];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            functionsCalled.ipc.once.push(signal);
            setInterval(() => {
                if (sentSignals.indexOf(signal) > -1) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };

        bigIpMock = {
            init() {
                functionsCalled.bigIp.init = arguments;
                return q();
            },

            isBigIp() {
                return true;
            },

            isBigIq() {
                return false;
            },

            list() {
                functionsCalled.bigIp.list = arguments;
                return q();
            },

            modify() {
                functionsCalled.bigIp.modify = arguments;
                return q();
            },

            create() {
                functionsCalled.bigIp.create = arguments;
                return q();
            },

            delete() {
                functionsCalled.bigIp.delete = arguments;
                return q();
            },

            ready() {
                functionsCalled.bigIp.ready = arguments;
                return q();
            },

            save() {
                functionsCalled.bigIp.save = arguments;
                return q();
            },

            active() {
                functionsCalled.bigIp.active = arguments;
                return q();
            },

            ping() {
                functionsCalled.bigIp.ping = arguments;
                return q();
            },

            rebootRequired() {
                functionsCalled.bigIp.rebootRequired = arguments;
                return q(false);
            },

            reboot() {
                functionsCalled.bigIp.reboot = arguments;
                return q();
            },
            onboard: {
                setRootPassword() {
                    functionsCalled.bigIp.onboard.setRootPassword = arguments;
                    return q();
                }
            },
            cluster: {
                addSecondary() {
                    functionsCalled.bigIp.cluster.addSecondary = Array.from(arguments);
                    return q();
                }
            }
        };

        testOptions.bigIp = bigIpMock;

        realWriteFile = fsMock.writeFile;
        fsMock.writeFile = (file, data, options, cb) => {
            cb();
        };

        functionsCalled = {
            ipc: {
                once: []
            },
            bigIp: {
                onboard: {},
                cluster: {
                    addSecondary: []
                }
            },
            utilMock: {},
            localCryptoUtilMock: {}
        };

        cluster = require('../../scripts/cluster');
        argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', 'file:///password',
            '-u', 'user', '--host', 'localhost', '--output', 'cluster.log'];

        callback();
    },

    tearDown(callback) {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        fsMock.readFile = realReadFile;
        fsMock.writeFile = realWriteFile;

        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },

    testUndefinedOptions: {
        testNoPassword(test) {
            const passwordUrl = 'https://password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', passwordUrl,
                '-u', 'user', '--password', '--host', 'localhost', '--output', 'cluster.log'];

            cluster.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(cluster.options.passwordUrl, passwordUrl);
                test.strictEqual(cluster.options.password, undefined);
                test.done();
            });
        },

        testNoPasswordUrl(test) {
            const password = 'password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', '-u', 'user',
                '--password', password, '--host', 'localhost', '--output', 'cluster.log'];

            cluster.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(cluster.options.passwordUrl, undefined);
                test.strictEqual(cluster.options.password, password);
                test.done();
            });
        },

        testNoRemotePassword(test) {
            const remotePasswordUrl = 'https://password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password', 'password',
                '-u', 'user', '--password', '--host', 'localhost', '--output', 'cluster.log',
                '--remote-password-url', remotePasswordUrl, '--remote-password'];

            cluster.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(cluster.options.remotePasswordUrl, remotePasswordUrl);
                test.strictEqual(cluster.options.remotePassword, undefined);
                test.done();
            });
        },

        testNoRemotePasswordUrl(test) {
            const remotePassword = 'password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', '-u', 'user',
                '--password', 'password', '--host', 'localhost', '--output', 'cluster.log',
                '--remote-password-url', '--remote-password', remotePassword];

            cluster.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(cluster.options.remotePasswordUrl, undefined);
                test.strictEqual(cluster.options.remotePassword, remotePassword);
                test.done();
            });
        }
    },

    testWaitFor(test) {
        argv.push('--wait-for', 'foo');
        ipcMock.send('foo');

        test.expect(2);
        cluster.run(argv, testOptions, () => {
            test.deepEqual(sentSignals, ['foo', signals.CLUSTER_RUNNING, signals.CLUSTER_DONE]);
            test.notStrictEqual(functionsCalled.ipc.once.indexOf('foo'), -1);
            test.done();
        });
    },

    testExceptionSignalsError(test) {
        bigIpMock.ready = () => {
            return q.reject('err');
        };

        argv.push('--wait-for', 'foo');
        ipcMock.send('foo');

        test.expect(2);
        cluster.run(argv, testOptions, () => {
            test.notStrictEqual(sentSignals.indexOf(signals.CLOUD_LIBS_ERROR), -1);
            test.strictEqual(sentSignals.indexOf(signals.CLUSTER_DONE), -1);
            test.done();
        });
    },

    testBigIqPrimaryRequiredOptions: {
        testNoRootPasswordURI(test) {
            argv.push('--master', '--big-iq-failover-peer-ip', '1.2.3.4');

            test.expect(2);
            cluster.run(argv, testOptions, () => {
                test.notStrictEqual(exitMessage.indexOf('--big-iq-password-data-uri'), -1);
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testBigIqCluster: {
        setUp(callback) {
            utilMock.readData = () => {
                return q(JSON.stringify(
                    {
                        rOOt: 'rootPassword',
                        admin: 'adminpass'
                    }
                ));
            };
            providerMock = new ProviderMock();
            testOptions.cloudProvider = providerMock;
            testOptions.bigIp.isBigIq = function isBigIq() {
                return true;
            };

            argv = ['node', 'cluster.js', '--log-level', 'none', '--host', 'localhost', '-u', 'admin',
                '--output', 'cluster.log', '--cloud', 'aws', '--big-iq-password-data-uri',
                'arn:::foo:bar/password', '--master', '--big-iq-failover-peer-ip', '1.2.3.4'];

            callback();
        },

        testBigIpClusterAddSeconaryCalled(test) {
            testOptions.bigIp.password = 'adminpass';
            test.expect(1);
            cluster.run(argv, testOptions, () => {
                test.deepEqual(
                    functionsCalled.bigIp.cluster.addSecondary,
                    ['1.2.3.4', 'admin', 'adminpass', 'rootPassword']
                );
                test.done();
            });
        },

        testBigIqPasswordDecrypted(test) {
            const encryptedData = 'dke9cxk';

            utilMock.readData = function decryptPassword() {
                functionsCalled.utilMock.readData = arguments;
                return q(encryptedData);
            };

            localCryptoUtilMock.decryptPassword = function decryptPassword() {
                functionsCalled.localCryptoUtilMock.decryptPassword = arguments;
                return q(JSON.stringify(
                    {
                        masterPassphrase: 'keykeykey',
                        root: 'rootpazz',
                        admin: 'AdPass'
                    }
                ));
            };

            argv.push('--big-iq-password-data-encrypted');
            test.expect(2);
            cluster.run(argv, testOptions, () => {
                test.deepEqual(functionsCalled.localCryptoUtilMock.decryptPassword[0], encryptedData);
                test.strictEqual(functionsCalled.utilMock.readData[0], 'arn:::foo:bar/password');
                test.done();
            });
        }
    }
};
