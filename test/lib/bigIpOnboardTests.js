/**
 * Copyright 2016-2017 F5 Networks, Inc.
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
const fs = require('fs');
const icontrolMock = require('../testUtil/icontrolMock');

let BigIp;
let BigIq;
let util;
let authnMock;
let cryptoUtilMock;
let fsExistsSync;
let bigIp;
let bigIpMgmtAddressSent;
let bigIpMgmtPortSent;
let bigIqMgmtPortSent;
let initCalled;
let bigIpInit;

let poolNameSent;
let instanceSent;
let passwordSent;
let optionsSent;

let runTaskParams;

let shellCommand;
const sharedAuthnRootResponse = {
    generation: 0,
    lastUpdateMicros: 0
};

module.exports = {
    setUp(callback) {
        /* eslint-disable global-require */
        util = require('../../../f5-cloud-libs').util;
        BigIp = require('../../../f5-cloud-libs').bigIp;
        BigIq = require('../../../f5-cloud-libs').bigIq;
        cryptoUtilMock = require('../../../f5-cloud-libs').cryptoUtil;
        /* eslint-disable global-require */

        bigIp = new BigIp();
        authnMock = require('../../../f5-cloud-libs').authn;
        authnMock.authenticate = (host, user, password) => {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        };

        util.getProduct = () => {
            return q('BIG-IP');
        };

        icontrolMock.when(
            'list',
            '/shared/identified-devices/config/device-info',
            {
                product: 'BIG-IP'
            }
        );
        bigIp.runTask = function runTask() {
            runTaskParams = arguments;
            return q();
        };
        bigIp.ready = () => {
            return q();
        };
        bigIp.init('host', 'user', 'password')
            .then(() => {
                bigIp.icontrol = icontrolMock;
                icontrolMock.reset();
                callback();
            });
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        callback();
    },

    testDbconsts: {
        testBasic(test) {
            const dbVars = {
                foo: 'bar',
                hello: 'world'
            };

            bigIp.onboard.setDbVars(dbVars)
                .then(() => {
                    test.strictEqual(icontrolMock.getRequest('modify', '/tm/sys/db/foo').value, 'bar');
                    test.strictEqual(icontrolMock.getRequest('modify', '/tm/sys/db/hello').value, 'world');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testInstallIlxPackage: {
        setUp(callback) {
            fsExistsSync = fs.existsSync;
            fs.existsSync = function existsSync() { return true; };
            callback();
        },

        testFileUri(test) {
            const packageUri = 'file:///dir1/dir2/iapp.rpm';

            test.expect(2);
            bigIp.onboard.installIlxPackage(packageUri)
                .then(() => {
                    test.strictEqual(runTaskParams[0], '/shared/iapp/package-management-tasks');
                    test.deepEqual(runTaskParams[1], {
                        operation: 'INSTALL',
                        packageFilePath: '/dir1/dir2/iapp.rpm'
                    });
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAlreadyInstalled(test) {
            bigIp.runTask = function runTask() {
                return q.reject(new Error('Package f5-appsvcs version 3.5.1-5 is already installed.'));
            };
            const packageUri = 'file:///dir1/dir2/iapp.rpm';

            test.expect(1);
            bigIp.onboard.installIlxPackage(packageUri)
                .then(() => {
                    test.ok(true);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        tearDown(callback) {
            fs.existsSync = fsExistsSync;

            callback();
        }
    },

    testGlobalSettings: {
        setUp(callback) {
            icontrolMock.when('modify', '/tm/sys/global-settings', {});
            callback();
        },

        testBasic(test) {
            const globalSettings = {
                foo: 'bar',
                hello: 'world'
            };

            bigIp.onboard.globalSettings(globalSettings)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/global-settings');
                    test.deepEqual(icontrolMock.lastCall.body, globalSettings);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testHostName(test) {
            const newHostname = 'myNewHostName';
            const globalSettings = {
                hostname: newHostname,
                foo: 'bar'
            };

            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        name: 'oldHostname',
                        selfDevice: 'true'
                    }
                ]
            );

            bigIp.onboard.globalSettings(globalSettings)
                .then(() => {
                    const globalSettingsRequest = icontrolMock.getRequest(
                        'modify', '/tm/sys/global-settings'
                    );
                    const deviceRequest = icontrolMock.getRequest('create', '/tm/cm/device');
                    test.deepEqual(globalSettingsRequest, { foo: 'bar' });
                    test.strictEqual(deviceRequest.target, newHostname);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testHostName: {
        testChange(test) {
            const oldHostname = 'yourOldHostname';
            const newHostname = 'myNewHostName';

            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        name: 'otherDevice',
                        selfDevice: 'false'
                    },
                    {
                        name: oldHostname,
                        selfDevice: 'true'
                    }
                ]
            );

            bigIp.onboard.hostname(newHostname)
                .then(() => {
                    test.deepEqual(icontrolMock.getRequest(
                        'create',
                        '/tm/cm/device'
                    ),
                    {
                        command: 'mv',
                        name: oldHostname,
                        target: newHostname
                    });
                    test.deepEqual(icontrolMock.getRequest(
                        'modify',
                        '/tm/sys/global-settings'
                    ),
                    {
                        hostname: newHostname
                    });
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoChange(test) {
            const oldHostname = 'myNewHostName';
            const newHostname = 'myNewHostName';

            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        name: 'otherDevice',
                        selfDevice: 'false'
                    },
                    {
                        name: oldHostname,
                        selfDevice: 'true'
                    }
                ]
            );

            icontrolMock.when(
                'list',
                '/tm/sys/global-settings',
                {
                    hostname: oldHostname
                }
            );

            bigIp.onboard.hostname(newHostname)
                .then(() => {
                    test.strictEqual(icontrolMock.getRequest('create', '/tm/cm/device'), undefined);
                    test.strictEqual(icontrolMock.getRequest('modify', '/tm/sys/global-settings'), undefined);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadHostname(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        name: 'good hostname',
                        selfDevice: 'true'
                    }
                ]
            );

            icontrolMock.when(
                'list',
                '/tm/sys/global-settings',
                {
                    hostname: 'good hostname'
                }
            );

            icontrolMock.fail(
                'modify',
                '/tm/sys/global-settings',
                {
                    code: 400,
                    message: 'bad hostname'
                }
            );

            bigIp.onboard.hostname('foo')
                .then(() => {
                    test.ok(false, 'should have thrown bad hostname');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMissingSelfDevice(test) {
            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        name: 'other device'
                    }
                ]
            );

            bigIp.onboard.hostname('foo', util.NO_RETRY)
                .then(() => {
                    test.ok(false, 'should have thrown missing self device');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },
    },

    testLicense: {
        setUp(callback) {
            icontrolMock.when(
                'create',
                '/tm/sys/config',
                {}
            );
            callback();
        },

        testNotLicensed(test) {
            const regKey = '1234-5678-ABCD-EFGH';

            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {}
            );
            icontrolMock.when(
                'create',
                '/tm/sys/license',
                {
                    commandResult: 'New license installed'
                }
            );

            bigIp.onboard.license({ registrationKey: regKey })
                .then(() => {
                    test.strictEqual(icontrolMock.getRequest('create', '/tm/sys/license').command, 'install');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testIdentical(test) {
            const regKey = '1234-5678-ABCD-EFGH';
            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: regKey
                }
            );

            bigIp.onboard.license({ registrationKey: regKey })
                .then((response) => {
                    test.notStrictEqual(response.indexOf('Identical license'), -1);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAlreadyLicensed(test) {
            const oldRegKey = '1234-5678-ABCD-EFGH';
            const newRegKey = 'ABCD-EFGH-1234-5678';

            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: oldRegKey
                }
            );
            icontrolMock.when(
                'create',
                '/tm/sys/license',
                {
                    commandResult: 'New license installed'
                }
            );

            bigIp.onboard.license({ registrationKey: newRegKey })
                .then((response) => {
                    test.notStrictEqual(response.indexOf('already licensed'), -1);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testOverwrite(test) {
            const oldRegKey = '1234-5678-ABCD-EFGH';
            const newRegKey = 'ABCD-EFGH-1234-5678';

            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: oldRegKey
                }
            );
            icontrolMock.when(
                'create',
                '/tm/sys/license',
                {
                    commandResult: 'New license installed'
                }
            );

            bigIp.onboard.license({ registrationKey: newRegKey, overwrite: true })
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', '/tm/sys/license');
                    test.strictEqual(licenseRequest.command, 'install');
                    test.strictEqual(licenseRequest.registrationKey, newRegKey);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testLicenseFailure(test) {
            const regKey = '1234-5678-ABCD-EFGH';
            const failureMessage = 'Foo foo';

            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {}
            );
            icontrolMock.when(
                'create',
                '/tm/sys/license',
                {
                    commandResult: failureMessage
                }
            );

            bigIp.onboard.license({ registrationKey: regKey }, util.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Should have failed with license failure');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf(failureMessage), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAddOnKeys(test) {
            const addOnKeys = ['1234-5678'];

            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {}
            );
            icontrolMock.when(
                'create',
                '/tm/sys/license',
                {
                    commandResult: 'New license installed'
                }
            );

            bigIp.onboard.license({ addOnKeys })
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', '/tm/sys/license');
                    test.strictEqual(licenseRequest.command, 'install');
                    test.deepEqual(licenseRequest.addOnKeys, addOnKeys);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoKeys(test) {
            bigIp.onboard.license()
                .then((response) => {
                    test.notStrictEqual(response.indexOf('No registration key'), -1);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testLicenseViaBigIq: {
        setUp(callback) {
            icontrolMock.when(
                'create',
                '/shared/authn/login',
                {
                    token: {
                        token: 'abc123'
                    }
                }
            );

            BigIq.prototype.init = (host, user, password, options) => {
                bigIqMgmtPortSent = options.port;
                return q();
            };
            BigIq.prototype.icontrol = icontrolMock;
            BigIq.prototype.bigIp = bigIp;

            Object.defineProperty(BigIq, 'icontrol', {
                get: function icontrol() {
                    return icontrolMock;
                }
            });

            icontrolMock.when('list', '/tm/shared/licensing/registration', {});

            callback();
        },

        testVersionTooOld(test) {
            BigIq.prototype.version = '4.9.0';
            test.expect(1);

            bigIp.onboard.licenseViaBigIq()
                .then(() => {
                    test.ok(false, 'Should have thrown version too old');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('is only supported on BIG-IQ versions'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCommon: {
            setUp(callback) {
                BigIq.prototype.version = '5.0.0';
                BigIq.prototype.licenseBigIp = (poolName, bigIpMgmtAddress, bigIpMgmtPort) => {
                    bigIpMgmtAddressSent = bigIpMgmtAddress;
                    bigIpMgmtPortSent = bigIpMgmtPort;
                };

                icontrolMock.when(
                    'list',
                    '/cm/shared/licensing/pools/?$select=uuid,name',
                    [
                        {
                            name: 'pool1',
                            uuid: '1'
                        },
                        {
                            name: 'pool2',
                            uuid: '2'
                        }
                    ]
                );
                callback();
            },

            testGetsMgmtAddressFromDeviceInfo(test) {
                icontrolMock.when(
                    'list',
                    '/shared/identified-devices/config/device-info',
                    {
                        managementAddress: 'bigIpMgmtAddressDeviceInfo'
                    }
                );
                bigIp.onboard.licenseViaBigIq('host', 'user', 'password', 'pool1')
                    .then(() => {
                        test.strictEqual(bigIpMgmtAddressSent, 'bigIpMgmtAddressDeviceInfo');
                    })
                    .catch((err) => {
                        test.ok(false, err.message);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testGetsMgmtAddressFromOptions(test) {
                bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null, { bigIpMgmtAddress: 'bigIpMgmtAddressOptions' }
                )
                    .then(() => {
                        test.strictEqual(bigIpMgmtAddressSent, 'bigIpMgmtAddressOptions');
                    })
                    .catch((err) => {
                        test.ok(false, err.message);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testGetsPortFromOptions(test) {
                const specifiedPort = '8787';

                bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIpMgmtPort: specifiedPort }
                )
                    .then(() => {
                        test.strictEqual(bigIpMgmtPortSent, specifiedPort);
                    })
                    .catch((err) => {
                        test.ok(false, err.message);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testGetsBigIqPortFromOptions(test) {
                const specifiedPort = '9898';

                bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIqMgmtPort: specifiedPort }
                )
                    .then(() => {
                        test.strictEqual(bigIqMgmtPortSent, specifiedPort);
                    })
                    .catch((err) => {
                        test.ok(false, err.message);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testAlreadyLicensed: {
                setUp(callback) {
                    initCalled = false;
                    BigIq.prototype.init = () => {
                        initCalled = true;
                        return q();
                    };

                    icontrolMock.when(
                        'list',
                        '/tm/shared/licensing/registration',
                        {
                            registrationKey: 'foo'
                        }
                    );

                    callback();
                },

                testNoOverwrite(test) {
                    bigIp.onboard.licenseViaBigIq('host', 'user', 'password', 'poolName')
                        .then(() => {
                            test.strictEqual(initCalled, false);
                        })
                        .catch((err) => {
                            test.ok(false, err);
                        })
                        .finally(() => {
                            test.done();
                        });
                },

                testOverwrite(test) {
                    bigIp.onboard.licenseViaBigIq(
                        'host', 'user', 'password', 'poolName', null, { overwrite: true }
                    )
                        .then(() => {
                            test.strictEqual(initCalled, true);
                        })
                        .catch((err) => {
                            test.ok(false, err);
                        })
                        .finally(() => {
                            test.done();
                        });
                }
            }
        }
    },

    testRevokeLicenseViaBigIq: {
        setUp(callback) {
            BigIq.prototype.init = () => {
                return q();
            };
            BigIq.prototype.revokeLicense = (poolName, instance) => {
                poolNameSent = poolName;
                instanceSent = instance;
                return q();
            };
            callback();
        },

        testBasic(test) {
            const hostname = 'myHostname';
            const machineId = 'myMachineId';
            const hostMac = 'myMacAddress';
            const poolName = 'myPoolName';

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname,
                    machineId,
                    hostMac
                }
            );

            test.expect(4);
            bigIp.onboard.revokeLicenseViaBigIq('host', 'user', 'password', poolName)
                .then(() => {
                    test.strictEqual(poolNameSent, poolName);
                    test.strictEqual(instanceSent.hostname, hostname);
                    test.strictEqual(instanceSent.machineId, machineId);
                    test.strictEqual(instanceSent.macAddress, hostMac);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFailure(test) {
            const errorMessage = 'this is my error';
            BigIq.prototype.revokeLicense = () => {
                return q.reject(new Error(errorMessage));
            };
            bigIp.onboard.revokeLicenseViaBigIq('host', 'user', 'password', 'poolName')
                .then(() => {
                    test.ok(false, 'Revoke should have thrown');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf(errorMessage), -1);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testPassword: {
        testNonRoot(test) {
            const user = 'someuser';
            const newPassword = 'abc123';

            bigIp.onboard.password(user, newPassword)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, `/tm/auth/user/${user}`);
                    test.strictEqual(icontrolMock.lastCall.body.password, newPassword);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRoot(test) {
            const user = 'root';
            const newPassword = 'abc123';
            const oldPassword = 'def456';

            let passedNewPassword;
            let passedOldPassword;

            bigIp.onboard.setRootPassword = (newPass, oldPass) => {
                passedNewPassword = newPass;
                passedOldPassword = oldPass;
            };

            bigIp.onboard.password(user, newPassword, oldPassword)
                .then(() => {
                    test.strictEqual(passedNewPassword, newPassword);
                    test.strictEqual(passedOldPassword, oldPassword);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCurrentUser(test) {
            const user = 'user';
            const newPassword = 'abc123';

            bigIp.onboard.password(user, newPassword)
                .then(() => {
                    test.strictEqual(bigIp.password, newPassword);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFailure(test) {
            const user = 'someuser';
            const newPassword = 'abc123';

            icontrolMock.fail('modify', '/tm/auth/user/someuser');

            bigIp.onboard.password(user, newPassword, null, util.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Should have failed');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testSetRootPassword: {
        setUp(callback) {
            util.runShellCommand = function runTmshCommand() {
                shellCommand = arguments[0];
                return q();
            };
            cryptoUtilMock.generateRandomBytes = function generateRandomBytes() {
                return q('randombytes');
            };

            icontrolMock.when(
                'create',
                '/shared/authn/root',
                sharedAuthnRootResponse
            );

            callback();
        },

        tearDown(callback) {
            shellCommand = undefined;
            callback();
        },

        testNoOldRootPassword(test) {
            bigIp.onboard.setRootPassword('rootPassword', undefined, { enableRoot: true })
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        { value: 'false' }
                    );
                    test.strictEqual(
                        shellCommand,
                        'echo -e "randombytes\nrandombytes" | passwd root'
                    );
                    test.deepEqual(
                        icontrolMock.getRequest('create', '/shared/authn/root'),
                        { oldPassword: 'randombytes', newPassword: 'rootPassword' }
                    );
                }).catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testOldRootPassword(test) {
            bigIp.onboard.setRootPassword('rootPassword', 'myOldPassword', { enableRoot: true })
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        { value: 'false' }
                    );
                    test.strictEqual(shellCommand, undefined);
                    test.deepEqual(
                        icontrolMock.getRequest('create', '/shared/authn/root'),
                        { oldPassword: 'myOldPassword', newPassword: 'rootPassword' }
                    );
                }).catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotEnablingRoot(test) {
            bigIp.onboard.setRootPassword('rootPassword', undefined, { enableRoot: false })
                .then(() => {
                    test.ok(true);
                    test.strictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        undefined
                    );
                }).catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testProvision: {
        setUp(callback) {
            const TRANSACTION_PATH = '/tm/transaction/';
            const TRANSACTION_ID = '1234';

            icontrolMock.reset();
            icontrolMock.when(
                'create',
                TRANSACTION_PATH,
                {
                    transId: TRANSACTION_ID
                }
            );

            icontrolMock.when(
                'modify',
                TRANSACTION_PATH + TRANSACTION_ID,
                {
                    state: 'COMPLETED'
                }
            );

            icontrolMock.when(
                'list',
                '/tm/cm/failover-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/failover-status/0': {
                            nestedStats: {
                                entries: {
                                    status: {
                                        description: 'ACTIVE'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            callback();
        },

        testBasic(test) {
            const provisionSettings = {
                mod1: 'level2',
                mod2: 'level2'
            };

            icontrolMock.when(
                'list',
                '/tm/sys/provision/',
                [
                    {
                        name: 'mod1',
                        level: 'level1'
                    },
                    {
                        name: 'mod2',
                        level: 'level2'
                    }
                ]
            );

            bigIp.onboard.provision(provisionSettings)
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/provision/mod1'),
                        {
                            level: 'level2'
                        }
                    );
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotProvisionable(test) {
            const provisionSettings = {
                foo: 'bar'
            };

            icontrolMock.when(
                'list',
                '/tm/sys/provision/',
                [
                    {
                        name: 'mod1',
                        level: 'level1'
                    }
                ]
            );

            bigIp.onboard.provision(provisionSettings, util.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Should have thrown as not provisionable.');
                })
                .catch((err) => {
                    test.notEqual(err.message.indexOf('foo'), -1);
                    test.notEqual(err.message.indexOf('not provisionable'), -1);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testSslPort: {
        setUp(callback) {
            icontrolMock.when(
                'list',
                '/tm/net/self-allow',
                {
                    defaults: [
                        'tcp:123'
                    ]
                }
            );
            callback();
        },

        testBasic(test) {
            const portToAdd = 456;
            bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const httpdRequest = icontrolMock.getRequest('modify', '/tm/sys/httpd');
                    test.strictEqual(httpdRequest.sslPort, portToAdd);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotInDefaults(test) {
            const portToAdd = 456;
            bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const newDefaults = icontrolMock.getRequest('modify', '/tm/net/self-allow').defaults;
                    test.notStrictEqual(newDefaults.indexOf(`tcp:${portToAdd}`), -1);
                    test.notStrictEqual(newDefaults.indexOf('tcp:123'), -1);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAlreadyInDefaults(test) {
            const portToAdd = 123;
            bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRemove443(test) {
            const portToAdd = 456;

            icontrolMock.when(
                'list',
                '/tm/net/self-allow',
                {
                    defaults: [
                        'tcp:443'
                    ]
                }
            );

            bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const newDefaults = icontrolMock.getRequest('modify', '/tm/net/self-allow').defaults;
                    test.strictEqual(newDefaults.indexOf('tcp:443'), -1);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCatchUnknownError8(test) {
            icontrolMock.fail(
                'modify',
                '/tm/net/self-allow',
                {
                    code: 400,
                    message: 'eXtremeDB - unknown error code: 8'
                }
            );
            const portToAdd = 443;

            test.expect(2);
            bigIp.onboard.sslPort(portToAdd, null, true)
                .then((response) => {
                    const httpdRequest = icontrolMock.getRequest('modify', '/tm/sys/httpd');
                    test.strictEqual(httpdRequest.sslPort, portToAdd);
                    test.strictEqual(response, `Unable to add port "${portToAdd}" to self allow defaults`);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRejectErrors(test) {
            const message = '"defaults" invalid entry "tcp:invalidPort", invalid port';
            icontrolMock.fail(
                'modify',
                '/tm/net/self-allow',
                {
                    code: 400,
                    message
                }
            );

            bigIp.onboard.sslPort(443, null, true)
                .then(() => {
                    test.ok(false);
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testUpdateUser: {
        setUp(callback) {
            bigIpInit = BigIp.prototype.init;

            // Overwrite init because otherwise the real init creates
            // a new iControl and we lose our icontrolMock
            BigIp.prototype.init = (host, user, password, options) => {
                passwordSent = password;
                optionsSent = options;
                return q();
            };

            callback();
        },

        tearDown(callback) {
            BigIp.prototype.init = bigIpInit;
            callback();
        },

        testCreate(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'admin'
                    }
                ]
            );
            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole')
                .then(() => {
                    const userParams = icontrolMock.getRequest('create', '/tm/auth/user');
                    test.strictEqual(userParams.name, 'myUser');
                    test.strictEqual(userParams.password, 'myPass');
                    test.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCreateOnBigIq(test) {
            icontrolMock.when(
                'list',
                '/shared/authz/users',
                [
                    {
                        name: 'admin'
                    }
                ]
            );

            bigIp.product = 'BIG-IQ';

            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole')
                .then(() => {
                    const userParams = icontrolMock.getRequest('create', '/shared/authz/users');
                    test.strictEqual(userParams.name, 'myUser');
                    test.strictEqual(userParams.password, 'myPass');
                    test.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCreateNoExistingUsers(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                {}
            );
            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole', 'myShell')
                .then(() => {
                    const userParams = icontrolMock.getRequest('create', '/tm/auth/user');
                    test.strictEqual(userParams.name, 'myUser');
                    test.strictEqual(userParams.password, 'myPass');
                    test.strictEqual(userParams.shell, 'myShell');
                    test.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCreateNoRole(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'admin'
                    }
                ]
            );
            bigIp.onboard.updateUser('myUser', 'myPass')
                .then(() => {
                    test.ok(false, 'Should have thrown that we are creating with no role.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testUpdate(test) {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'myUser'
                    }
                ]
            );
            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole', 'bash')
                .then(() => {
                    const userParams = icontrolMock.getRequest('modify', '/tm/auth/user/myUser');
                    test.strictEqual(userParams.name, undefined);
                    test.strictEqual(userParams.password, 'myPass');
                    test.strictEqual(userParams['partition-access'], undefined);
                    test.strictEqual(userParams.shell, 'bash');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testUpdateCurrent(test) {
            const init = BigIp.prototype.init;

            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'user'
                    }
                ]
            );
            bigIp.onboard.updateUser('user', 'myPass')
                .then(() => {
                    test.strictEqual(passwordSent, 'myPass');
                    test.strictEqual(optionsSent.port, 443);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    BigIp.prototype.init = init;
                    test.done();
                });
        },

        testUpdateWithPasswordUrl(test) {
            const fsMock = require('fs');
            const realReadFile = fsMock.readFile;

            fsMock.readFile = (path, options, cb) => {
                cb(null, 'myPass');
            };

            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'myUser'
                    }
                ]
            );
            bigIp.onboard.updateUser('myUser', 'file:///foo/bar', 'myRole', null, { passwordIsUrl: true })
                .then(() => {
                    const userParams = icontrolMock.getRequest('modify', '/tm/auth/user/myUser');
                    test.strictEqual(userParams.password, 'myPass');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    fsMock.readFile = realReadFile;
                    test.done();
                });
        }
    }
};
