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
const util = require('util');
const assert = require('assert');
const signals = require('../../lib/signals');
const CloudProvider = require('../../lib/cloudProvider');

describe('cluster tests', () => {
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

    beforeEach((done) => {
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

        done();
    });

    afterEach((done) => {
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        fsMock.readFile = realReadFile;
        fsMock.writeFile = realWriteFile;

        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        done();
    });

    describe('Undefined Options tests', () => {
        it('no password test', (done) => {
            const passwordUrl = 'https://password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', passwordUrl,
                '-u', 'user', '--password', '--host', 'localhost', '--output', 'cluster.log'];

            cluster.run(argv, testOptions, () => {
                assert.strictEqual(cluster.options.passwordUrl, passwordUrl);
                assert.strictEqual(cluster.options.password, undefined);
                done();
            });
        });

        it('no password url test', (done) => {
            const password = 'password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', '-u', 'user',
                '--password', password, '--host', 'localhost', '--output', 'cluster.log'];

            cluster.run(argv, testOptions, () => {
                assert.strictEqual(cluster.options.passwordUrl, undefined);
                assert.strictEqual(cluster.options.password, password);
                done();
            });
        });

        it('no remote password test', (done) => {
            const remotePasswordUrl = 'https://password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password', 'password',
                '-u', 'user', '--password', '--host', 'localhost', '--output', 'cluster.log',
                '--remote-password-url', remotePasswordUrl, '--remote-password'];

            cluster.run(argv, testOptions, () => {
                assert.strictEqual(cluster.options.remotePasswordUrl, remotePasswordUrl);
                assert.strictEqual(cluster.options.remotePassword, undefined);
                done();
            });
        });

        it('no remote password url test', (done) => {
            const remotePassword = 'password';
            argv = ['node', 'cluster.js', '--log-level', 'none', '--password-url', '-u', 'user',
                '--password', 'password', '--host', 'localhost', '--output', 'cluster.log',
                '--remote-password-url', '--remote-password', remotePassword];

            cluster.run(argv, testOptions, () => {
                assert.strictEqual(cluster.options.remotePasswordUrl, undefined);
                assert.strictEqual(cluster.options.remotePassword, remotePassword);
                done();
            });
        });
    });

    it('wait for test', (done) => {
        argv.push('--wait-for', 'foo');
        ipcMock.send('foo');

        cluster.run(argv, testOptions, () => {
            assert.deepEqual(sentSignals, ['foo', signals.CLUSTER_RUNNING, signals.CLUSTER_DONE]);
            assert.notStrictEqual(functionsCalled.ipc.once.indexOf('foo'), -1);
            done();
        });
    });

    it('exception signals error test', (done) => {
        bigIpMock.ready = () => {
            return q.reject('err');
        };

        argv.push('--wait-for', 'foo');
        ipcMock.send('foo');

        cluster.run(argv, testOptions, () => {
            assert.notStrictEqual(sentSignals.indexOf(signals.CLOUD_LIBS_ERROR), -1);
            assert.strictEqual(sentSignals.indexOf(signals.CLUSTER_DONE), -1);
            done();
        });
    });

    describe('BigIq Primary Required Options tests', () => {
        it('no root password uri test', (done) => {
            argv.push('--primary', '--big-iq-failover-peer-ip', '1.2.3.4');

            cluster.run(argv, testOptions, () => {
                assert.notStrictEqual(exitMessage.indexOf('--big-iq-password-data-uri'), -1);
                assert.strictEqual(exitCode, 1);
                done();
            });
        });
    });

    describe('BigIq cluster tests', () => {
        beforeEach(() => {
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
                'arn:::foo:bar/password', '--primary', '--big-iq-failover-peer-ip', '1.2.3.4'];
        });

        it('BigIp Cluster Add Seconary Called test', (done) => {
            testOptions.bigIp.password = 'adminpass';
            cluster.run(argv, testOptions, () => {
                assert.deepEqual(
                    functionsCalled.bigIp.cluster.addSecondary,
                    ['1.2.3.4', 'admin', 'adminpass', 'rootPassword']
                );
                done();
            });
        });

        it('BigIp password decrypt test', (done) => {
            const encryptedData = 'dke9cxk';

            utilMock.readData = function decryptPassword() {
                functionsCalled.utilMock.readData = arguments;
                return q(encryptedData);
            };

            localCryptoUtilMock.decryptPassword = function decryptPassword() {
                functionsCalled.localCryptoUtilMock.decryptPassword = arguments;
                return q(JSON.stringify(
                    {
                        primaryPassphrase: 'keykeykey',
                        root: 'rootpazz',
                        admin: 'AdPass'
                    }
                ));
            };

            argv.push('--big-iq-password-data-encrypted');
            cluster.run(argv, testOptions, () => {
                assert.deepEqual(functionsCalled.localCryptoUtilMock.decryptPassword[0], encryptedData);
                assert.strictEqual(functionsCalled.utilMock.readData[0], 'arn:::foo:bar/password');
                done();
            });
        });
    });
});
