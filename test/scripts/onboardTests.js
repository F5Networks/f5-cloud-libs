/**
 * Copyright 2016 F5 Networks, Inc.
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

const realExit = process.exit;

const fs = require('fs');
const q = require('q');
const ActiveError = require('../../../f5-cloud-libs').activeError;

var metricsCollectorMock;

var rebootCalled = false;
var functionsCalled;
var onboard;
var ipcMock;
var utilMock;
var exitCode;

const bigIpMock = {
    init: function() {
        functionsCalled.bigIp.init = arguments;
        return q();
    },

    list: function() {
        functionsCalled.bigIp.list = arguments;
        return q();
    },

    modify: function() {
        functionsCalled.bigIp.modify = arguments;
        return q();
    },

    create: function() {
        functionsCalled.bigIp.create = arguments;
        return q();
    },

    delete: function() {
        functionsCalled.bigIp.delete = arguments;
        return q();
    },

    ready: function() {
        functionsCalled.bigIp.ready = arguments;
        return q();
    },

    save: function() {
        functionsCalled.bigIp.save = arguments;
        return q();
    },

    active: function() {
        functionsCalled.bigIp.active = arguments;
        return q();
    },

    ping: function() {
        functionsCalled.bigIp.ping = arguments;
        return q();
    },

    rebootRequired: function() {
        functionsCalled.bigIp.rebootRequired = arguments;
        return q(true);
    },

    reboot: function() {
        functionsCalled.bigIp.reboot = arguments;
        rebootRequested = true;
        return q();
    },

    onboard: {
        globalSettings: function() {
            functionsCalled.bigIp.onboard.globalSettings = arguments;
            return q();
        },

        license: function() {
            functionsCalled.bigIp.onboard.license = arguments;
            return q();
        },

        licenseViaBigIq: function() {
            functionsCalled.bigIp.onboard.licenseViaBigIq = arguments;
            return q();
        },

        password: function() {
            functionsCalled.bigIp.onboard.password = arguments;
            return q();
        },

        provision: function() {
            functionsCalled.bigIp.onboard.provision = arguments;
            return q();
        },

        setDbVars: function() {
            functionsCalled.bigIp.onboard.setDbVars = arguments;
            return q();
        },

        updateUser: function(user, password, role, shell) {
            functionsCalled.bigIp.onboard.updateUser = arguments;
            this.updatedUsers = this.updatedUsers || [];
            this.updatedUsers.push({
                user: user,
                password: password,
                role: role,
                shell: shell
            });

            return q();
        },

        sslPort: function() {
            functionsCalled.bigIp.onboard.sslPort = arguments;
            return q();
        }
    }
};

var testOptions = {
    bigIp: bigIpMock
};

var argv;
var rebootRequested;
var signalsSent;

// Our tests cause too many event listeners. Turn off the check.
var options = require('commander');
options.setMaxListeners(0);

module.exports = {
    setUp: function(callback) {
        signalsSent = [];

        ipcMock = require('../../lib/ipc');

        // Just resolve right away, otherwise these tests never exit
        ipcMock.once = function() {
            functionsCalled.ipc.once = arguments;
            return q();
        };

        ipcMock.send = function(signal) {
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

        utilMock.logAndExit = function(message, level, code) {
            exitCode = code;
            if (exitCode) {
                 throw new Error('exit with code ' + exitCode);
            }
        };
        exitCode = undefined;

        metricsCollectorMock.upload = function() {
            functionsCalled.metrics.upload = arguments;
            return q();
        };

        callback();
    },

    tearDown: function(callback) {
        process.exit = realExit;
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });
        callback();
    },

    testRequiredOptions: {
        testNoHost: function(test) {
            argv = ['node', 'onboard', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testNoUser: function(test) {
            argv = ['node', 'onboard', '--host', '1.2.3.4', '-p', 'bar', '--log-level', 'none'];

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(exitCode, 1);
                test.done();
            });
        },

        testNoPassword: function(test) {
            argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '--log-level', 'none'];

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(exitCode, 1);
                test.done();
            });
        }
    },

    testWaitFor: function(test) {
        argv.push('--wait-for', 'foo');

        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.strictEqual(functionsCalled.ipc.once[0], 'foo');
            test.done();
        });
    },

    testBackground: function(test) {
        var runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = function() {
            runInBackgroundCalled = true;
        };

        argv.push('--background');

        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.ok(runInBackgroundCalled);
            test.done();
        });
    },

    testGlobalSettingsAndHostname: function(test) {
        var hostnameSet;
        bigIpMock.onboard.hostname = function(hostname) {
            hostnameSet = hostname;
        };

        argv.push('--hostname', 'hostname1', '--global-setting', 'hostname:hostname2');

        test.expect(2);
        onboard.run(argv, testOptions, function() {
            test.strictEqual(hostnameSet, 'hostname1');
            test.strictEqual(functionsCalled.bigIp.onboard.globalSettings[0].hostname, undefined);
            test.done();
        });
    },

    testReboot: function(test) {
        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.ok(rebootRequested);
            test.done();
        });
    },

    testNoReboot: function(test) {
        argv.push('--no-reboot');

        test.expect(2);
        onboard.run(argv, testOptions, function() {
            test.ifError(rebootRequested);
            test.notStrictEqual(signalsSent.indexOf('REBOOT_REQUIRED'), -1);
            test.done();
        });
    },

    testSslPortArgs: {
        setUp: function(callback) {
            utilMock.deleteArgs = function() {};
            Date.now = function() {
                return '1234';
            };
            callback();
        },

        testNoPort: function(test) {
            argv.push('--ssl-port', '8443');

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                var argsFile = fs.readFileSync('/tmp/rebootScripts/onboard_1234.sh');
                test.notStrictEqual(argsFile.indexOf('--port 8443'), -1);
                test.done();
            });
        },

        testPort: function(test) {
            argv.push('--port', '443', '--ssl-port', '8443');

            test.expect(2);
            onboard.run(argv, testOptions, function() {
                var argsFile = fs.readFileSync('/tmp/rebootScripts/onboard_1234.sh');
                test.strictEqual(argsFile.indexOf('--port 443'), -1);
                test.notStrictEqual(argsFile.indexOf('--port 8443'), -1);
                test.done();
            });
        }
    },

    testRootPassword: {
        testBasic: function(test) {
            argv.push('--set-root-password', 'old:myOldPassword,new:myNewPassword');

            test.expect(3);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(functionsCalled.bigIp.onboard.password[0], 'root');
                test.strictEqual(functionsCalled.bigIp.onboard.password[1], 'myNewPassword');
                test.strictEqual(functionsCalled.bigIp.onboard.password[2], 'myOldPassword');
                test.done();
            });
        },

        testMissingNew: function(test) {
            argv.push('--set-root-password', 'old:myOldPassword,new:');

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                test.done();
            });
        },

        testMissingOld: function(test) {
            argv.push('--set-root-password', 'old:,new:myNewPassword');

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                test.done();
            });
        },

        testMissingBoth: function(test) {
            argv.push('--set-root-password', 'foo:myOldPassword,bar:myNewPassword');

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                test.done();
            });
        }
    },

    testUpdateUser: function(test) {
        argv.push('--update-user', 'user:user1,password:pass1,role:role1,shell:shell1', '--update-user', 'user:user2,password:pass2,shell:shell2');
        onboard.run(argv, testOptions, function() {
            test.strictEqual(bigIpMock.onboard.updatedUsers.length, 2);
            test.deepEqual(bigIpMock.onboard.updatedUsers[0], {
                user: "user1",
                password: "pass1",
                role: "role1",
                shell: "shell1"
            });
            test.deepEqual(bigIpMock.onboard.updatedUsers[1], {
                user: "user2",
                password: "pass2",
                role: undefined,
                shell: "shell2"
            });
            test.done();
        });
    },

    testNtp: {
        testNtp: function(test) {
            const ntpServer = 'ntp.server1';
            argv.push('--ntp', ntpServer);

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.deepEqual(functionsCalled.bigIp.modify[1], {servers: [ntpServer]});
                test.done();
            });
        },

        testTz: function(test) {
            const tz = 'myTimezone';
            argv.push('--tz', tz);

            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.deepEqual(functionsCalled.bigIp.modify[1], {timezone: tz});
                test.done();
            });
        }
    },

    testDns: function(test) {
        const dns = 'mydns.com';
        argv.push('--dns', dns);

        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.deepEqual(functionsCalled.bigIp.modify[1], {'name-servers': [dns]});
            test.done();
        });
    },

    testDbVars: function(test) {
        const dbVar1 = 'key1:value1';
        const dbVar2 = 'key2:value2';

        argv.push('--db', dbVar1, '--db', dbVar2);

        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.deepEqual(functionsCalled.bigIp.onboard.setDbVars[0], {key1: 'value1', key2: 'value2'});
            test.done();
        });
    },

    testLicnse: {
        testRegKey: function(test) {
            const regKey = '123345';

            argv.push('--license', regKey);

            test.expect(1);
            onboard.run(argv, testOptions, function() {
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

        testAddOnKeys: function(test) {
            const addOnKey1 = 'addOn1';
            const addOnKey2 = 'addOn2';

            argv.push('--add-on', addOnKey1, '--add-on', addOnKey2);

            test.expect(1);
            onboard.run(argv, testOptions, function() {
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
            testBasic: function(test) {
                const bigIqHost = 'myBigIq';
                const bigIqUser = 'myBigIqUser';
                const bigIqPassword = 'myBigIqPassword';
                const licensePool = 'myLicensePool';
                const bigIpMgmtAddress = 'myMgmtAddress';
                const bigIpMgmtPort = '1234';

                argv.push(
                    '--license-pool',
                    '--big-iq-host', bigIqHost,
                    '--big-iq-user', bigIqUser,
                    '--big-iq-password', bigIqPassword,
                    '--license-pool-name', licensePool,
                    '--big-ip-mgmt-address', bigIpMgmtAddress,
                    '--big-ip-mgmt-port', bigIpMgmtPort
                );

                test.expect(5);
                onboard.run(argv, testOptions, function() {
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[0], bigIqHost);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[1], bigIqUser);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[2], bigIqPassword);
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[3], licensePool);
                    test.deepEqual(
                        functionsCalled.bigIp.onboard.licenseViaBigIq[4],
                        {
                            passwordIsUri: false,
                            bigIpMgmtAddress: bigIpMgmtAddress,
                            bigIpMgmtPort: bigIpMgmtPort
                        }
                    );
                    test.done();
                });
            },

            testMissingParams: function(test) {
                argv.push('--license-pool');

                test.expect(1);
                onboard.run(argv, testOptions, function() {
                    test.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq, undefined);
                    test.done();
                });
            }
        }
    },

    testProvision: function(test) {
        const module1 = 'module1:level1';
        const module2 = 'module2:level2';

        argv.push('--module', module1, '--module', module2);

        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.deepEqual(functionsCalled.bigIp.onboard.provision[0], {module1: 'level1', module2: 'level2'});
            test.done();
        });

    },

    testAsmSignatures: function(test) {
        argv.push('--update-sigs');
        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.strictEqual(functionsCalled.bigIp.create[0], '/tm/asm/tasks/update-signatures');
            test.done();
        });
    },

    testPing: {
        testDefault: function(test) {
            argv.push('--ping');
            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(functionsCalled.bigIp.ping[0], 'f5.com');
                test.done();
            });
        },

        testAddress: function(test) {
            const address = 'www.foo.com';

            argv.push('--ping', address);
            test.expect(1);
            onboard.run(argv, testOptions, function() {
                test.strictEqual(functionsCalled.bigIp.ping[0], address);
                test.done();
            });
        }
    },

    testMetrics: function(test) {
        argv.push('--metrics', 'key1:value1');
        test.expect(2);
        onboard.run(argv, testOptions, function() {
            test.strictEqual(functionsCalled.metrics.upload[0].action, 'onboard');
            test.strictEqual(functionsCalled.metrics.upload[0].key1, 'value1');
            test.done();
        });
    },

    testActiveError: function(test) {
        utilMock.reboot = function() {
            rebootCalled = true;
        };

        bigIpMock.active = function() {
            return q.reject(new ActiveError("BIG-IP not active."));
        };

        test.expect(1);
        onboard.run(argv, testOptions, function() {
            test.strictEqual(rebootCalled, true);
            test.done();
        });
    }
};
