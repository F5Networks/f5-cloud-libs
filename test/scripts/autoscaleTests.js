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

var deviceGroup = 'testDeviceGroup';
var util = require('util');
var q = require('q');
var AutoscaleProvider = require('../../lib/autoscaleProvider');
var autoscale;
var fsMock;
var BigIp;
var icontrolMock;
var cloudUtilMock;
var cryptoUtilMock;
var ipcMock;
var dnsProviderFactoryMock;
var gtmDnsProviderMock;
var childProcessMock;
var argv;
var providerMock;
var bigIpMock;
var testOptions;
var instances;
var instanceId;
var exitCode;
var exitMessage;
var messages;
var credentials;
var functionsCalled;
var cloudPrivateKeyPath;
var privateKeyMetadata;

var existsSync;
var unlinkSync;
var writeFile;
var createWriteStream;

var execFile;

var unlinkedFiles;
var missingFilePrefix;

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);
process.setMaxListeners(0);

util.inherits(ProviderMock, AutoscaleProvider);
function ProviderMock() {
    ProviderMock.super_.call(this);
    this.functionCalls = {};
}

ProviderMock.prototype.init = function() {
    this.functionCalls.init = arguments;
    return q();
};

ProviderMock.prototype.putInstance = function() {
    this.functionCalls.putInstance = arguments;
    return q();
};

ProviderMock.prototype.getInstances = function() {
    this.functionCalls.getInstances = true;
    return q(instances);
};

ProviderMock.prototype.getInstanceId = function() {
    this.functionCalls.getInstanceId = true;
    return q(instanceId);
};

ProviderMock.prototype.isValidMaster = function() {
    this.functionCalls.isValidMaster = true;
    return q(true);
};

ProviderMock.prototype.electMaster = function(instances) {
    this.functionCalls.instancesSent = instances;
    this.functionCalls.electMaster = true;
    return q();
};

ProviderMock.prototype.instancesRemoved = function(instances) {
    this.functionCalls.instancesRemoved = instances;
    return q();
};

ProviderMock.prototype.getStoredUcs = function() {
    return q();
};

ProviderMock.prototype.putPublicKey = function() {
    return q();
};

ProviderMock.prototype.getMessages = function() {
    this.functionCalls.getMessages = arguments;
    return q(messages);
};

ProviderMock.prototype.sendMessage = function() {
    this.functionCalls.sendMessage = arguments;
    return q(messages);
};

ProviderMock.prototype.getMasterCredentials = function() {
    this.functionCalls.getMasterCredentials = arguments;
    return q(credentials);
};

ProviderMock.prototype.putMasterCredentials = function() {
    this.functionCalls.putMasterCredentials = arguments;
    return q();
};

