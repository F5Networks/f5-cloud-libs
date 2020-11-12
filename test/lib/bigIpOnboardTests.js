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
const assert = require('assert');
const icontrolMock = require('../testUtil/icontrolMock');

describe('bigip onboard tests', () => {
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

    beforeEach(() => {
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
            });
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('db consts tests', () => {
        it('basic test', (done) => {
            const dbVars = {
                foo: 'bar',
                hello: 'world'
            };

            bigIp.onboard.setDbVars(dbVars)
                .then(() => {
                    assert.strictEqual(icontrolMock.getRequest('modify', '/tm/sys/db/foo').value, 'bar');
                    assert.strictEqual(icontrolMock.getRequest('modify', '/tm/sys/db/hello').value, 'world');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('install ilx package test', () => {
        beforeEach(() => {
            fsExistsSync = fs.existsSync;
            fs.existsSync = function existsSync() { return true; };
        });

        afterEach(() => {
            fs.existsSync = fsExistsSync;
        });

        it('file uri test', (done) => {
            const packageUri = 'file:///dir1/dir2/iapp.rpm';

            bigIp.onboard.installIlxPackage(packageUri)
                .then(() => {
                    assert.strictEqual(runTaskParams[0], '/shared/iapp/package-management-tasks');
                    assert.deepEqual(runTaskParams[1], {
                        operation: 'INSTALL',
                        packageFilePath: '/dir1/dir2/iapp.rpm'
                    });
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('already installed test', (done) => {
            bigIp.runTask = function runTask() {
                return q.reject(new Error('Package f5-appsvcs version 3.5.1-5 is already installed.'));
            };
            const packageUri = 'file:///dir1/dir2/iapp.rpm';

            bigIp.onboard.installIlxPackage(packageUri)
                .then(() => {
                    assert.ok(true);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('global settings test', () => {
        beforeEach(() => {
            icontrolMock.when('modify', '/tm/sys/global-settings', {});
        });

        it('basic test', (done) => {
            const globalSettings = {
                foo: 'bar',
                hello: 'world'
            };

            bigIp.onboard.globalSettings(globalSettings)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/global-settings');
                    assert.deepEqual(icontrolMock.lastCall.body, globalSettings);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('hostname test', (done) => {
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
                    assert.deepEqual(globalSettingsRequest, { foo: 'bar' });
                    assert.strictEqual(deviceRequest.target, newHostname);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('hostname test', () => {
        it('change test', (done) => {
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
                    assert.deepEqual(icontrolMock.getRequest(
                        'create',
                        '/tm/cm/device'
                    ), {
                        command: 'mv',
                        name: oldHostname,
                        target: newHostname
                    });
                    assert.deepEqual(icontrolMock.getRequest(
                        'modify',
                        '/tm/sys/global-settings'
                    ), {
                        hostname: newHostname
                    });
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('no change test', (done) => {
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
                    assert.strictEqual(icontrolMock.getRequest('create', '/tm/cm/device'), undefined);
                    assert.strictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/global-settings'), undefined
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('bad hostname test', (done) => {
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
                    assert.ok(false, 'should have thrown bad hostname');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('missing self device test', (done) => {
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
                    assert.ok(false, 'should have thrown missing self device');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('license test', () => {
        beforeEach(() => {
            icontrolMock.when(
                'create',
                '/tm/sys/config',
                {}
            );
        });

        it('not licensed test', (done) => {
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
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/sys/license').command, 'install'
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('identical test', (done) => {
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
                    assert.notStrictEqual(response.indexOf('Identical license'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('already licensed test', (done) => {
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
                    assert.notStrictEqual(response.indexOf('already licensed'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('overwrite test', (done) => {
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
                    assert.strictEqual(licenseRequest.command, 'install');
                    assert.strictEqual(licenseRequest.registrationKey, newRegKey);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('license failure test', (done) => {
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
                    assert.ok(false, 'Should have failed with license failure');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(failureMessage), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('addon keys test', (done) => {
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
                    assert.strictEqual(licenseRequest.command, 'install');
                    assert.deepEqual(licenseRequest.addOnKeys, addOnKeys);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('no keys test', (done) => {
            bigIp.onboard.license()
                .then((response) => {
                    assert.notStrictEqual(response.indexOf('No registration key'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('license via bigiq test', () => {
        beforeEach(() => {
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
        });

        it('version too old test', (done) => {
            BigIq.prototype.version = '4.9.0';

            bigIp.onboard.licenseViaBigIq()
                .then(() => {
                    assert.ok(false, 'Should have thrown version too old');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('is only supported on BIG-IQ versions'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        describe('common test', () => {
            beforeEach(() => {
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
            });

            it('gets mgmt address from device info test', (done) => {
                icontrolMock.when(
                    'list',
                    '/shared/identified-devices/config/device-info',
                    {
                        managementAddress: 'bigIpMgmtAddressDeviceInfo'
                    }
                );
                bigIp.onboard.licenseViaBigIq('host', 'user', 'password', 'pool1')
                    .then(() => {
                        assert.strictEqual(bigIpMgmtAddressSent, 'bigIpMgmtAddressDeviceInfo');
                    })
                    .catch((err) => {
                        assert.ok(false, err.message);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('gets mgmt address from options test', (done) => {
                bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null, { bigIpMgmtAddress: 'bigIpMgmtAddressOptions' }
                )
                    .then(() => {
                        assert.strictEqual(bigIpMgmtAddressSent, 'bigIpMgmtAddressOptions');
                    })
                    .catch((err) => {
                        assert.ok(false, err.message);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('gets port from options test', (done) => {
                const specifiedPort = '8787';

                bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIpMgmtPort: specifiedPort }
                )
                    .then(() => {
                        assert.strictEqual(bigIpMgmtPortSent, specifiedPort);
                    })
                    .catch((err) => {
                        assert.ok(false, err.message);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('gets bigip port from options test', (done) => {
                const specifiedPort = '9898';

                bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIqMgmtPort: specifiedPort }
                )
                    .then(() => {
                        assert.strictEqual(bigIqMgmtPortSent, specifiedPort);
                    })
                    .catch((err) => {
                        assert.ok(false, err.message);
                    })
                    .finally(() => {
                        done();
                    });
            });

            describe('already licensed test', () => {
                beforeEach(() => {
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
                });

                it('no overwrite test', (done) => {
                    bigIp.onboard.licenseViaBigIq('host', 'user', 'password', 'poolName')
                        .then(() => {
                            assert.strictEqual(initCalled, false);
                        })
                        .catch((err) => {
                            assert.ok(false, err);
                        })
                        .finally(() => {
                            done();
                        });
                });

                it('overwrite test', (done) => {
                    bigIp.onboard.licenseViaBigIq(
                        'host', 'user', 'password', 'poolName', null, { overwrite: true }
                    )
                        .then(() => {
                            assert.strictEqual(initCalled, true);
                        })
                        .catch((err) => {
                            assert.ok(false, err);
                        })
                        .finally(() => {
                            done();
                        });
                });
            });
        });
    });

    describe('revoke license via bigiq test', () => {
        beforeEach(() => {
            BigIq.prototype.init = () => {
                return q();
            };
            BigIq.prototype.revokeLicense = (poolName, instance) => {
                poolNameSent = poolName;
                instanceSent = instance;
                return q();
            };
        });

        it('basic test', (done) => {
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

            bigIp.onboard.revokeLicenseViaBigIq('host', 'user', 'password', poolName)
                .then(() => {
                    assert.strictEqual(poolNameSent, poolName);
                    assert.strictEqual(instanceSent.hostname, hostname);
                    assert.strictEqual(instanceSent.machineId, machineId);
                    assert.strictEqual(instanceSent.macAddress, hostMac);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('failure test', (done) => {
            const errorMessage = 'this is my error';
            BigIq.prototype.revokeLicense = () => {
                return q.reject(new Error(errorMessage));
            };
            bigIp.onboard.revokeLicenseViaBigIq('host', 'user', 'password', 'poolName')
                .then(() => {
                    assert.ok(false, 'Revoke should have thrown');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(errorMessage), -1);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('password test', () => {
        it('non root test', (done) => {
            const user = 'someuser';
            const newPassword = 'abc123';

            bigIp.onboard.password(user, newPassword)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/auth/user/${user}`);
                    assert.strictEqual(icontrolMock.lastCall.body.password, newPassword);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('root test', (done) => {
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
                    assert.strictEqual(passedNewPassword, newPassword);
                    assert.strictEqual(passedOldPassword, oldPassword);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('current user test', (done) => {
            const user = 'user';
            const newPassword = 'abc123';

            bigIp.onboard.password(user, newPassword)
                .then(() => {
                    assert.strictEqual(bigIp.password, newPassword);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('failure test', (done) => {
            const user = 'someuser';
            const newPassword = 'abc123';

            icontrolMock.fail('modify', '/tm/auth/user/someuser');

            bigIp.onboard.password(user, newPassword, null, util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should have failed');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('set root password test', () => {
        beforeEach(() => {
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
        });

        afterEach(() => {
            shellCommand = undefined;
        });

        it('no old root password test', (done) => {
            bigIp.onboard.setRootPassword('rootPassword', undefined, { enableRoot: true })
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        { value: 'false' }
                    );
                    assert.strictEqual(
                        shellCommand,
                        'echo -e "randombytes\nrandombytes" | passwd root'
                    );
                    assert.deepEqual(
                        icontrolMock.getRequest('create', '/shared/authn/root'),
                        { oldPassword: 'randombytes', newPassword: 'rootPassword' }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('old root password test', (done) => {
            bigIp.onboard.setRootPassword('rootPassword', 'myOldPassword', { enableRoot: true })
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        { value: 'false' }
                    );
                    assert.strictEqual(shellCommand, undefined);
                    assert.deepEqual(
                        icontrolMock.getRequest('create', '/shared/authn/root'),
                        { oldPassword: 'myOldPassword', newPassword: 'rootPassword' }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('not enabling root test', (done) => {
            bigIp.onboard.setRootPassword('rootPassword', undefined, { enableRoot: false })
                .then(() => {
                    assert.ok(true);
                    assert.strictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        undefined
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('provision test', () => {
        beforeEach(() => {
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
        });

        it('basic test', (done) => {
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
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/provision/mod1'),
                        {
                            level: 'level2'
                        }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('not provisionable test', (done) => {
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
                    assert.ok(false, 'Should have thrown as not provisionable.');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('foo'), -1);
                    assert.notEqual(err.message.indexOf('not provisionable'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('no active check test', (done) => {
            const provisionSettings = {
                mod1: 'level2'
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

            icontrolMock.when(
                'list',
                '/tm/cm/failover-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/failover-status/0': {
                            nestedStats: {
                                entries: {
                                    status: {
                                        description: 'OFFLINE'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            bigIp.onboard.provision(provisionSettings, { checkActive: false })
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/provision/mod1'),
                        {
                            level: 'level2'
                        }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('ssl port test', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                '/tm/net/self-allow',
                {
                    defaults: [
                        'tcp:123'
                    ]
                }
            );
        });

        it('basic test', (done) => {
            const portToAdd = 456;
            bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const httpdRequest = icontrolMock.getRequest('modify', '/tm/sys/httpd');
                    assert.strictEqual(httpdRequest.sslPort, portToAdd);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('not in defaults test', (done) => {
            const portToAdd = 456;
            bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const newDefaults = icontrolMock.getRequest('modify', '/tm/net/self-allow').defaults;
                    assert.notStrictEqual(newDefaults.indexOf(`tcp:${portToAdd}`), -1);
                    assert.notStrictEqual(newDefaults.indexOf('tcp:123'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('already in defaults test', (done) => {
            const portToAdd = 123;
            bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('remove 443 test', (done) => {
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
                    assert.strictEqual(newDefaults.indexOf('tcp:443'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('catch unknown error 8 test', (done) => {
            icontrolMock.fail(
                'modify',
                '/tm/net/self-allow',
                {
                    code: 400,
                    message: 'eXtremeDB - unknown error code: 8'
                }
            );
            const portToAdd = 443;

            bigIp.onboard.sslPort(portToAdd, null, true)
                .then((response) => {
                    const httpdRequest = icontrolMock.getRequest('modify', '/tm/sys/httpd');
                    assert.strictEqual(httpdRequest.sslPort, portToAdd);
                    assert.strictEqual(response, `Unable to add port "${portToAdd}" to self allow defaults`);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('reject errors test', (done) => {
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
                    assert.ok(false);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('update user test', () => {
        beforeEach(() => {
            bigIpInit = BigIp.prototype.init;

            // Overwrite init because otherwise the real init creates
            // a new iControl and we lose our icontrolMock
            BigIp.prototype.init = (host, user, password, options) => {
                passwordSent = password;
                optionsSent = options;
                return q();
            };
        });

        afterEach(() => {
            BigIp.prototype.init = bigIpInit;
        });

        it('create test', (done) => {
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
                    assert.strictEqual(userParams.name, 'myUser');
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('create on bigiq test', (done) => {
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
                    assert.strictEqual(userParams.name, 'myUser');
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('create no existing users test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                {}
            );
            bigIp.onboard.updateUser('myUser', 'myPass', 'myRole', 'myShell')
                .then(() => {
                    const userParams = icontrolMock.getRequest('create', '/tm/auth/user');
                    assert.strictEqual(userParams.name, 'myUser');
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams.shell, 'myShell');
                    assert.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('create no role test', (done) => {
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
                    assert.ok(false, 'Should have thrown that we are creating with no role.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('update test', (done) => {
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
                    assert.strictEqual(userParams.name, undefined);
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams['partition-access'], undefined);
                    assert.strictEqual(userParams.shell, 'bash');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('update current test', (done) => {
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
                    assert.strictEqual(passwordSent, 'myPass');
                    assert.strictEqual(optionsSent.port, 443);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    BigIp.prototype.init = init;
                    done();
                });
        });

        it('update with password url test', (done) => {
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
                    assert.strictEqual(userParams.password, 'myPass');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    fsMock.readFile = realReadFile;
                    done();
                });
        });
    });
});
