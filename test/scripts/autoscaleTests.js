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

const deviceGroup = 'testDeviceGroup';
const util = require('util');
const q = require('q');
const CloudProvider = require('../../lib/cloudProvider');
const AutoscaleInstance = require('../../lib/autoscaleInstance');

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
const options = require('commander');

options.setMaxListeners(0);
process.setMaxListeners(0);

util.inherits(ProviderMock, CloudProvider);
function ProviderMock() {
    ProviderMock.super_.call(this);
    this.functionCalls = {};
}

ProviderMock.prototype.init = function init(...args) {
    this.functionCalls.init = args;
    return q();
};

ProviderMock.prototype.putInstance = function putInstance(...args) {
    this.functionCalls.putInstance = args;
    return q();
};

ProviderMock.prototype.getInstances = function getInstances(...args) {
    this.functionCalls.getInstances = args;
    return q(instances);
};

ProviderMock.prototype.getInstanceId = function getInstanceId() {
    this.functionCalls.getInstanceId = true;
    return q(instanceId);
};

ProviderMock.prototype.isValidMaster = function isValidMaster() {
    this.functionCalls.isValidMaster = true;
    return q(true);
};

ProviderMock.prototype.electMaster = function isValidMaster(instancesToElect) {
    this.functionCalls.instancesSent = instancesToElect;
    this.functionCalls.electMaster = true;
    return q();
};