module.exports = {
    setUp: function(callback) {
        argv = ['node', 'autoscale', '--password', 'foobar', '--device-group', deviceGroup, '--cloud', 'aws', '--log-level', 'none'];

        instanceId = "two";
        instances = {
            "one": {
                isMaster: false,
                hostname: 'host1',
                privateIp: '1.2.3.4',
                mgmtIp: '1.2.3.4',
                providerVisible: true
            },
            "two": {
                isMaster: true,
                hostname: 'host2',
                privateIp: '5.6.7.8',
                mgmtIp: '5.6.7.8',
                providerVisible: true
            }
        };

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
        cloudUtilMock.logAndExit = function(message, level, code) {
            exitMessage = message;
            if (code) {
                exitCode = code;
                throw new Error('exit with code ' + exitCode);
            }
        };
        cloudUtilMock.saveArgs = function() {
            return q();
        };

        existsSync = fsMock.existsSync;
        unlinkSync = fsMock.unlinkSync;
        writeFile = fsMock.writeFile;
        createWriteStream = fsMock.createWriteStream;

        execFile = childProcessMock.execFile;

        fsMock.writeFile = function(path, data, cb) {
            cb();
        };
        fsMock.unlinkSync = function() {};

        providerMock = new ProviderMock();

        // Just resolve right away, otherwise these tests never exit
        ipcMock.once = function() {
            functionsCalled.ipc.once = arguments;
            return q();
        };

        cryptoUtilMock.functionCalls = {};
        cryptoUtilMock.generateRandomBytes = function() {
            return q();
        };
        cryptoUtilMock.generateKeyPair = function() {
            return q();
        };
        cryptoUtilMock.decrypt = function() {
            cryptoUtilMock.functionCalls.decrypt = arguments;
            return q();
        };
        cryptoUtilMock.encrypt = function() {
            cryptoUtilMock.functionCalls.encrypt = arguments;
            return q();
        };

        dnsProviderFactoryMock.getDnsProvider = function() {
            return gtmDnsProviderMock;
        };

        gtmDnsProviderMock.functionCalls = {};
        gtmDnsProviderMock.init = function() {
            gtmDnsProviderMock.functionCalls.init = arguments;
            return q();
        };
        gtmDnsProviderMock.update = function() {
            gtmDnsProviderMock.functionCalls.update = arguments;
        };

        functionsCalled = {
            ipc: {}
        };

        bigIpMock = new BigIp();
        bigIpMock.init('localhost', 'admin', 'admin')
            .then(function() {
                bigIpMock.icontrol = icontrolMock;

                icontrolMock.reset();

                testOptions = {
                    bigIp: bigIpMock,
                    autoscaleProvider: providerMock
                };

                bigIpMock.functionCalls = {};

                bigIpMock.ready = function() {
                    return q();
                };

                bigIpMock.save = function() {
                    return q();
                };

                bigIpMock.loadUcs = function() {
                    bigIpMock.functionCalls.loadUcs = arguments;
                    return q();
                };

                bigIpMock.installPrivateKey = function() {
                    bigIpMock.functionCalls.installPrivateKey = arguments;
                    return q();
                };

                bigIpMock.getPrivateKeyFilePath = function() {
                    return q(cloudPrivateKeyPath);
                };

                bigIpMock.getPrivateKeyMetadata = function() {
                    bigIpMock.functionCalls.getPrivateKeyMetadata = arguments;
                    return q(privateKeyMetadata);
                };

                bigIpMock.cluster = {
                    configSyncIp: function() {
                        bigIpMock.functionCalls.configSyncIp = arguments;
                        return q();
                    },
                    createDeviceGroup: function() {
                        bigIpMock.functionCalls.createDeviceGroup = arguments;
                        return q();
                    },
                    deleteDeviceGroup: function() {
                        return q();
                    },
                    joinCluster: function() {
                        bigIpMock.functionCalls.joinCluster = arguments;
                        return q();
                    },
                    resetTrust: function() {
                        return q();
                    }
                };

                callback();
            });

        autoscale  = require('../../scripts/autoscale');
    },

    tearDown: function(callback) {
        fsMock.existsSync = existsSync;
        fsMock.unlinkSync = unlinkSync;
        fsMock.writeFile = writeFile;
        fsMock.createWriteStream = createWriteStream;

        childProcessMock.execFile = execFile;

        cloudUtilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });
        callback();
    },

    commonTests: {
        setUp: function(callback) {
            fsMock.writeFile = function(path, data, cb) {
                cb();
            };
            callback();
        },

        testNoPassword: function(test) {
            argv = ['node', 'autoscale', '--device-group', deviceGroup, '--cloud', 'aws', '--log-level', 'none'];

            test.expect(2);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(exitCode, 1);
                test.notStrictEqual(exitMessage.indexOf('is required'), -1);
                test.done();
            });
        },

        testWaitFor: function(test) {
            argv.push('--wait-for', 'foo');

            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(functionsCalled.ipc.once[0], 'foo');
                test.done();
            });
        },

        testBackground: function(test) {
            var runInBackgroundCalled = false;
            cloudUtilMock.runInBackgroundAndExit = function() {
                runInBackgroundCalled = true;
            };

            argv.push('--background');

            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.ok(runInBackgroundCalled);
                test.done();
            });
        },

        testInitCalled: function(test) {
            argv.push('--provider-options', 'key1:value1,key2:value2');
            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.deepEqual(providerMock.functionCalls.init[0], {key1: 'value1', key2: 'value2'});
                test.done();
            });
        },

        testGetInstancesCalled: function(test) {
            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.ok(providerMock.functionCalls.getInstances, "getInstances not called");
                test.done();
            });
        },

        testNoInstances: function(test) {
            instances = {};
            test.expect(2);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(exitCode, 1);
                test.notStrictEqual(exitMessage.indexOf('list is empty'), -1);
                test.done();
            });
        },

        testMissingOurInstance: function(test) {
            instances = {
                "one": {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true
                }
            };

            test.expect(2);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(exitCode, 1);
                test.notStrictEqual(exitMessage.indexOf('Our instance ID'), -1);
                test.done();
            });
        },

        testBecomingMaster: function(test) {
            instances = {
                "two": {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true,
                    status: 'BECOMING_MASTER'
                }
            };

            test.expect(2);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(exitCode, 0);
                test.notStrictEqual(exitMessage.indexOf('becoming master'), -1);
                test.done();
            });
        },

        testBadVersion: function(test) {
            instances = {
                "one": {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    version: '2'
                },
                "two": {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true
                }
            };

            bigIpMock.deviceInfo = function() {
                return {
                    version: '1'
                };
            };

            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(providerMock.functionCalls.putInstance[1].masterStatus.status, AutoscaleProvider.STATUS_VERSION_NOT_UP_TO_DATE);
                test.done();
            });
        },

        testNotExternal: function(test) {
            instances = {
                "one": {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    external: true
                },
                "two": {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true,
                    external: false
                }
            };

            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(providerMock.functionCalls.putInstance[1].masterStatus.status, AutoscaleProvider.STATUS_NOT_EXTERNAL);
                test.done();
            });
        },

        testNotProviderVisible: function(test) {
            instances = {
                "one": {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true
                },
                "two": {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: false
                }
            };

            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(providerMock.functionCalls.putInstance[1].masterStatus.status, AutoscaleProvider.STATUS_NOT_IN_CLOUD_LIST);
                test.done();
            });
        },

        testIsValidMasterCalledWithInstances: function(test) {
            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.ok(providerMock.functionCalls.isValidMaster);
                test.done();
            });
        },

        testElectCalledWithVersionsMarked: function(test) {
            providerMock.isValidMaster = function() {
                return q(false);
            };

            bigIpMock.deviceInfo = function() {
                return {
                    version: '4.5.6'
                };
            };

            instances = {
                "one": {
                    isMaster: false,
                    hostname: 'host1',
                    privateIp: '1.2.3.4',
                    providerVisible: true,
                    version: '1.2.3'
                },
                "two": {
                    isMaster: true,
                    hostname: 'host2',
                    privateIp: '5.6.7.8',
                    providerVisible: true
                }
            };

            test.expect(2);
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(providerMock.functionCalls.instancesSent.one.versionOk, false);
                test.strictEqual(providerMock.functionCalls.instancesSent.two.versionOk, true);
                test.done();
            });
        },

        testElectMasterCalledWithInvalidMaster: function(test) {
            providerMock.isValidMaster = function() {
                return q(false);
            };
            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.ok(providerMock.functionCalls.electMaster);
                test.done();
            });
        },

        testElectNotCalledWithValidMaster: function(test) {
            providerMock.isValidMaster = function() {
                return q(true);
            };
            test.expect(1);
            autoscale.run(argv, testOptions, function() {
                test.ifError(providerMock.functionCalls.electMaster);
                test.done();
            });
        },

        testBecomeMaster: {
            setUp: function(callback) {
                childProcessMock.execFile = function(file, args, cb) {
                    cb();
                };
                callback();
            },

            testLoadUcs: {
                setUp: function(callback) {
                    missingFilePrefix = undefined;
                    fsMock.existsSync = function(file) {
                        if (file.startsWith(missingFilePrefix)) {
                            return false;
                        }
                        return true;
                    };
                    providerMock.getStoredUcs = function() {
                        return q({});
                    };
                    cloudUtilMock.runShellCommand = function() {
                        return q();
                    }
                    cloudUtilMock.runTmshCommand = function() {
                        return q();
                    }

                    callback();
                },

                testUpdateScriptFailure: function(test) {
                    const errorMessage = 'bad script';
                    childProcessMock.execFile = function(file, args, cb) {
                        cb(new Error(errorMessage));
                    };
                    test.expect(2);
                    autoscale.run(argv, testOptions, function(err) {
                        test.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.notStrictEqual(err.message.indexOf(errorMessage), -1);
                        test.done();
                    });
                },

                testMissingFile: function(test) {
                    missingFilePrefix = '/config/ucsUpdated_';
                    test.expect(2);
                    autoscale.run(argv, testOptions, function(err) {
                        test.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.notStrictEqual(err.message.indexOf('updated ucs not found'), -1);
                        test.done();
                    });
                },

                testLoadUcsFailure: function(test) {
                    bigIpMock.loadUcs = function() {
                        return q.reject('foo');
                    };
                    test.expect(1);
                    autoscale.run(argv, testOptions, function() {
                        test.strictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.done();
                    });
                },

                testBuffer: function(test) {
                    test.expect(1);
                    autoscale.run(argv, testOptions, function() {
                        test.notStrictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.done();
                    });
                },

                testPipe: function(test) {
                    providerMock.getStoredUcs = function() {
                        return q({
                            pipe: function() {},
                            on: function() {}
                        });
                    };
                    fsMock.createWriteStream = function() {
                        return {
                            on: function(event, cb) {
                                cb();
                            },
                            close: function(cb) {
                                cb();
                            }
                        };
                    };
                    test.expect(1);
                    autoscale.run(argv, testOptions, function() {
                        test.notStrictEqual(bigIpMock.functionCalls.loadUcs, undefined);
                        test.done();
                    });
                }
            },

            testGetHostname: function(test) {
                var hostname = 'myNewHostname';

                instances = {
                    "one": {
                        isMaster: false,
                        hostname: 'host1',
                        privateIp: '1.2.3.4',
                        mgmtIp: '1.2.3.4',
                        providerVisible: true
                    },
                    "two": {
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
                        hostname: hostname
                    }
                );

                test.expect(1);
                autoscale.run(argv, testOptions, function() {
                    test.deepEqual(bigIpMock.functionCalls.createDeviceGroup[2], [hostname]);
                    test.done();
                });
            }
        },

        testDns: {
            setUp: function(callback) {
                argv.push('--dns', 'gtm', '--dns-app-port', '1234', '--cluster-action', 'update');

                bigIpMock.cluster.getCmSyncStatus = function() {
                    return q({
                        disconnected: []
                    });
                };

                instances = {
                    "one": {
                        isMaster: false,
                        hostname: 'host1',
                        privateIp: '1.2.3.4',
                        publicIp: '11.12.13.14',
                        mgmtIp: '1.2.3.4',
                        providerVisible: true
                    },
                    "two": {
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

            testInitCall: function(test) {
                test.expect(1);
                argv.push('--dns-provider-options', 'key1:value1,key2:value2');
                autoscale.run(argv, testOptions, function() {
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

            testPrivate: function(test) {
                argv.push('--dns-ip-type', 'private');

                autoscale.run(argv, testOptions, function() {
                    var updatedServers = gtmDnsProviderMock.functionCalls.update[0];
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

            testPublic: function(test) {
                argv.push('--dns-ip-type', 'public');
                autoscale.run(argv, testOptions, function() {
                    var updatedServers = gtmDnsProviderMock.functionCalls.update[0];
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
        setUp: function(callback) {
            argv.push('--cluster-action', 'update');
            callback();
        },

        testIsMaster: {
            testDisconnected: function(test) {
                var devicesRemoved = [];
                bigIpMock.cluster.getCmSyncStatus = function() {
                    return q({
                        disconnected: ["host1", "host2", "host3", "host4"]
                    });
                };
                bigIpMock.cluster.removeFromCluster = function(devices) {
                    devicesRemoved = devices;
                    return q();
                };

                argv.push('--host', 'host', '--user', 'user', '--password', 'password');

                // We expect that host3 and host4 will be removed. host1 will not because the cloud provider
                // says it is still in the list of known instances
                autoscale.run(argv, testOptions, function() {
                    test.strictEqual(devicesRemoved.length, 2);
                    test.notStrictEqual(devicesRemoved.indexOf('host3'), -1);
                    test.notStrictEqual(devicesRemoved.indexOf('host4'), -1);
                    test.done();
                });
            }
        },

        testIsNotMaster: {
            setUp: function(callback) {
                instanceId = "one";
                unlinkedFiles = [];
                fsMock.unlinkSync = function(file) {
                    unlinkedFiles.push(file);
                };
                callback();
            },

            testMasterFileRemoved: function(test) {
                fsMock.existsSync = function() {
                    return true;
                };

                autoscale.run(argv, testOptions, function() {
                    test.notStrictEqual(unlinkedFiles.indexOf('/config/cloud/master'), -1);
                    test.done();
                });
            }
        }
    },

    joinTests: {
        setUp: function(callback) {
            argv.push('--cluster-action', 'join');
            callback();
        },

        testConfigSyncCalled: function(test) {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname: 'host2'
                }
            );

            autoscale.run(argv, testOptions, function() {
                test.strictEqual(bigIpMock.functionCalls.configSyncIp[0], instances[instanceId].privateIp);
                test.done();
            });
        },

        testCreateGroupWhenMaster: function(test) {
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(bigIpMock.functionCalls.createDeviceGroup[0], deviceGroup);
                test.done();
            });
        },

        testCreateGroupOptionsDefaults: function(test) {
            autoscale.run(argv, testOptions, function() {
                var createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];

                test.expect(5);
                test.strictEqual(createGroupOptions.autoSync, true);
                test.strictEqual(createGroupOptions.asmSync, undefined);
                test.strictEqual(createGroupOptions.networkFailover, undefined
                );
                test.strictEqual(createGroupOptions.fullLoadOnSync, undefined
                );
                test.strictEqual(createGroupOptions.saveOnAutoSync, true);
                test.done();
            });
        },

        testCreateGroupOptionsNonDefaults: function(test) {
            argv.push('--no-auto-sync', '--asm-sync', '--network-failover', '--full-load-on-sync');

            autoscale.run(argv, testOptions, function() {
                var createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];

                test.expect(4);
                test.strictEqual(createGroupOptions.autoSync, false);
                test.strictEqual(createGroupOptions.asmSync, true);
                test.strictEqual(createGroupOptions.networkFailover, true);
                test.strictEqual(createGroupOptions.fullLoadOnSync, true);
                test.done();
            });
        },

        testCreateGroupOptionsNoSaveOnAutoSync: function(test) {
            argv.push('--no-save-on-auto-sync');

            test.expect(2);
            autoscale.run(argv, testOptions, function() {
                var createGroupOptions = bigIpMock.functionCalls.createDeviceGroup[3];
                test.strictEqual(createGroupOptions.autoSync, true);
                test.strictEqual(createGroupOptions.saveOnAutoSync, false);
                test.done();
            });
        },

        testEncryption: {
            setUp: function(callback) {
                providerMock.features[AutoscaleProvider.FEATURE_ENCRYPTION] = true;
                callback();
            },

            tearDown: function(callback) {
                callback();
            },

            testBasic: function(test) {
                test.expect(1);
                autoscale.run(argv, testOptions, function() {
                    test.notStrictEqual(bigIpMock.functionCalls.installPrivateKey, undefined);
                    test.done();
                });
            }
        }
    },

    unblockSyncTests: {
        setUp: function(callback) {
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

        testBasic: function(test) {
            autoscale.run(argv, testOptions, function() {
                test.strictEqual(bigIpMock.functionCalls.configSyncIp[0], instances[instanceId].privateIp);
                test.done();
            });
        }
    },

    messagingTests: {
        setUp: function(callback) {
            providerMock.features[AutoscaleProvider.FEATURE_MESSAGING] = true;
            argv.push('--cluster-action', 'join');
            callback();
        },

        testIsMaster: {
            testActions: function(test) {
                autoscale.run(argv, testOptions, function() {
                    test.deepEqual(providerMock.functionCalls.getMessages[0], [AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER]);
                    test.done();
                });
            },

            testAddToCluster: function(test) {
                const deviceGroupToAdd = 'addDeviceGroup';
                const hostToAdd = 'addHost';
                const usernameToAdd = 'addUserName';
                const passwordToAdd = 'addPassword';
                providerMock.getMessages = function() {
                    const messageData = JSON.stringify(
                        {
                            deviceGroup: deviceGroupToAdd,
                            host: hostToAdd,
                            username: usernameToAdd,
                            password: passwordToAdd
                        }
                    );
                    const messages = [
                        {
                            action: AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER,
                            data: messageData
                        }
                    ];
                    return q(messages);
                };

                test.expect(4);
                autoscale.run(argv, testOptions, function() {
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[0], deviceGroupToAdd);
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[1], hostToAdd);
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[2], usernameToAdd);
                    test.strictEqual(bigIpMock.functionCalls.joinCluster[3], passwordToAdd);
                    test.done();
                });
            }
        },

        testIsNotMaster: {
            setUp: function(callback) {
                instanceId = "one";
                callback();
            },

            testActions: function(test) {
                autoscale.run(argv, testOptions, function() {
                    test.deepEqual(providerMock.functionCalls.getMessages[0], [AutoscaleProvider.MESSAGE_SYNC_COMPLETE]);
                    test.done();
                });
            },

            testPrepareEncryptedMessageData: function(test) {
                const publicKey = 'myPubKey';
                providerMock.features[AutoscaleProvider.FEATURE_ENCRYPTION] = true;
                providerMock.getPublicKey = function() {
                    return q(publicKey);
                };
                autoscale.run(argv, testOptions, function() {
                    test.deepEqual(cryptoUtilMock.functionCalls.encrypt[0], publicKey);
                    test.done();
                });
            }
        },

        testEncrypted: {
            setUp: function(callback) {
                providerMock.features[AutoscaleProvider.FEATURE_ENCRYPTION] = true;
                providerMock.getMessages = function() {
                    const messages = [
                        {
                            action: AutoscaleProvider.MESSAGE_ADD_TO_CLUSTER,
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

            testHasKey: function(test) {
                autoscale.cloudPrivateKeyPath = 'foo';
                test.expect(2);
                autoscale.run(argv, testOptions, function() {
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

            testDoesNotHaveKey: function(test) {
                cloudPrivateKeyPath = 'bar';
                test.expect(2);
                autoscale.run(argv, testOptions, function() {
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
        setUp: function(callback) {
            providerMock.features[AutoscaleProvider.FEATURE_MESSAGING] = false;
            argv.push('--cluster-action', 'join');
            callback();
        },

        tearDown: function(callback) {
            callback();
        },

        testIsNotMaster: function(test) {
            instanceId = "one";
            credentials = {
                username: 'myUser',
                password: 'myPassword'
            };
            test.expect(4);
            autoscale.run(argv, testOptions, function() {
                var joinClusterCall = bigIpMock.functionCalls.joinCluster;
                test.strictEqual(joinClusterCall[0], deviceGroup);
                test.strictEqual(joinClusterCall[1], instances.two.mgmtIp);
                test.strictEqual(joinClusterCall[2], credentials.username);
                test.strictEqual(joinClusterCall[3], credentials.password);
                test.done();
            });
        }
    }
};
