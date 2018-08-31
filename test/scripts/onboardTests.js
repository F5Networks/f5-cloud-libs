/**
 * Copyright 2016 F5 Networks, Inc.
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

const realExit = process.exit;

const fs = require('fs');
const q = require('q');
const util = require('util');
const ActiveError = require('../../../f5-cloud-libs').activeError;
const CloudProvider = require('../../lib/cloudProvider');
const signals = require('../../../f5-cloud-libs').signals;

let metricsCollectorMock;

let rebootCalled = false;
let signalInstanceProvisionedCalled = false;
let functionsCalled;
let onboard;
let ipcMock;
let utilMock;
let exitMessage;
let exitCode;
let logErrorMessage;
let logErrorOptions;

let bigIpMock;
let providerMock;

const testOptions = {};

let argv;
let rebootRequested;
let signalsSent;

// Our tests cause too many event listeners. Turn off the check.
const options = require('commander');

options.setMaxListeners(0);

util.inherits(ProviderMock, CloudProvider);
function ProviderMock() {
    ProviderMock.super_.call(this);
    this.functionCalls = {};
}

ProviderMock.prototype.init = function init(...args) {
    this.functionCalls.init = args;
    return q();
};

ProviderMock.prototype.signalInstanceProvisioned = () => {
    signalInstanceProvisionedCalled = true;
    return q();
};

module.exports = {
    setUp(callback) {
        bigIpMock = {
            init(...args) {
                functionsCalled.bigIp.init = args;
                return q();
            },

            isBigIp() {
                return true;
            },

            isBigIq() {
                return false;
            },

            list(...args) {
                functionsCalled.bigIp.list = args;
                return q();
            },

            modify(...args) {
                functionsCalled.bigIp.modify = args;
                return q();
            },

            create(...args) {
                functionsCalled.bigIp.create = args;
                return q();
            },

            delete(...args) {
                functionsCalled.bigIp.delete = args;
                return q();
            },

            ready(...args) {
                functionsCalled.bigIp.ready = args;
                return q();
            },

            save(...args) {
                functionsCalled.bigIp.save = args;
                return q();
            },

            active(...args) {
                functionsCalled.bigIp.active = args;
                return q();
            },

            ping(...args) {
                functionsCalled.bigIp.ping = args;
                return q();
            },

            rebootRequired(...args) {
                functionsCalled.bigIp.rebootRequired = args;
                return q(false);
            },

            reboot(...args) {
                functionsCalled.bigIp.reboot = args;
                rebootRequested = true;
                return q();
            },

            onboard: {
                globalSettings(...args) {
                    functionsCalled.bigIp.onboard.globalSettings = args;
                    return q();
                },

                license(...args) {
                    functionsCalled.bigIp.onboard.license = args;
                    return q();
                },

                licenseViaBigIq(...args) {
                    functionsCalled.bigIp.onboard.licenseViaBigIq = args;
                    return q();
                },

                password(...args) {
                    functionsCalled.bigIp.onboard.password = args;
                    return q();
                },

                provision(...args) {
                    functionsCalled.bigIp.onboard.provision = args;
                    return q();
                },

                setDbVars(...args) {
                    functionsCalled.bigIp.onboard.setDbVars = args;
                    return q();
                },

                updateUser(user, password, role, shell, ...args) {
                    functionsCalled.bigIp.onboard.updateUser = args;
                    this.updatedUsers = this.updatedUsers || [];
                    this.updatedUsers.push({
                        user,
                        password,
                        role,
                        shell
                    });

                    return q();
                },

                sslPort(...args) {
                    functionsCalled.bigIp.onboard.sslPort = args;
                    return q();
                }
            }
        };

        testOptions.bigIp = bigIpMock;

        signalsSent = [];

        /* eslint-disable global-require */
        ipcMock = require('../../lib/ipc');

        ipcMock.once = function once(...args) {
            const deferred = q.defer();
            functionsCalled.ipc.once = args;
            return deferred.promise;
        };

        ipcMock.send = (signal) => {
            signalsSent.push(signal);
        };

        utilMock = require('../../lib/util');
        onboard = require('../../scripts/onboard');
        metricsCollectorMock = require('../../../f5-cloud-libs').metricsCollector;

        argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];
        rebootRequested = false;
        functionsCalled = {
            bigIp: {
                onboard: {}
            },
            ipc: {},
            metrics: {}
        };

        utilMock.logAndExit = (message, level, code) => {
            exitMessage = message;
            exitCode = code;
        };
        utilMock.logError = (msg, opts) => {
            logErrorMessage = msg;
            logErrorOptions = opts;
        };
        exitMessage = '';
        exitCode = undefined;

        metricsCollectorMock.upload = function upload(...args) {
            functionsCalled.metrics.upload = args;
            return q();
        };

        callback();
    },

    tearDown(callback) {
        process.exit = realExit;
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        callback();
    },

    testRequiredOptions: {
        testNoHost(test) {
            argv = ['node', 'onboard', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

            test.expect(4);
            onboard.run(argv, testOptions, () => {
                test.notStrictEqual(exitMessage.indexOf('host'), -1);
                test.notStrictEqual(logErrorMessage.indexOf('host'), -1);
                test.strictEqual(logErrorOptions.logLevel, 'none');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testNoPassword(test) {
            argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '--log-level', 'none'];

            test.expect(4);
            onboard.run(argv, testOptions, () => {
                test.notStrictEqual(exitMessage.indexOf('password'), -1);
                test.notStrictEqual(logErrorMessage.indexOf('password'), -1);
                test.strictEqual(logErrorOptions.logLevel, 'none');
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testWaitFor(test) {
        argv.push('--wait-for', 'foo');

        ipcMock.once = function once(...args) {
            functionsCalled.ipc.once = args;
            return q();
        };

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.strictEqual(functionsCalled.ipc.once[0], 'foo');
            test.done();
        });
    },

    testBackground(test) {
        let runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = () => {
            runInBackgroundCalled = true;
        };

        argv.push('--background');

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.ok(runInBackgroundCalled);
            test.done();
        });
    },

    testExceptionSignalsError(test) {
        const sentSignals = [];

        utilMock.createRandomUser = () => {
            return q.reject('err');
        };

        argv = ['node', 'onboard', '--host', '1.2.3.4', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.includes(signal)) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.deepEqual(sentSignals, [signals.ONBOARD_RUNNING, signals.CLOUD_LIBS_ERROR]);
            test.done();
        });
    },

    testSignalDone(test) {
        const sentSignals = [];

        argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.includes(signal)) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        test.expect(2);
        onboard.run(argv, testOptions, () => {
            test.deepEqual(sentSignals, [signals.ONBOARD_RUNNING, signals.ONBOARD_DONE]);
            test.ok(!sentSignals.includes(signals.CLOUD_LIBS_ERROR), 'Done should not include error');
            test.done();
        });
    },

    testNoUser(test) {
        argv = ['node', 'onboard', '--host', '1.2.3.4', '-p', 'bar', '--log-level', 'none'];

        const randomUser = 'my random user';
        let userCreated;
        let userDeleted;
        utilMock.createRandomUser = () => {
            userCreated = true;
            return q({
                user: randomUser
            });
        };
        utilMock.deleteUser = (user) => {
            userDeleted = user;
        };
        test.expect(2);
        onboard.run(argv, testOptions, () => {
            test.ok(userCreated);
            test.strictEqual(userDeleted, randomUser);
            test.done();
        });
    },

    testGlobalSettings: {
        testHostname(test) {
            let hostnameSet;
            bigIpMock.onboard.hostname = (hostname) => {
                hostnameSet = hostname;
            };

            argv.push('--hostname', 'hostname1', '--global-setting', 'hostname:hostname2');

            test.expect(2);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(hostnameSet, 'hostname1');
                test.strictEqual(functionsCalled.bigIp.onboard.globalSettings[0].hostname, undefined);
                test.done();
            });
        },

        testIsBigIp(test) {
            test.expect(2);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.onboard.globalSettings[0].guiSetup, 'disabled');
                test.strictEqual(functionsCalled.bigIp.modify, undefined);
                test.done();
            });
        },

        testIsBigIq(test) {
            bigIpMock.isBigIq = () => {
                return true;
            };
            bigIpMock.isBigIp = () => {
                return false;
            };

            test.expect(2);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.onboard.globalSettings, undefined);
                test.deepEqual(
                    functionsCalled.bigIp.modify[1],
                    {
                        isSystemSetup: true,
                        isRootPasswordChanged: true,
                        isAdminPasswordChanged: true
                    }
                );
                test.done();
            });
        }
    },

    testReboot(test) {
        bigIpMock.rebootRequired = function rebootRequired(...args) {
            functionsCalled.bigIp.rebootRequired = args;
            return q(true);
        };

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.ok(rebootRequested);
            test.done();
        });
    },

    testNoReboot(test) {
        argv.push('--no-reboot');

        bigIpMock.rebootRequired = function rebootRequired(...args) {
            functionsCalled.bigIp.rebootRequired = args;
            return q(true);
        };

        test.expect(2);
        onboard.run(argv, testOptions, () => {
            test.ifError(rebootRequested);
            test.notStrictEqual(signalsSent.indexOf('REBOOT_REQUIRED'), -1);
            test.done();
        });
    },

    testProvider: {
        setUp(callback) {
            providerMock = new ProviderMock();
            testOptions.cloudProvider = providerMock;

            signalInstanceProvisionedCalled = false;

            callback();
        },

        testSignalInstanceProvisioned(test) {
            argv.push('--cloud', 'aws', '--signal-resource');

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(signalInstanceProvisionedCalled, true);
                test.done();
            });
        },

        testOnboardNoSignal(test) {
            argv.push('--cloud', 'aws');

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(signalInstanceProvisionedCalled, false);
                test.done();
            });
        }

    },

    testSslPortArgs: {
        setUp(callback) {
            utilMock.deleteArgs = () => { };
            Date.now = () => {
                return '1234';
            };
            callback();
        },

        testNoPort(test) {
            argv.push('--ssl-port', '8443');

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                const argsFile = fs.readFileSync('/tmp/rebootScripts/onboard_1234.sh');
                test.notStrictEqual(argsFile.indexOf('--port 8443'), -1);
                test.done();
            });
        },

        testPort(test) {
            argv.push('--port', '443', '--ssl-port', '8443');

            test.expect(2);
            onboard.run(argv, testOptions, () => {
                const argsFile = fs.readFileSync('/tmp/rebootScripts/onboard_1234.sh');
                test.strictEqual(argsFile.indexOf('--port 443'), -1);
                test.notStrictEqual(argsFile.indexOf('--port 8443'), -1);
                test.done();
            });
        }
    },

    testRootPassword: {
        testBasic(test) {
            argv.push('--set-root-password', 'old:myOldPassword,new:myNewPassword');

            test.expect(3);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.onboard.password[0], 'root');
                test.strictEqual(functionsCalled.bigIp.onboard.password[1], 'myNewPassword');
                test.strictEqual(functionsCalled.bigIp.onboard.password[2], 'myOldPassword');
                test.done();
            });
        },

        testMissingNew(test) {
            argv.push('--set-root-password', 'old:myOldPassword,new:');

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                test.done();
            });
        },

        testMissingOld(test) {
            argv.push('--set-root-password', 'old:,new:myNewPassword');

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                test.done();
            });
        },

        testMissingBoth(test) {
            argv.push('--set-root-password', 'foo:myOldPassword,bar:myNewPassword');

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                test.done();
            });
        }
    },

    testUpdateUser(test) {
        argv.push('--update-user', 'user:user1,password:pass1,role:role1,shell:shell1',
            '--update-user', 'user:user2,password:pass2,shell:shell2');
        onboard.run(argv, testOptions, () => {
            test.strictEqual(bigIpMock.onboard.updatedUsers.length, 2);
            test.deepEqual(bigIpMock.onboard.updatedUsers[0], {
                user: 'user1',
                password: 'pass1',
                role: 'role1',
                shell: 'shell1'
            });
            test.deepEqual(bigIpMock.onboard.updatedUsers[1], {
                user: 'user2',
                password: 'pass2',
                role: undefined,
                shell: 'shell2'
            });
            test.done();
        });
    },

    testNtp: {
        testNtp(test) {
            const ntpServer = 'ntp.server1';
            argv.push('--ntp', ntpServer);

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.deepEqual(functionsCalled.bigIp.modify[1], { servers: [ntpServer] });
                test.done();
            });
        },

        testTz(test) {
            const tz = 'myTimezone';
            argv.push('--tz', tz);

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.deepEqual(functionsCalled.bigIp.modify[1], { timezone: tz });
                test.done();
            });
        }
    },

    testDns(test) {
        const dns = 'mydns.com';
        argv.push('--dns', dns);

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.deepEqual(functionsCalled.bigIp.modify[1], { 'name-servers': [dns] });
            test.done();
        });
    },

    testDbVars(test) {
        const dbVar1 = 'key1:value1';
        const dbVar2 = 'key2:value2';

        argv.push('--db', dbVar1, '--db', dbVar2);

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.deepEqual(functionsCalled.bigIp.onboard.setDbVars[0], { key1: 'value1', key2: 'value2' });
            test.done();
        });
    },

    testLicense: {
        testRegKey(test) {
            const regKey = '123345';

            argv.push('--license', regKey);

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.deepEqual(
                    functionsCalled.bigIp.onboard.license[0],
                    {
                        registrationKey: regKey,
                        addOnKeys: [],
                        overwrite: true
                    }
                );
                test.done();
            });
        },

        testAddOnKeys(test) {
            const addOnKey1 = 'addOn1';
            const addOnKey2 = 'addOn2';

            argv.push('--add-on', addOnKey1, '--add-on', addOnKey2);

            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.deepEqual(
                    functionsCalled.bigIp.onboard.license[0],
                    {
                        registrationKey: undefined,
                        addOnKeys: [addOnKey1, addOnKey2],
                        overwrite: true
                    }
                );
                test.done();
            });
        },

        testLicenseViaBigIq: {
            testBasic(test) {
                const bigIqHost = 'myBigIq';
                const bigIqUser = 'myBigIqUser';
                const bigIqPassword = 'myBigIqPassword';
                const licensePool = 'myLicensePool';
                const bigIpMgmtAddress = 'myMgmtAddress';
                const bigIpMgmtPort = '1234';
                const skuKeyword1 = 'mySku1';
                const skuKeyword2 = 'mySku2';
                const unitOfMeasure = 'myUnitOfMeasure';
                const cloud = 'myCloud';

                argv.push(
                    '--license-pool',
                    '--big-iq-host', bigIqHost,
                    '--big-iq-user', bigIqUser,
                    '--big-iq-password', bigIqPassword,
                    '--big-iq-password-encrypted',
                    '--license-pool-name', licensePool,
                    '--big-ip-mgmt-address', bigIpMgmtAddress,
                    '--big-ip-mgmt-port', bigIpMgmtPort,
                    '--sku-keyword-1', skuKeyword1,
                    '--sku-keyword-2', skuKeyword2,
                    '--unit-of-measure', unitOfMeasure,
                    '--cloud', cloud
                );

                test.expect(6);
                onboard.run(argv, testOptions, () => {
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[0], bigIqHost);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[1], bigIqUser);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[2], bigIqPassword);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[3], licensePool);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[4], cloud);
                    test.deepEqual(
                        functionsCalled.bigIp.onboard.licenseViaBigIq[5],
                        {
                            passwordIsUri: false,
                            passwordEncrypted: true,
                            bigIpMgmtAddress,
                            bigIpMgmtPort,
                            skuKeyword1,
                            skuKeyword2,
                            unitOfMeasure,
                            noUnreachable: false
                        }
                    );
                    test.done();
                });
            },

            testNoUnreachable(test) {
                const bigIqHost = 'myBigIq';
                const bigIqUser = 'myBigIqUser';
                const bigIqPassword = 'myBigIqPassword';
                const licensePool = 'myLicensePool';
                const bigIpMgmtAddress = 'myMgmtAddress';
                const bigIpMgmtPort = '1234';
                const skuKeyword1 = 'mySku1';
                const skuKeyword2 = 'mySku2';
                const unitOfMeasure = 'myUnitOfMeasure';
                const cloud = 'myCloud';

                argv.push(
                    '--license-pool',
                    '--big-iq-host', bigIqHost,
                    '--big-iq-user', bigIqUser,
                    '--big-iq-password', bigIqPassword,
                    '--big-iq-password-encrypted',
                    '--license-pool-name', licensePool,
                    '--big-ip-mgmt-address', bigIpMgmtAddress,
                    '--big-ip-mgmt-port', bigIpMgmtPort,
                    '--sku-keyword-1', skuKeyword1,
                    '--sku-keyword-2', skuKeyword2,
                    '--unit-of-measure', unitOfMeasure,
                    '--cloud', cloud,
                    '--no-unreachable'
                );

                test.expect(6);
                onboard.run(argv, testOptions, () => {
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[0], bigIqHost);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[1], bigIqUser);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[2], bigIqPassword);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[3], licensePool);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[4], cloud);
                    test.deepEqual(
                        functionsCalled.bigIp.onboard.licenseViaBigIq[5],
                        {
                            passwordIsUri: false,
                            passwordEncrypted: true,
                            bigIpMgmtAddress,
                            bigIpMgmtPort,
                            skuKeyword1,
                            skuKeyword2,
                            unitOfMeasure,
                            noUnreachable: true
                        }
                    );
                    test.done();
                });
            },

            testMissingParams(test) {
                argv.push('--license-pool');

                test.expect(1);
                onboard.run(argv, testOptions, () => {
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq, undefined);
                    test.done();
                });
            }
        }
    },


    testProvision(test) {
        const module1 = 'module1:level1';
        const module2 = 'module2:level2';

        argv.push('--module', module1, '--module', module2);

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.deepEqual(functionsCalled.bigIp.onboard.provision[0],
                { module1: 'level1', module2: 'level2' });
            test.done();
        });
    },

    testProvisionMultiple(test) {
        const modulesString = 'module1:level1,module2:level2';

        argv.push('--modules', modulesString);

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.deepEqual(functionsCalled.bigIp.onboard.provision[0],
                { module1: 'level1', module2: 'level2' });
            test.done();
        });
    },

    testAsmSignatures(test) {
        argv.push('--update-sigs');
        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.strictEqual(functionsCalled.bigIp.create[0], '/tm/asm/tasks/update-signatures');
            test.done();
        });
    },

    testPing: {
        testDefault(test) {
            argv.push('--ping');
            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.ping[0], 'f5.com');
                test.done();
            });
        },

        testAddress(test) {
            const address = 'www.foo.com';

            argv.push('--ping', address);
            test.expect(1);
            onboard.run(argv, testOptions, () => {
                test.strictEqual(functionsCalled.bigIp.ping[0], address);
                test.done();
            });
        }
    },

    testMetrics(test) {
        argv.push('--metrics', 'key1:value1');
        test.expect(2);
        onboard.run(argv, testOptions, () => {
            test.strictEqual(functionsCalled.metrics.upload[0].action, 'onboard');
            test.strictEqual(functionsCalled.metrics.upload[0].key1, 'value1');
            test.done();
        });
    },

    testActiveError(test) {
        utilMock.reboot = () => {
            rebootCalled = true;
        };

        bigIpMock.active = () => {
            return q.reject(new ActiveError('BIG-IP not active.'));
        };

        test.expect(1);
        onboard.run(argv, testOptions, () => {
            test.strictEqual(rebootCalled, true);
            test.done();
        });
    }
};