ProviderMock.prototype.tagMasterInstance = function tagMasterInstance(masterIid, gInstances) {
    this.functionCalls.tagMasterInstance = true;
    this.functionCalls.taggedMasterIid = masterIid;
    this.functionCalls.taggedMasterInstances = gInstances;
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

ProviderMock.prototype.getMessages = function getMessages(...args) {
    this.functionCalls.getMessages = args;
    return q(messages);
};

ProviderMock.prototype.sendMessage = function sendMessage(...args) {
    this.functionCalls.sendMessage = args;
    return q(messages);
};

ProviderMock.prototype.getMasterCredentials = function getMasterCredentials(...args) {
    this.functionCalls.getMasterCredentials = args;
    return q(credentials);
};

ProviderMock.prototype.putMasterCredentials = function putMasterCredentials(...args) {
    this.functionCalls.putMasterCredentials = args;
    return q();
};

ProviderMock.prototype.storeUcs = function storeUcs(...args) {
    this.functionCalls.storeUcs = args;
    return q();
};

module.exports = {
    setUp(callback) {
        argv = ['node', 'autoscale', '--password', 'foobar', '--device-group',
            deviceGroup, '--cloud', 'aws', '--log-level', 'none'];

        instanceId = 'two';
        const instance1 = new AutoscaleInstance()
            .setHostname('host1')
            .setPrivateIp('1.2.3.4')
            .setMgmtIp('1.2.3.4');
        const instance2 = new AutoscaleInstance()
            .setIsMaster()
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
        ipcMock.once = function once(...args) {
            functionsCalled.ipc.once = args;
            return q();
        };

        cryptoUtilMock.functionCalls = {};
        cryptoUtilMock.generateRandomBytes = () => {
            return q();
        };
        cryptoUtilMock.generateKeyPair = () => {
            return q();
        };
        cryptoUtilMock.decrypt = function decrypt(...args) {
            cryptoUtilMock.functionCalls.decrypt = args;
            return q();
        };
        cryptoUtilMock.encrypt = function encrypt(...args) {
            cryptoUtilMock.functionCalls.encrypt = args;
            return q();
        };

        dnsProviderFactoryMock.getDnsProvider = () => {
            return gtmDnsProviderMock;
        };

        gtmDnsProviderMock.functionCalls = {};
        gtmDnsProviderMock.init = function init(...args) {
            gtmDnsProviderMock.functionCalls.init = args;
            return q();
        };
        gtmDnsProviderMock.update = function update(...args) {
            gtmDnsProviderMock.functionCalls.update = args;
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

                bigIpMock.loadUcs = function loadUcs(...args) {
                    bigIpMock.functionCalls.loadUcs = args;
                    return q();
                };

                bigIpMock.installPrivateKey = function installPrivateKey(...args) {
                    bigIpMock.functionCalls.installPrivateKey = args;
                    return q();
                };

                bigIpMock.getPrivateKeyFilePath = () => {
                    return q(cloudPrivateKeyPath);
                };

                bigIpMock.getPrivateKeyMetadata = function getPrivateKeyMetadata(...args) {
                    bigIpMock.functionCalls.getPrivateKeyMetadata = args;
                    return q(privateKeyMetadata);
                };

                bigIpMock.cluster = {
                    configSyncIp(...args) {
                        bigIpMock.functionCalls.configSyncIp = args;
                        return q();
                    },
                    createDeviceGroup(...args) {
                        bigIpMock.functionCalls.createDeviceGroup = args;
                        return q();
                    },
                    deleteDeviceGroup() {
                        return q();
                    },
                    joinCluster(...args) {
                        bigIpMock.functionCalls.joinCluster = args;
                        return q();
                    },
                    resetTrust() {
                        return q();
                    }
                };
                callback();
            });

        autoscale = require('../../scripts/autoscale');
    },

    tearDown(callback) {
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
        callback();
    },

    testUndefinedOptions: {
        testNoPassword(test) {
            const passwordUrl = 'https://password';
            argv = ['node', 'autoscale', '--host', '1.2.3.4', '-u', 'foo',
                '--password-url', passwordUrl, '--password', '--log-level', 'none'];

            autoscale.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(autoscale.options.passwordUrl, passwordUrl);
                test.strictEqual(autoscale.options.password, undefined);
                test.done();
            });
        },

        testNoPasswordUrl(test) {
            const password = 'password';
            argv = ['node', 'autoscale', '--host', '1.2.3.4', '-u', 'foo',
                '--password-url', '--password', password, '--log-level', 'none'];

            autoscale.run(argv, testOptions, () => {
                test.expect(2);
                test.strictEqual(autoscale.options.passwordUrl, undefined);
                test.strictEqual(autoscale.options.password, password);
                test.done();
            });
        }
    },

    commonTests: {
        setUp(callback) {
            fsMock.writeFile = (path, data, cb) => {
                cb();
            };
            callback();
        },

        testNoPassword(test) {
            argv = ['node', 'autoscale', '--device-group',
                deviceGroup, '--cloud', 'aws', '--log-level', 'none'];

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(exitCode, 1);
                test.notStrictEqual(exitMessage.indexOf('is required'), -1);
                test.done();
            });
        },

        testWaitFor(test) {
            argv.push('--wait-for', 'foo');

            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.ipc.once[0], 'foo');
                test.done();
            });
        },

        testBackground(test) {
            let runInBackgroundCalled = false;
            cloudUtilMock.runInBackgroundAndExit = () => {
                runInBackgroundCalled = true;
            };

            argv.push('--background');

            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.ok(runInBackgroundCalled);
                test.done();
            });
        },

        testInitCalled(test) {
            argv.push('--provider-options', 'key1:value1,key2:value2');
            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.deepEqual(providerMock.functionCalls.init[0], { key1: 'value1', key2: 'value2' });
                test.done();
            });
        },

        testGetInstancesCalled(test) {
            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.ok(providerMock.functionCalls.getInstances, 'getInstances not called');
                test.done();
            });
        },

        testNoInstances(test) {
            instances = {};
            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(exitCode, 1);
                test.notStrictEqual(exitMessage.indexOf('list is empty'), -1);
                test.done();
            });
        },

        testMissingOurInstance(test) {
            instances = {
                one: {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true
                }
            };

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(exitCode, 1);
                test.notStrictEqual(exitMessage.indexOf('Our instance ID'), -1);
                test.done();
            });
        },

        testBecomingMaster(test) {
            instances = {
                two: {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true,
                    status: 'BECOMING_MASTER'
                }
            };

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(exitCode, 0);
                test.notStrictEqual(exitMessage.indexOf('becoming master'), -1);
                test.done();
            });
        },

        testBadVersion(test) {
            instances = {
                one: {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    version: '2'
                },
                two: {
                    isMaster: true,
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

            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(providerMock.functionCalls.putInstance[1].masterStatus.status,
                    CloudProvider.STATUS_VERSION_NOT_UP_TO_DATE);
                test.done();
            });
        },

        testNotExternal(test) {
            instances = {
                one: {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    external: true
                },
                two: {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true,
                    external: false
                }
            };

            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(providerMock.functionCalls.putInstance[1].masterStatus.status,
                    CloudProvider.STATUS_NOT_EXTERNAL);
                test.done();
            });
        },

        testNotProviderVisible(test) {
            instances = {
                one: {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true
                },
                two: {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: false
                }
            };

            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(providerMock.functionCalls.putInstance[1].masterStatus.status,
                    CloudProvider.STATUS_NOT_IN_CLOUD_LIST);
                test.done();
            });
        },

        testIsValidMasterCalledWithInstances(test) {
            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.ok(providerMock.functionCalls.isValidMaster);
                test.done();
            });
        },

        testElectCalledWithVersionsMarked(test) {
            providerMock.isValidMaster = () => {
                return q(false);
            };

            bigIpMock.deviceInfo = () => {
                return {
                    version: '4.5.6'
                };
            };

            instances = {
                one: {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    version: '1.2.3'
                },
                two: {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true
                }
            };

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(providerMock.functionCalls.instancesSent.one.versionOk, false);
                test.strictEqual(providerMock.functionCalls.instancesSent.two.versionOk, true);
                test.done();
            });
        },

        testElectMasterCalledWithInvalidMaster(test) {
            providerMock.isValidMaster = () => {
                return q(false);
            };
            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.ok(providerMock.functionCalls.electMaster);
                test.done();
            });
        },

        testElectNotCalledWithValidMaster(test) {
            providerMock.isValidMaster = () => {
                return q(true);
            };
            test.expect(1);
            autoscale.run(argv, testOptions, () => {
                test.ifError(providerMock.functionCalls.electMaster);
                test.done();
            });
        },

        testBecomeMaster: {
            setUp(callback) {
                childProcessMock.execFile = (file, args, cb) => {
                    cb();
                };
                callback();
            },

            testLoadUcs: {
                setUp(callback) {
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

                    callback();
                },

                testUpdateScriptFailure(test) {
                    const errorMessage = 'bad script';
                    childProcessMock.execFile = (file, args, cb) => {
                        cb(new Error(errorMessage));
                    };
                    test.expect(2);
                    autoscale.run(argv, testOptions, (err) => {
                        test.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.notStrictEqual(err.message.indexOf(errorMessage), -1);
                        test.done();
                    });
                },

                testMissingFile(test) {
                    missingFilePrefix = '/config/ucsUpdated_';
                    test.expect(2);
                    autoscale.run(argv, testOptions, (err) => {
                        test.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.notStrictEqual(err.message.indexOf('updated ucs not found'), -1);
                        test.done();
                    });
                },

                testLoadUcsFailure(test) {
                    bigIpMock.loadUcs = () => {
                        return q.reject('foo');
                    };
                    test.expect(1);
                    autoscale.run(argv, testOptions, () => {
                        test.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.done();
                    });
                },

                testBuffer(test) {
                    test.expect(1);
                    autoscale.run(argv, testOptions, () => {
                        test.notStrictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.done();
                    });
                },

                testPipe(test) {
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
                    test.expect(1);
                    autoscale.run(argv, testOptions, () => {
                        test.notStrictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.done();
                    });
                }
            },

            testCreateDeviceGroup: {
                testGetHostname(test) {
                    const hostname = 'myNewHostname';

                    instances = {
                        one: {
                            isMaster: false,
                            hostname: 'host1',
                            privateIp: '1.2.3.4',
                            mgmtIp: '1.2.3.4',
                            providerVisible: true
                        },
                        two: {
                            isMaster: true,
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

                    test.expect(1);
                    autoscale.run(argv, testOptions, () => {
                        test.deepEqual(bigIpMock.functionCalls.createDeviceGroup[2], [hostname]);
                        test.done();
                    });
                },

                testAsmProvisioned(test) {
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

                    test.expect(1);
                    autoscale.run(argv, testOptions, () => {
                        test.ok(bigIpMock.functionCalls.createDeviceGroup[3].asmSync);
                        test.done();
                    });
                },

                testAsmNotProvisioned(test) {
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

                    test.expect(1);
                    autoscale.run(argv, testOptions, () => {
                        test.ok(!bigIpMock.functionCalls.createDeviceGroup[3].asmSync);
                        test.done();
                    });
                }

            },
        },

        testDns: {
            setUp(callback) {
                argv.push('--dns', 'gtm', '--dns-app-port', '1234', '--cluster-action', 'update');

                icontrolMock.when('list', '/tm/sys/global-settings', { hostname: 'host2' });
                bigIpMock.cluster.getCmSyncStatus = () => {
                    return q({
                        disconnected: []
                    });
                };

                instances = {
                    one: {
                        isMaster: false,
                        hostname: 'host1',
                        privateIp: '1.2.3.4',
                        publicIp: '11.12.13.14',
                        mgmtIp: '1.2.3.4',
                        providerVisible: true
                    },
                    two: {
                        isMaster: true,
                        hostname: 'host2',
                        privateIp: '5.6.7.8',
                        publicIp: '15.16.17.18',
                        mgmtIp: '5.6.7.8',
                        providerVisible: true
                    }
                };


                callback();
            },

            testInitCall(test) {
                test.expect(1);
                argv.push('--dns-provider-options', 'key1:value1,key2:value2');
                autoscale.run(argv, testOptions, () => {
                    test.deepEqual(
                        gtmDnsProviderMock.functionCalls.init[0],
                        {
                            key1: 'value1',
                            key2: 'value2'
                        }
                    );
                    test.done();
                });
            },

            testPrivate(test) {
                argv.push('--dns-ip-type', 'private');

                autoscale.run(argv, testOptions, () => {
                    const updatedServers = gtmDnsProviderMock.functionCalls.update[0];
                    test.strictEqual(updatedServers.length, 2);
                    test.deepEqual(updatedServers[0], {
                        name: instances.one.hostname,
                        ip: instances.one.privateIp,
                        port: '1234'
                    });
                    test.deepEqual(updatedServers[1], {
                        name: instances.two.hostname,
                        ip: instances.two.privateIp,
                        port: '1234'
                    });
                    test.done();
                });
            },

            testPublic(test) {
                argv.push('--dns-ip-type', 'public');
                autoscale.run(argv, testOptions, () => {
                    const updatedServers = gtmDnsProviderMock.functionCalls.update[0];
                    test.strictEqual(updatedServers.length, 2);
                    test.deepEqual(updatedServers[0], {
                        name: instances.one.hostname,
                        ip: instances.one.publicIp,
                        port: '1234'
                    });
                    test.deepEqual(updatedServers[1], {
                        name: instances.two.hostname,
                        ip: instances.two.publicIp,
                        port: '1234'
                    });
                    test.done();
                });
            }
        }
    },

    updateTests: {
        setUp(callback) {
            argv.push('--cluster-action', 'update');
            bigIpMock.cluster.getCmSyncStatus = () => {
                return q({
                    disconnected: []
                });
            };

            const instance1 = new AutoscaleInstance()
                .setHostname('host1')
                .setPrivateIp('1.2.3.4')
                .setMgmtIp('1.2.3.4');
            const instance2 = new AutoscaleInstance()
                .setIsMaster()
                .setHostname('host2')
                .setPrivateIp('5.6.7.8')
                .setMgmtIp('5.6.7.8');

            instance2.masterStatus = {
                instanceId: 'two'
            };

            instances = {
                one: instance1,
                two: instance2
            };

            callback();
        },

        testSetConfigSync(test) {
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

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(hostname, 'host2');
                test.strictEqual(privateIp, '5.6.7.8');
                test.done();
            });
        },

        testConfigSyncAlreadySet(test) {
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

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(hostname, 'host2');
                test.strictEqual(configSyncIpCalled, false);
                test.done();
            });
        },

        testIsMaster: {
            testDisconnected(test) {
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
                    test.strictEqual(devicesRemoved.length, 2);
                    test.notStrictEqual(devicesRemoved.indexOf('host3'), -1);
                    test.notStrictEqual(devicesRemoved.indexOf('host4'), -1);
                    test.done();
                });
            }
        },

        testIsNotMaster: {
            setUp(callback) {
                instanceId = 'one';
                callback();
            },

            testMasterFileRemoved(test) {
                fsMock.existsSync = () => {
                    return true;
                };

                autoscale.run(argv, testOptions, () => {
                    test.notStrictEqual(unlinkedFiles.indexOf('/config/cloud/master'), -1);
                    test.done();
                });
            }
        }
    },

    joinTests: {
        setUp(callback) {
            argv.push('--cluster-action', 'join');
            callback();
        },

        testConfigSyncCalled(test) {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: 'host2'
                }
            );

            autoscale.run(argv, testOptions, () => {
                test.strictEqual(bigIpMock.functionCalls.configSyncIp[0], instances[instanceId].privateIp);
                test.done();
            });
        },

        testCreateGroupWhenMaster(test) {
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(bigIpMock.functionCalls.createDeviceGroup[0], deviceGroup);
                test.done();
            });
        },

        testCreateGroupOptionsDefaults(test) {
            autoscale.run(argv, testOptions, () => {
                const createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];

                test.expect(5);
                test.strictEqual(createGroupOptions.autoSync, true);
                test.strictEqual(createGroupOptions.asmSync, undefined);
                test.strictEqual(createGroupOptions.networkFailover, undefined);
                test.strictEqual(createGroupOptions.fullLoadOnSync, undefined);
                test.strictEqual(createGroupOptions.saveOnAutoSync, true);
                test.done();
            });
        },

        testCreateGroupOptionsNonDefaults(test) {
            argv.push('--no-auto-sync', '--asm-sync', '--network-failover', '--full-load-on-sync');

            autoscale.run(argv, testOptions, () => {
                const createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];

                test.expect(4);
                test.strictEqual(createGroupOptions.autoSync, false);
                test.strictEqual(createGroupOptions.asmSync, true);
                test.strictEqual(createGroupOptions.networkFailover, true);
                test.strictEqual(createGroupOptions.fullLoadOnSync, true);
                test.done();
            });
        },

        testCreateGroupOptionsNoSaveOnAutoSync(test) {
            argv.push('--no-save-on-auto-sync');

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                const createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];
                test.strictEqual(createGroupOptions.autoSync, true);
                test.strictEqual(createGroupOptions.saveOnAutoSync, false);
                test.done();
            });
        },

        testEncryption: {
            setUp(callback) {
                providerMock.features[CloudProvider.FEATURE_ENCRYPTION] = true;
                callback();
            },

            tearDown(callback) {
                callback();
            },

            testBasic(test) {
                test.expect(1);
                autoscale.run(argv, testOptions, () => {
                    test.notStrictEqual(bigIpMock.functionCalls.installPrivateKey, undefined);
                    test.done();
                });
            }
        }
    },

    unblockSyncTests: {
        setUp(callback) {
            argv.push('--cluster-action', 'unblock-sync');
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: 'host2'
                }
            );

            callback();
        },

        testBasic(test) {
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(bigIpMock.functionCalls.configSyncIp[0], instances[instanceId].privateIp);
                test.done();
            });
        }
    },

    backupUcsTests: {
        setUp(callback) {
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
            callback();
        },

        testBasic(test) {
            autoscale.run(argv, testOptions, () => {
                test.ok(ucsBackupName.startsWith('ucsAutosave_'));
                test.done();
            });
        },

        testOldFilesDeleted(test) {
            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(unlinkedFiles.length, 1);
                test.strictEqual(unlinkedFiles[0], '/var/local/ucs/ucsAutosave_1234.ucs');
                test.done();
            });
        },

        testAjvCleanup(test) {
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

            test.expect(2);
            autoscale.run(argv, testOptions, () => {
                test.strictEqual(renamedFiles.length, 1);
                test.ok(renamedFiles[0].endsWith('ajv/lib/refs/$data.json'));
                test.done();
            });
        }
    },

    messagingTests: {
        setUp(callback) {
            providerMock.features[CloudProvider.FEATURE_MESSAGING] = true;
            argv.push('--cluster-action', 'join');
            callback();
        },

        testIsMaster: {
            testActions(test) {
                autoscale.run(argv, testOptions, () => {
                    test.deepEqual(providerMock.functionCalls.getMessages[0],
                        [CloudProvider.MESSAGE_ADD_TO_CLUSTER]);
                    test.done();
                });
            },

            testAddToCluster(test) {
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

                test.expect(4);
                autoscale.run(argv, testOptions, () => {
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[0], deviceGroupToAdd);
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[1], hostToAdd);
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[2], usernameToAdd);
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[3], passwordToAdd);
                    test.done();
                });
            }
        },

        testIsNotMaster: {
            setUp(callback) {
                instanceId = 'one';
                callback();
            },

            testActions(test) {
                autoscale.run(argv, testOptions, () => {
                    test.deepEqual(providerMock.functionCalls.getMessages[0],
                        [CloudProvider.MESSAGE_SYNC_COMPLETE]);
                    test.done();
                });
            },

            testPrepareEncryptedMessageData(test) {
                const publicKey = 'myPubKey';
                providerMock.features[CloudProvider.FEATURE_ENCRYPTION] = true;
                providerMock.getPublicKey = () => {
                    return q(publicKey);
                };
                autoscale.run(argv, testOptions, () => {
                    test.deepEqual(cryptoUtilMock.functionCalls.encrypt[0], publicKey);
                    test.done();
                });
            }
        },

        testEncrypted: {
            setUp(callback) {
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
                callback();
            },

            testHasKey(test) {
                autoscale.cloudPrivateKeyPath = 'foo';
                test.expect(2);
                autoscale.run(argv, testOptions, () => {
                    test.deepEqual(cryptoUtilMock.functionCalls.decrypt[0], autoscale.cloudPrivateKeyPath);
                    test.deepEqual(
                        cryptoUtilMock.functionCalls.decrypt[2],
                        {
                            passphrase: privateKeyMetadata.passphrase,
                            passphraseEncrypted: true
                        }
                    );
                    test.done();
                });
            },

            testDoesNotHaveKey(test) {
                cloudPrivateKeyPath = 'bar';
                test.expect(2);
                autoscale.run(argv, testOptions, () => {
                    test.deepEqual(cryptoUtilMock.functionCalls.decrypt[0], cloudPrivateKeyPath);
                    test.deepEqual(
                        cryptoUtilMock.functionCalls.decrypt[2],
                        {
                            passphrase: privateKeyMetadata.passphrase,
                            passphraseEncrypted: true
                        }
                    );
                    test.done();
                });
            }
        }
    },

    testNonMessagingTests: {
        setUp(callback) {
            providerMock.features[CloudProvider.FEATURE_MESSAGING] = false;
            argv.push('--cluster-action', 'join');
            callback();
        },

        tearDown(callback) {
            callback();
        },

        testIsNotMaster(test) {
            instanceId = 'one';
            credentials = {
                username: 'myUser',
                password: 'myPassword'
            };
            test.expect(4);
            autoscale.run(argv, testOptions, () => {
                const joinClusterCall = bigIpMock.functionCalls.joinCluster;
                test.strictEqual(joinClusterCall[0], deviceGroup);
                test.strictEqual(joinClusterCall[1], instances.two.mgmtIp);
                test.strictEqual(joinClusterCall[2], credentials.username);
                test.strictEqual(joinClusterCall[3], credentials.password);
                test.done();
            });
        }
    },
    testTagMasterCalled(test) {
        instances = {
            one: {
                isMaster: false,
                hostname: 'host1',
                privateIp: '1.2.3.4',
                mgmtIp: '1.2.3.4',
                providerVisible: true
            },
            two: {
                isMaster: true,
                privateIp: '5.6.7.8',
                mgmtIp: '5.6.7.8',
                providerVisible: true
            }
        };

        test.expect(4);
        autoscale.run(argv, testOptions, () => {
            test.strictEqual(providerMock.functionCalls.taggedMasterInstances.one.isMaster, false);
            test.strictEqual(providerMock.functionCalls.taggedMasterIid, 'two');
            test.notStrictEqual(providerMock.functionCalls.taggedMasterIid, 'one');
            test.ok(providerMock.functionCalls.tagMasterInstance);
            test.done();
        });
    },
};
