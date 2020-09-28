/**
 * Copyright 2016-2018 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const q = require('q');
const util = require('util');
const assert = require('assert');

const deviceGroup = 'testDeviceGroup';
const CloudProvider = require('../../lib/cloudProvider');
const AutoscaleInstance = require('../../lib/autoscaleInstance');


describe('autoscale tests', () => {
    let autoscale;
    let fsMock;
    let BigIp;
    let authnMock;
    let icontrolMock;
    let cloudUtilMock;
    let cryptoUtilMock;
    let ipcMock;
    let dnsProviderFactoryMock;
    let gtmDnsProviderMock;
    let childProcessMock;
    let argv;
    let providerMock;
    let bigIpMock;
    let testOptions;
    let instances;
    let instanceId;
    let exitCode;
    let exitMessage;
    let messages;
    let credentials;
    let functionsCalled;
    let cloudPrivateKeyPath;
    let privateKeyMetadata;

    let existsSync;
    let unlinkSync;
    let writeFile;
    let createWriteStream;
    let readdir;
    let stat;
    let rename;

    let execFile;

    let unlinkedFiles;
    let renamedFiles;
    let missingFilePrefix;

    let ucsBackupName;

    // Our tests cause too many event listeners. Turn off the check.
    /* eslint-disable global-require */
    const options = require('commander');

    options.setMaxListeners(0);
    process.setMaxListeners(0);

    util.inherits(ProviderMock, CloudProvider);
    function ProviderMock() {
        ProviderMock.super_.call(this);
        this.functionCalls = {};
    }

    ProviderMock.prototype.init = function init() {
        this.functionCalls.init = arguments;
        return q();
    };

    ProviderMock.prototype.putInstance = function putInstance() {
        this.functionCalls.putInstance = arguments;
        return q();
    };

    ProviderMock.prototype.getInstances = function getInstances() {
        this.functionCalls.getInstances = arguments;
        return q(instances);
    };

    ProviderMock.prototype.getInstanceId = function getInstanceId() {
        this.functionCalls.getInstanceId = true;
        return q(instanceId);
    };

    ProviderMock.prototype.isValidPrimary = function isValidPrimary() {
        this.functionCalls.isValidPrimary = true;
        return q(true);
    };

    ProviderMock.prototype.electPrimary = function isValidPrimary(instancesToElect) {
        this.functionCalls.instancesSent = instancesToElect;
        this.functionCalls.electPrimary = true;
        return q();
    };

    ProviderMock.prototype.tagPrimaryInstance = function tagPrimaryInstance(primaryIid, gInstances) {
        this.functionCalls.tagPrimaryInstance = true;
        this.functionCalls.taggedPrimaryIid = primaryIid;
        this.functionCalls.taggedPrimaryInstances = gInstances;
        return q();
    };

    ProviderMock.prototype.instancesRemoved = function instancesRemoved(instancesToRemove) {
        this.functionCalls.instancesRemoved = instancesToRemove;
        return q();
    };

    ProviderMock.prototype.getStoredUcs = function getStoredUcs() {
        return q();
    };

    ProviderMock.prototype.putPublicKey = function putPublicKey() {
        return q();
    };

    ProviderMock.prototype.getMessages = function getMessages() {
        this.functionCalls.getMessages = arguments;
        return q(messages);
    };

    ProviderMock.prototype.sendMessage = function sendMessage() {
        this.functionCalls.sendMessage = arguments;
        return q(messages);
    };

    ProviderMock.prototype.getPrimaryCredentials = function getPrimaryCredentials() {
        this.functionCalls.getPrimaryCredentials = arguments;
        return q(credentials);
    };

    ProviderMock.prototype.putPrimaryCredentials = function putPrimaryCredentials() {
        this.functionCalls.putPrimaryCredentials = arguments;
        return q();
    };

    ProviderMock.prototype.storeUcs = function storeUcs() {
        this.functionCalls.storeUcs = arguments;
        return q();
    };

    beforeEach((done) => {
        argv = ['node', 'autoscale', '--password', 'foobar', '--device-group',
            deviceGroup, '--cloud', 'aws', '--log-level', 'none'];

        instanceId = 'two';
        const instance1 = new AutoscaleInstance()
            .setHostname('host1')
            .setPrivateIp('1.2.3.4')
            .setMgmtIp('1.2.3.4')
            .setLastBackup(new Date(1970, 1, 1).getTime());
        const instance2 = new AutoscaleInstance()
            .setIsPrimary()
            .setHostname('host2')
            .setPrivateIp('5.6.7.8')
            .setMgmtIp('5.6.7.8');

        instances = {
            one: instance1,
            two: instance2
        };

        /* eslint-disable global-require */
        fsMock = require('fs');
        childProcessMock = require('child_process');
        dnsProviderFactoryMock = require('../../lib/dnsProviderFactory');
        gtmDnsProviderMock = require('../../lib/gtmDnsProvider');
        BigIp = require('../../lib/bigIp');
        cloudUtilMock = require('../../lib/util');
        cryptoUtilMock = require('../../lib/cryptoUtil');
        icontrolMock = require('../testUtil/icontrolMock');
        ipcMock = require('../../lib/ipc');

        exitCode = 0;
        exitMessage = undefined;
        cloudUtilMock.logAndExit = function logAndExit(message, level, code) {
            exitMessage = message;
            if (code) {
                exitCode = code;
                throw new Error(`exit with code ${exitCode}`);
            }
        };
        cloudUtilMock.saveArgs = function saveArgs() {
            return q();
        };
        cloudUtilMock.getProductString = function getProductString() {
            return q('BIG-IP');
        };

        cloudUtilMock.getProcessCount = function getProcessCount() {
            return q('1');
        };

        cloudUtilMock.getProcessExecutionTimeWithPid = function getProcessExecutionTimeWithPid() {
            return q();
        };

        existsSync = fsMock.existsSync;
        unlinkSync = fsMock.unlinkSync;
        writeFile = fsMock.writeFile;
        createWriteStream = fsMock.createWriteStream;
        readdir = fsMock.readdir;
        stat = fsMock.stat;
        rename = fsMock.rename;

        execFile = childProcessMock.execFile;

        unlinkedFiles = [];
        renamedFiles = [];
        fsMock.unlinkSync = (file) => {
            unlinkedFiles.push(file);
        };
        fsMock.rename = (file, cb) => {
            renamedFiles.push(file);
            cb();
        };
        fsMock.writeFile = (path, data, cb) => {
            cb();
        };

        providerMock = new ProviderMock();

        // Just resolve right away, otherwise these tests never exit
        ipcMock.once = function once() {
            functionsCalled.ipc.once = arguments;
            return q();
        };

        cryptoUtilMock.functionCalls = {};
        cryptoUtilMock.generateRandomBytes = () => {
            return q();
        };
        cryptoUtilMock.generateKeyPair = () => {
            return q();
        };
        cryptoUtilMock.decrypt = function decrypt() {
            cryptoUtilMock.functionCalls.decrypt = arguments;
            return q();
        };
        cryptoUtilMock.encrypt = function encrypt() {
            cryptoUtilMock.functionCalls.encrypt = arguments;
            return q();
        };

        dnsProviderFactoryMock.getDnsProvider = () => {
            return gtmDnsProviderMock;
        };

        gtmDnsProviderMock.functionCalls = {};
        gtmDnsProviderMock.init = function init() {
            gtmDnsProviderMock.functionCalls.init = arguments;
            return q();
        };
        gtmDnsProviderMock.update = function update() {
            gtmDnsProviderMock.functionCalls.update = arguments;
        };

        functionsCalled = {
            ipc: {}
        };

        authnMock = require('../../../f5-cloud-libs').authn;
        authnMock.authenticate = (host, user, password) => {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        };

        bigIpMock = new BigIp();
        bigIpMock.ready = () => {
            return q();
        };
        icontrolMock.when(
            'list',
            '/shared/identified-devices/config/device-info',
            {
                product: 'BIG-IP'
            }
        );
        bigIpMock.init('localhost', 'admin', 'admin')
            .then(() => {
                bigIpMock.icontrol = icontrolMock;

                icontrolMock.reset();

                testOptions = {
                    bigIp: bigIpMock,
                    cloudProvider: providerMock
                };

                bigIpMock.functionCalls = {};

                bigIpMock.ready = () => {
                    return q();
                };

                bigIpMock.save = () => {
                    return q();
                };

                bigIpMock.loadUcs = function loadUcs() {
                    bigIpMock.functionCalls.loadUcs = arguments;
                    return q();
                };

                bigIpMock.installPrivateKey = function installPrivateKey() {
                    bigIpMock.functionCalls.installPrivateKey = arguments;
                    return q();
                };

                bigIpMock.getPrivateKeyFilePath = () => {
                    return q(cloudPrivateKeyPath);
                };

                bigIpMock.getPrivateKeyMetadata = function getPrivateKeyMetadata() {
                    bigIpMock.functionCalls.getPrivateKeyMetadata = arguments;
                    return q(privateKeyMetadata);
                };

                bigIpMock.cluster = {
                    configSyncIp() {
                        bigIpMock.functionCalls.configSyncIp = arguments;
                        return q();
                    },
                    createDeviceGroup() {
                        bigIpMock.functionCalls.createDeviceGroup = arguments;
                        return q();
                    },
                    deleteDeviceGroup() {
                        return q();
                    },
                    joinCluster() {
                        bigIpMock.functionCalls.joinCluster = arguments;
                        return q();
                    },
                    resetTrust() {
                        return q();
                    }
                };
                done();
            });

        autoscale = require('../../scripts/autoscale');
    });

    afterEach(() => {
        fsMock.existsSync = existsSync;
        fsMock.unlinkSync = unlinkSync;
        fsMock.writeFile = writeFile;
        fsMock.createWriteStream = createWriteStream;
        fsMock.readdir = readdir;
        fsMock.stat = stat;
        fsMock.rename = rename;

        childProcessMock.execFile = execFile;

        cloudUtilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('Undefined Options tests', () => {
        it('no password test', (done) => {
            const passwordUrl = 'https://password';
            argv = ['node', 'autoscale', '--host', '1.2.3.4', '-u', 'foo',
                '--password-url', passwordUrl, '--password', '--log-level', 'none'];

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(autoscale.options.passwordUrl, passwordUrl);
                assert.strictEqual(autoscale.options.password, undefined);
                done();
            });
        });

        it('no password url test', (done) => {
            const password = 'password';
            argv = ['node', 'autoscale', '--host', '1.2.3.4', '-u', 'foo',
                '--password-url', '--password', password, '--log-level', 'none'];

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(autoscale.options.passwordUrl, undefined);
                assert.strictEqual(autoscale.options.password, password);
                done();
            });
        });
    });

    describe('common tests', () => {
        beforeEach(() => {
            fsMock.writeFile = (path, data, cb) => {
                cb();
            };
        });

        it('no password test', (done) => {
            argv = ['node', 'autoscale', '--device-group',
                deviceGroup, '--cloud', 'aws', '--log-level', 'none'];

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(exitCode, 1);
                assert.notStrictEqual(exitMessage.indexOf('is required'), -1);
                done();
            });
        });

        it('wait for test', (done) => {
            argv.push('--wait-for', 'foo');

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.ipc.once[0], 'foo');
                done();
            });
        });

        it('background test', (done) => {
            let runInBackgroundCalled = false;
            cloudUtilMock.runInBackgroundAndExit = () => {
                runInBackgroundCalled = true;
            };

            argv.push('--background');

            autoscale.run(argv, testOptions, () => {
                assert.ok(runInBackgroundCalled);
                done();
            });
        });

        it('init called test', (done) => {
            argv.push('--provider-options', 'key1:value1,key2:value2');
            autoscale.run(argv, testOptions, () => {
                assert.deepEqual(providerMock.functionCalls.init[0], { key1: 'value1', key2: 'value2' });
                done();
            });
        });

        it('instances called test', (done) => {
            autoscale.run(argv, testOptions, () => {
                assert.ok(providerMock.functionCalls.getInstances, 'getInstances not called');
                done();
            });
        });

        it('no instances test', (done) => {
            instances = {};
            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(exitCode, 1);
                assert.notStrictEqual(exitMessage.indexOf('list is empty'), -1);
                done();
            });
        });

        it('missing our instance test', (done) => {
            instances = {
                one: {
                    isPrimary: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true
                }
            };

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(exitCode, 1);
                assert.notStrictEqual(exitMessage.indexOf('Our instance ID'), -1);
                done();
            });
        });

        it('becoming primary test', (done) => {
            instances = {
                two: {
                    isPrimary: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true,
                    status: 'BECOMING_PRIMARY'
                }
            };

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(exitCode, 0);
                assert.notStrictEqual(exitMessage.indexOf('becoming primary'), -1);
                done();
            });
        });

        it('bad version test', (done) => {
            instances = {
                one: {
                    isPrimary: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    version: '2'
                },
                two: {
                    isPrimary: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true
                }
            };

            bigIpMock.deviceInfo = () => {
                return {
                    version: '1'
                };
            };

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(providerMock.functionCalls.putInstance[1].primaryStatus.status,
                    CloudProvider.STATUS_VERSION_NOT_UP_TO_DATE);
                done();
            });
        });

        it('not external test', (done) => {
            instances = {
                one: {
                    isPrimary: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    external: true
                },
                two: {
                    isPrimary: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true,
                    external: false
                }
            };

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(providerMock.functionCalls.putInstance[1].primaryStatus.status,
                    CloudProvider.STATUS_NOT_EXTERNAL);
                done();
            });
        });

        it('not provider visible test', (done) => {
            instances = {
                one: {
                    isPrimary: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true
                },
                two: {
                    isPrimary: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: false
                }
            };

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(providerMock.functionCalls.putInstance[1].primaryStatus.status,
                    CloudProvider.STATUS_NOT_IN_CLOUD_LIST);
                done();
            });
        });

        it('is valid primary called with instances test', (done) => {
            autoscale.run(argv, testOptions, () => {
                assert.ok(providerMock.functionCalls.isValidPrimary);
                done();
            });
        });

        it('elect called with versions marked test', (done) => {
            providerMock.isValidPrimary = () => {
                return q(false);
            };

            bigIpMock.deviceInfo = () => {
                return {
                    version: '4.5.6'
                };
            };

            instances = {
                one: {
                    isPrimary: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    version: '1.2.3'
                },
                two: {
                    isPrimary: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true
                }
            };

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(providerMock.functionCalls.instancesSent.one.versionOk, false);
                assert.strictEqual(providerMock.functionCalls.instancesSent.two.versionOk, true);
                done();
            });
        });

        it('Elect Primary Called With Invalid Primary test', (done) => {
            providerMock.isValidPrimary = () => {
                return q(false);
            };
            autoscale.run(argv, testOptions, () => {
                assert.ok(providerMock.functionCalls.electPrimary);
                done();
            });
        });

        it('Elect Not Called With Valid Primary test', (done) => {
            providerMock.isValidPrimary = () => {
                return q(true);
            };
            autoscale.run(argv, testOptions, () => {
                assert.ifError(providerMock.functionCalls.electPrimary);
                done();
            });
        });

        describe('Autoscale Process Count tests', () => {
            it('One Running Autoscale test', (done) => {
                argv.push('--cluster-action', 'join');
                cloudUtilMock.getProcessCount = function getProcessCount() {
                    return q('2');
                };

                cloudUtilMock.getProcessExecutionTimeWithPid = function getProcessExecutionTimeWithPid() {
                    return q('12123-01');
                };

                autoscale.run(argv, testOptions, () => {
                    assert.strictEqual(exitMessage, 'Another autoscale process already running. Exiting.');
                    done();
                });
            });

            it('One Running Autoscale Short Command test', (done) => {
                argv.push('-c', 'update');
                cloudUtilMock.getProcessCount = function getProcessCount() {
                    return q('2');
                };

                cloudUtilMock.getProcessExecutionTimeWithPid = function getProcessExecutionTimeWithPid() {
                    return q('12123-01');
                };

                autoscale.run(argv, testOptions, () => {
                    assert.strictEqual(exitMessage, 'Another autoscale process already running. Exiting.');
                    done();
                });
            });
        });

        describe('Becoming primary tests', () => {
            beforeEach(() => {
                childProcessMock.execFile = (file, args, cb) => {
                    cb();
                };
            });

            describe('load ucs tests', () => {
                beforeEach(() => {
                    missingFilePrefix = undefined;
                    fsMock.existsSync = (file) => {
                        if (file.startsWith(missingFilePrefix)) {
                            return false;
                        }
                        return true;
                    };
                    providerMock.getStoredUcs = () => {
                        return q({});
                    };
                    cloudUtilMock.runShellCommand = () => {
                        return q();
                    };
                    cloudUtilMock.runTmshCommand = () => {
                        return q();
                    };

                    cloudUtilMock.writeUcsFile = () => {
                        return q();
                    };
                });

                it('update script failure test', (done) => {
                    const errorMessage = 'bad script';
                    childProcessMock.execFile = (file, args, cb) => {
                        cb(new Error(errorMessage));
                    };
                    autoscale.run(argv, testOptions, (err) => {
                        assert.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        assert.notStrictEqual(err.message.indexOf(errorMessage), -1);
                        done();
                    });
                });

                it('missing file test', (done) => {
                    missingFilePrefix = '/shared/tmp/ucs/ucsUpdated_';
                    autoscale.run(argv, testOptions, (err) => {
                        assert.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        assert.notStrictEqual(err.message.indexOf('updated ucs not found'), -1);
                        done();
                    });
                });

                it('load ucs failure test', (done) => {
                    bigIpMock.loadUcs = () => {
                        return q.reject('foo');
                    };
                    autoscale.run(argv, testOptions, () => {
                        assert.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        done();
                    });
                });

                it('buffer test', (done) => {
                    autoscale.run(argv, testOptions, () => {
                        assert.notStrictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        done();
                    });
                });

                it('pipe test', (done) => {
                    providerMock.getStoredUcs = () => {
                        return q({
                            pipe() { },
                            on() { }
                        });
                    };
                    fsMock.createWriteStream = () => {
                        return {
                            on(event, cb) {
                                cb();
                            },
                            close(cb) {
                                cb();
                            }
                        };
                    };
                    autoscale.run(argv, testOptions, () => {
                        assert.notStrictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        done();
                    });
                });
            });

            describe('create device group tests', () => {
                it('get hostname test', (done) => {
                    const hostname = 'myNewHostname';

                    instances = {
                        one: {
                            isPrimary: false,
                            hostname: 'host1',
                            privateIp: '1.2.3.4',
                            mgmtIp: '1.2.3.4',
                            providerVisible: true
                        },
                        two: {
                            isPrimary: true,
                            privateIp: '5.6.7.8',
                            mgmtIp: '5.6.7.8',
                            providerVisible: true
                        }
                    };

                    icontrolMock.when(
                        'list',
                        '/tm/sys/global-settings',
                        {
                            hostname
                        }
                    );

                    autoscale.run(argv, testOptions, () => {
                        assert.deepEqual(bigIpMock.functionCalls.createDeviceGroup[2], [hostname]);
                        done();
                    });
                });

                it('asm provisioned test', (done) => {
                    icontrolMock.when(
                        'list',
                        '/tm/sys/provision',
                        [
                            {
                                kind: 'tm:sys:provision:provisionstate',
                                name: 'am',
                                fullPath: 'am',
                                level: 'none',

                            },
                            {
                                kind: 'tm:sys:provision:provisionstate',
                                name: 'apm',
                                fullPath: 'apm',
                                level: 'none',

                            },
                            {
                                kind: 'tm:sys:provision:provisionstate',
                                name: 'asm',
                                fullPath: 'asm',
                                level: 'nominal',
                            }
                        ]
                    );

                    autoscale.run(argv, testOptions, () => {
                        assert.ok(bigIpMock.functionCalls.createDeviceGroup[3].asmSync);
                        done();
                    });
                });

                it('asm not provisioned test', (done) => {
                    icontrolMock.when(
                        'list',
                        '/tm/sys/provision',
                        [
                            {
                                kind: 'tm:sys:provision:provisionstate',
                                name: 'am',
                                fullPath: 'am',
                                level: 'none',

                            },
                            {
                                kind: 'tm:sys:provision:provisionstate',
                                name: 'apm',
                                fullPath: 'apm',
                                level: 'none',

                            },
                            {
                                kind: 'tm:sys:provision:provisionstate',
                                name: 'asm',
                                fullPath: 'asm',
                                level: 'none',
                            }
                        ]
                    );

                    autoscale.run(argv, testOptions, () => {
                        assert.ok(!bigIpMock.functionCalls.createDeviceGroup[3].asmSync);
                        done();
                    });
                });
            });

            describe('dns tests', () => {
                beforeEach(() => {
                    argv.push('--dns', 'gtm', '--dns-app-port', '1234', '--cluster-action', 'update');

                    icontrolMock.when('list', '/tm/sys/global-settings', { hostname: 'host2' });
                    bigIpMock.cluster.getCmSyncStatus = () => {
                        return q({
                            disconnected: []
                        });
                    };

                    instances = {
                        one: {
                            isPrimary: false,
                            hostname: 'host1',
                            privateIp: '1.2.3.4',
                            publicIp: '11.12.13.14',
                            mgmtIp: '1.2.3.4',
                            providerVisible: true
                        },
                        two: {
                            isPrimary: true,
                            hostname: 'host2',
                            privateIp: '5.6.7.8',
                            publicIp: '15.16.17.18',
                            mgmtIp: '5.6.7.8',
                            providerVisible: true
                        }
                    };
                });

                it('init call test', (done) => {
                    cloudUtilMock.getProcessCount = function getProcessCount() {
                        return q('0');
                    };

                    cloudUtilMock.getProcessExecutionTimeWithPid = function getProcessExecutionTimeWithPid() {
                        return q();
                    };
                    argv.push('--dns-provider-options', 'key1:value1,key2:value2');
                    autoscale.run(argv, testOptions, () => {
                        assert.deepEqual(
                            gtmDnsProviderMock.functionCalls.init[0],
                            {
                                key1: 'value1',
                                key2: 'value2'
                            }
                        );
                        done();
                    });
                });

                it('private test', (done) => {
                    argv.push('--dns-ip-type', 'private');

                    autoscale.run(argv, testOptions, () => {
                        const updatedServers = gtmDnsProviderMock.functionCalls.update[0];
                        assert.strictEqual(updatedServers.length, 2);
                        assert.deepEqual(updatedServers[0], {
                            name: instances.one.hostname,
                            ip: instances.one.privateIp,
                            port: '1234'
                        });
                        assert.deepEqual(updatedServers[1], {
                            name: instances.two.hostname,
                            ip: instances.two.privateIp,
                            port: '1234'
                        });
                        done();
                    });
                });

                it('public test', (done) => {
                    argv.push('--dns-ip-type', 'public');
                    autoscale.run(argv, testOptions, () => {
                        const updatedServers = gtmDnsProviderMock.functionCalls.update[0];
                        assert.strictEqual(updatedServers.length, 2);
                        assert.deepEqual(updatedServers[0], {
                            name: instances.one.hostname,
                            ip: instances.one.publicIp,
                            port: '1234'
                        });
                        assert.deepEqual(updatedServers[1], {
                            name: instances.two.hostname,
                            ip: instances.two.publicIp,
                            port: '1234'
                        });
                        done();
                    });
                });
            });
        });
    });

    describe('update tests', () => {
        beforeEach(() => {
            argv.push('--cluster-action', 'update');
            bigIpMock.cluster.getCmSyncStatus = () => {
                return q({
                    disconnected: []
                });
            };

            const instance1 = new AutoscaleInstance()
                .setHostname('host1')
                .setPrivateIp('1.2.3.4')
                .setMgmtIp('1.2.3.4')
                .setLastBackup(new Date(1970, 1, 2).getTime());
            const instance2 = new AutoscaleInstance()
                .setIsPrimary()
                .setHostname('host2')
                .setPrivateIp('5.6.7.8')
                .setMgmtIp('5.6.7.8');

            instance2.primaryStatus = {
                instanceId: 'two'
            };

            instances = {
                one: instance1,
                two: instance2
            };
        });

        it('set config sync test', (done) => {
            let hostname;
            let privateIp;

            bigIpMock.deviceState = (passedHostname) => {
                hostname = passedHostname;
                return q({ configsyncIp: 'none' });
            };
            bigIpMock.cluster.configSyncIp = (passedIp) => {
                privateIp = passedIp;
                return q();
            };
            icontrolMock.when('list', '/tm/sys/global-settings', { hostname: 'host2' });

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(hostname, 'host2');
                assert.strictEqual(privateIp, '5.6.7.8');
                done();
            });
        });

        it('config sync already happened test', (done) => {
            let hostname;
            let configSyncIpCalled = false;

            bigIpMock.deviceState = (passedHostname) => {
                hostname = passedHostname;
                return q({ configsyncIp: '5.6.7.8' });
            };
            bigIpMock.cluster.configSyncIp = () => {
                configSyncIpCalled = true;
                return q();
            };
            icontrolMock.when('list', '/tm/sys/global-settings', { hostname: 'host2' });

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(hostname, 'host2');
                assert.strictEqual(configSyncIpCalled, false);
                done();
            });
        });

        describe('is primary tests', () => {
            it('disconnected test', (done) => {
                let devicesRemoved = [];
                icontrolMock.when('list', '/tm/sys/global-settings', { hostname: 'host2' });
                bigIpMock.cluster.getCmSyncStatus = () => {
                    return q({
                        disconnected: ['host1', 'host2', 'host3', 'host4']
                    });
                };
                bigIpMock.cluster.removeFromCluster = (devices) => {
                    devicesRemoved = devices;
                    return q();
                };

                argv.push('--host', 'host', '--user', 'user', '--password', 'password');

                // We expect that host3 and host4 will be removed. host1 will not because the cloud provider
                // says it is still in the list of known instances
                autoscale.run(argv, testOptions, () => {
                    assert.strictEqual(devicesRemoved.length, 2);
                    assert.notStrictEqual(devicesRemoved.indexOf('host3'), -1);
                    assert.notStrictEqual(devicesRemoved.indexOf('host4'), -1);
                    done();
                });
            });
        });

        describe('is not primary tests', () => {
            beforeEach(() => {
                instanceId = 'one';
            });

            it('primary file removed test', (done) => {
                fsMock.existsSync = () => {
                    return true;
                };

                autoscale.run(argv, testOptions, () => {
                    assert.notStrictEqual(unlinkedFiles.indexOf('/config/cloud/master'), -1);
                    done();
                });
            });
        });
    });

    describe('join tests', () => {
        beforeEach(() => {
            argv.push('--cluster-action', 'join');
        });

        it('config sync called test', (done) => {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: 'host2'
                }
            );

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(bigIpMock.functionCalls.configSyncIp[0], instances[instanceId].privateIp);
                done();
            });
        });

        it('create group when primary test', (done) => {
            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(bigIpMock.functionCalls.createDeviceGroup[0], deviceGroup);
                done();
            });
        });

        it('create group options defaults test', (done) => {
            autoscale.run(argv, testOptions, () => {
                const createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];

                assert.strictEqual(createGroupOptions.autoSync, true);
                assert.strictEqual(createGroupOptions.asmSync, undefined);
                assert.strictEqual(createGroupOptions.networkFailover, undefined);
                assert.strictEqual(createGroupOptions.fullLoadOnSync, undefined);
                assert.strictEqual(createGroupOptions.saveOnAutoSync, true);
                done();
            });
        });

        it('create group options non defaults test', (done) => {
            argv.push('--no-auto-sync', '--asm-sync', '--network-failover', '--full-load-on-sync');

            autoscale.run(argv, testOptions, () => {
                const createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];

                assert.strictEqual(createGroupOptions.autoSync, false);
                assert.strictEqual(createGroupOptions.asmSync, true);
                assert.strictEqual(createGroupOptions.networkFailover, true);
                assert.strictEqual(createGroupOptions.fullLoadOnSync, true);
                done();
            });
        });

        it('create group options no save on autoSync test', (done) => {
            argv.push('--no-save-on-auto-sync');

            autoscale.run(argv, testOptions, () => {
                const createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];
                assert.strictEqual(createGroupOptions.autoSync, true);
                assert.strictEqual(createGroupOptions.saveOnAutoSync, false);
                done();
            });
        });

        describe('encryption tests', () => {
            beforeEach(() => {
                providerMock.features[CloudProvider.FEATURE_ENCRYPTION] = true;
            });

            it('basic test', (done) => {
                autoscale.run(argv, testOptions, () => {
                    assert.notStrictEqual(bigIpMock.functionCalls.installPrivateKey, undefined);
                    done();
                });
            });
        });
    });

    describe('unblock sync tests', () => {
        beforeEach(() => {
            argv.push('--cluster-action', 'unblock-sync');
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: 'host2'
                }
            );
        });

        it('basic test', (done) => {
            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(bigIpMock.functionCalls.configSyncIp[0], instances[instanceId].privateIp);
                done();
            });
        });
    });

    describe('backup ucs tests', () => {
        beforeEach(() => {
            argv.push('--cluster-action', 'backup-ucs');

            ucsBackupName = undefined;
            bigIpMock.deviceInfo = () => {
                return q({ version: '13.1.0' });
            };
            bigIpMock.saveUcs = (ucsName) => {
                ucsBackupName = ucsName;
                return q();
            };
            fsMock.readdir = (directory, cb) => {
                cb(null, ['file1.ucs', 'ucsAutosave_1234.ucs']);
            };
        });

        it('basic test', (done) => {
            autoscale.run(argv, testOptions, () => {
                assert.ok(ucsBackupName.startsWith('ucsAutosave_'));
                done();
            });
        });

        it('old files deleted test', (done) => {
            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(unlinkedFiles.length, 1);
                assert.strictEqual(unlinkedFiles[0], '/var/local/ucs/ucsAutosave_1234.ucs');
                done();
            });
        });

        it('ajv cleanup test', (done) => {
            bigIpMock.deviceInfo = () => {
                return q({ version: '13.0.0' });
            };
            fsMock.stat = (file, cb) => {
                if (file.endsWith('/ajv/lib/$data.js')) {
                    cb(new Error());
                } else {
                    cb(null);
                }
            };

            autoscale.run(argv, testOptions, () => {
                assert.strictEqual(renamedFiles.length, 1);
                assert.ok(renamedFiles[0].endsWith('ajv/lib/refs/$data.json'));
                done();
            });
        });
    });

    describe('messaging tests', () => {
        beforeEach(() => {
            providerMock.features[CloudProvider.FEATURE_MESSAGING] = true;
            argv.push('--cluster-action', 'join');
        });

        describe('is primary tests', () => {
            it('actions test', (done) => {
                autoscale.run(argv, testOptions, () => {
                    assert.deepEqual(providerMock.functionCalls.getMessages[0],
                        [CloudProvider.MESSAGE_ADD_TO_CLUSTER]);
                    done();
                });
            });

            it('add to cluster test', (done) => {
                const deviceGroupToAdd = 'addDeviceGroup';
                const hostToAdd = 'addHost';
                const usernameToAdd = 'addUserName';
                const passwordToAdd = 'addPassword';
                providerMock.getMessages = () => {
                    const messageData = JSON.stringify(
                        {
                            deviceGroup: deviceGroupToAdd,
                            host: hostToAdd,
                            username: usernameToAdd,
                            password: passwordToAdd
                        }
                    );
                    messages = [
                        {
                            action: CloudProvider.MESSAGE_ADD_TO_CLUSTER,
                            data: messageData
                        }
                    ];
                    return q(messages);
                };

                autoscale.run(argv, testOptions, () => {
                    assert.strictEqual(bigIpMock.functionCalls.joinCluster[0], deviceGroupToAdd);
                    assert.strictEqual(bigIpMock.functionCalls.joinCluster[1], hostToAdd);
                    assert.strictEqual(bigIpMock.functionCalls.joinCluster[2], usernameToAdd);
                    assert.strictEqual(bigIpMock.functionCalls.joinCluster[3], passwordToAdd);
                    done();
                });
            });
        });

        describe('is not primary tests', () => {
            beforeEach(() => {
                instanceId = 'one';
            });

            it('actions test', (done) => {
                autoscale.run(argv, testOptions, () => {
                    assert.deepEqual(providerMock.functionCalls.getMessages[0],
                        [CloudProvider.MESSAGE_SYNC_COMPLETE]);
                    done();
                });
            });

            it('Prepare Encrypted Message Data test', (done) => {
                const publicKey = 'myPubKey';
                providerMock.features[CloudProvider.FEATURE_ENCRYPTION] = true;
                providerMock.getPublicKey = () => {
                    return q(publicKey);
                };
                autoscale.run(argv, testOptions, () => {
                    assert.deepEqual(cryptoUtilMock.functionCalls.encrypt[0], publicKey);
                    done();
                });
            });
        });

        describe('encrypted tests', () => {
            beforeEach(() => {
                providerMock.features[CloudProvider.FEATURE_ENCRYPTION] = true;
                providerMock.getMessages = () => {
                    messages = [
                        {
                            action: CloudProvider.MESSAGE_ADD_TO_CLUSTER,
                            data: {}
                        }
                    ];
                    return q(messages);
                };
                privateKeyMetadata = {
                    passphrase: 'myPassphrase'
                };
            });

            it('has key test', (done) => {
                autoscale.cloudPrivateKeyPath = 'foo';
                autoscale.run(argv, testOptions, () => {
                    assert.deepEqual(cryptoUtilMock.functionCalls.decrypt[0], autoscale.cloudPrivateKeyPath);
                    assert.deepEqual(
                        cryptoUtilMock.functionCalls.decrypt[2],
                        {
                            passphrase: privateKeyMetadata.passphrase,
                            passphraseEncrypted: true
                        }
                    );
                    done();
                });
            });

            it('does not have key test', (done) => {
                cloudPrivateKeyPath = 'bar';
                autoscale.run(argv, testOptions, () => {
                    assert.deepEqual(cryptoUtilMock.functionCalls.decrypt[0], cloudPrivateKeyPath);
                    assert.deepEqual(
                        cryptoUtilMock.functionCalls.decrypt[2],
                        {
                            passphrase: privateKeyMetadata.passphrase,
                            passphraseEncrypted: true
                        }
                    );
                    done();
                });
            });
        });
    });

    describe('non messaging tests', () => {
        beforeEach(() => {
            providerMock.features[CloudProvider.FEATURE_MESSAGING] = false;
            argv.push('--cluster-action', 'join');
        });

        it('is not primary test', (done) => {
            instanceId = 'one';
            credentials = {
                username: 'myUser',
                password: 'myPassword'
            };
            autoscale.run(argv, testOptions, () => {
                const joinClusterCall = bigIpMock.functionCalls.joinCluster;
                assert.strictEqual(joinClusterCall[0], deviceGroup);
                assert.strictEqual(joinClusterCall[1], instances.two.mgmtIp);
                assert.strictEqual(joinClusterCall[2], credentials.username);
                assert.strictEqual(joinClusterCall[3], credentials.password);
                done();
            });
        });
    });

    it('tag primary called test', (done) => {
        instances = {
            one: {
                isPrimary: false,
                hostname: 'host1',
                privateIp: '1.2.3.4',
                mgmtIp: '1.2.3.4',
                providerVisible: true
            },
            two: {
                isPrimary: true,
                privateIp: '5.6.7.8',
                mgmtIp: '5.6.7.8',
                providerVisible: true
            }
        };

        autoscale.run(argv, testOptions, () => {
            assert.strictEqual(providerMock.functionCalls.taggedPrimaryInstances.one.isPrimary, false);
            assert.strictEqual(providerMock.functionCalls.taggedPrimaryIid, 'two');
            assert.notStrictEqual(providerMock.functionCalls.taggedPrimaryIid, 'one');
            assert.ok(providerMock.functionCalls.tagPrimaryInstance);
            done();
        });
    });
});
