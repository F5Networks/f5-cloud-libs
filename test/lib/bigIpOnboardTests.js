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
const sinon = require('sinon');

const icontrolMock = require('../testUtil/icontrolMock');
const authnMock = require('../../../f5-cloud-libs').authn;

describe('bigip onboard tests', () => {
    let BigIp;
    let BigIq;
    let util;
    let cryptoUtilMock;
    let fsExistsSync;
    let bigIp;
    let bigIpMgmtAddressSent;
    let bigIpMgmtPortSent;
    let bigIqMgmtPortSent;
    let bigIqAuthProviderSent;
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

        sinon.stub(authnMock, 'authenticate').callsFake((host, user, password) => {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        });

        util.getProduct = () => {
            return q('BIG-IP');
        };

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
        sinon.restore();
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('db consts tests', () => {
        it('basic test', () => {
            const dbVars = {
                foo: 'bar',
                hello: 'world'
            };

            return bigIp.onboard.setDbVars(dbVars)
                .then(() => {
                    assert.strictEqual(icontrolMock.getRequest('modify', '/tm/sys/db/foo').value, 'bar');
                    assert.strictEqual(icontrolMock.getRequest('modify', '/tm/sys/db/hello').value, 'world');
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

        it('file uri test', () => {
            const packageUri = 'file:///dir1/dir2/iapp.rpm';

            return bigIp.onboard.installIlxPackage(packageUri)
                .then(() => {
                    assert.strictEqual(runTaskParams[0], '/shared/iapp/package-management-tasks');
                    assert.deepEqual(runTaskParams[1], {
                        operation: 'INSTALL',
                        packageFilePath: '/dir1/dir2/iapp.rpm'
                    });
                });
        });

        it('already installed test', () => {
            bigIp.runTask = function runTask() {
                return q.reject(new Error('Package f5-appsvcs version 3.5.1-5 is already installed.'));
            };
            const packageUri = 'file:///dir1/dir2/iapp.rpm';

            return bigIp.onboard.installIlxPackage(packageUri)
                .then(() => {
                    assert.ok(true);
                });
        });
    });

    describe('global settings test', () => {
        beforeEach(() => {
            icontrolMock.when('modify', '/tm/sys/global-settings', {});
        });

        it('basic test', () => {
            const globalSettings = {
                foo: 'bar',
                hello: 'world'
            };

            return bigIp.onboard.globalSettings(globalSettings)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/global-settings');
                    assert.deepEqual(icontrolMock.lastCall.body, globalSettings);
                });
        });

        it('hostname test', () => {
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

            return bigIp.onboard.globalSettings(globalSettings)
                .then(() => {
                    const globalSettingsRequest = icontrolMock.getRequest(
                        'modify', '/tm/sys/global-settings'
                    );
                    const deviceRequest = icontrolMock.getRequest('create', '/tm/cm/device');
                    assert.deepEqual(globalSettingsRequest, { foo: 'bar' });
                    assert.strictEqual(deviceRequest.target, newHostname);
                });
        });
    });

    describe('hostname test', () => {
        it('change test', () => {
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

            return bigIp.onboard.hostname(newHostname)
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
                });
        });

        it('no change test', () => {
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

            return bigIp.onboard.hostname(newHostname)
                .then(() => {
                    assert.strictEqual(icontrolMock.getRequest('create', '/tm/cm/device'), undefined);
                    assert.strictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/global-settings'), undefined
                    );
                });
        });

        it('bad hostname test', () => {
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

            return bigIp.onboard.hostname('foo')
                .then(() => {
                    assert.ok(false, 'should have thrown bad hostname');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('missing self device test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/device',
                [
                    {
                        name: 'other device'
                    }
                ]
            );

            return bigIp.onboard.hostname('foo', util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'should have thrown missing self device');
                })
                .catch(() => {
                    assert.ok(true);
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

        it('not licensed test', () => {
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

            return bigIp.onboard.license({ registrationKey: regKey })
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/sys/license').command, 'install'
                    );
                });
        });

        it('identical test', () => {
            const regKey = '1234-5678-ABCD-EFGH';
            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: regKey
                }
            );

            return bigIp.onboard.license({ registrationKey: regKey })
                .then((response) => {
                    assert.notStrictEqual(response.indexOf('Identical license'), -1);
                });
        });

        it('already licensed test', () => {
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

            return bigIp.onboard.license({ registrationKey: newRegKey })
                .then((response) => {
                    assert.notStrictEqual(response.indexOf('already licensed'), -1);
                });
        });

        it('overwrite test', () => {
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

            return bigIp.onboard.license({ registrationKey: newRegKey, overwrite: true })
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', '/tm/sys/license');
                    assert.strictEqual(licenseRequest.command, 'install');
                    assert.strictEqual(licenseRequest.registrationKey, newRegKey);
                });
        });

        it('license failure test', () => {
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

            return bigIp.onboard.license({ registrationKey: regKey }, util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should have failed with license failure');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(failureMessage), -1);
                });
        });

        it('addon keys test', () => {
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

            return bigIp.onboard.license({ addOnKeys })
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', '/tm/sys/license');
                    assert.strictEqual(licenseRequest.command, 'install');
                    assert.deepEqual(licenseRequest.addOnKeys, addOnKeys);
                });
        });

        it('no keys test', () => {
            return bigIp.onboard.license()
                .then((response) => {
                    assert.notStrictEqual(response.indexOf('No registration key'), -1);
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
                bigIqAuthProviderSent = options.authProvider;
                return q();
            };
            BigIq.prototype.icontrol = icontrolMock;
            BigIq.prototype.bigIp = bigIp;

            Object.defineProperty(BigIq, 'icontrol', {
                get: function icontrol() {
                    return icontrolMock;
                }
            });

            bigIqAuthProviderSent = '';
            icontrolMock.when('list', '/tm/shared/licensing/registration', {});
        });

        it('version too old test', () => {
            BigIq.prototype.version = '4.9.0';

            return bigIp.onboard.licenseViaBigIq()
                .then(() => {
                    assert.ok(false, 'Should have thrown version too old');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('is only supported on BIG-IQ versions'), -1);
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

            it('passes authProvider', () => {
                const options = {
                    authProvider: 'myAuthProvider'
                };

                return bigIp.onboard.licenseViaBigIq('host', 'user', 'password', 'pool1', 'cloud', options)
                    .then(() => {
                        assert.strictEqual(bigIqAuthProviderSent, 'myAuthProvider');
                    });
            });

            it('gets mgmt address from device info test', () => {
                icontrolMock.when(
                    'list',
                    '/shared/identified-devices/config/device-info',
                    {
                        managementAddress: 'bigIpMgmtAddressDeviceInfo'
                    }
                );
                return bigIp.onboard.licenseViaBigIq('host', 'user', 'password', 'pool1')
                    .then(() => {
                        assert.strictEqual(bigIpMgmtAddressSent, 'bigIpMgmtAddressDeviceInfo');
                    });
            });

            it('gets mgmt address from options test', () => {
                return bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null, { bigIpMgmtAddress: 'bigIpMgmtAddressOptions' }
                )
                    .then(() => {
                        assert.strictEqual(bigIpMgmtAddressSent, 'bigIpMgmtAddressOptions');
                    });
            });

            it('gets port from options test', () => {
                const specifiedPort = '8787';

                return bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIpMgmtPort: specifiedPort }
                )
                    .then(() => {
                        assert.strictEqual(bigIpMgmtPortSent, specifiedPort);
                    });
            });

            it('gets bigip port from options test', () => {
                const specifiedPort = '9898';

                return bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIqMgmtPort: specifiedPort }
                )
                    .then(() => {
                        assert.strictEqual(bigIqMgmtPortSent, specifiedPort);
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

                it('no overwrite test', () => {
                    return bigIp.onboard.licenseViaBigIq('host', 'user', 'password', 'poolName')
                        .then(() => {
                            assert.strictEqual(initCalled, false);
                        });
                });

                it('overwrite test', () => {
                    return bigIp.onboard.licenseViaBigIq(
                        'host', 'user', 'password', 'poolName', null, { overwrite: true }
                    )
                        .then(() => {
                            assert.strictEqual(initCalled, true);
                        });
                });
            });
        });
    });

    describe('revoke license via bigiq test', () => {
        beforeEach(() => {
            bigIqAuthProviderSent = '';
            BigIq.prototype.init = (host, user, password, options) => {
                bigIqAuthProviderSent = options.authProvider;
                return q();
            };
            BigIq.prototype.revokeLicense = (poolName, instance) => {
                poolNameSent = poolName;
                instanceSent = instance;
                return q();
            };
        });

        it('basic test', () => {
            const hostname = 'myHostname';
            const machineId = 'myMachineId';
            const hostMac = 'myMacAddress';
            const poolName = 'myPoolName';

            const options = {
                authProvider: 'myAuthProvider'
            };

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname,
                    machineId,
                    hostMac
                }
            );

            return bigIp.onboard.revokeLicenseViaBigIq('host', 'user', 'password', poolName, options)
                .then(() => {
                    assert.strictEqual(poolNameSent, poolName);
                    assert.strictEqual(instanceSent.hostname, hostname);
                    assert.strictEqual(instanceSent.machineId, machineId);
                    assert.strictEqual(instanceSent.macAddress, hostMac);
                    assert.strictEqual(bigIqAuthProviderSent, 'myAuthProvider');
                });
        });

        it('failure test', () => {
            const errorMessage = 'this is my error';
            BigIq.prototype.revokeLicense = () => {
                return q.reject(new Error(errorMessage));
            };
            return bigIp.onboard.revokeLicenseViaBigIq('host', 'user', 'password', 'poolName')
                .then(() => {
                    assert.ok(false, 'Revoke should have thrown');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(errorMessage), -1);
                });
        });
    });

    describe('password test', () => {
        it('non root test', () => {
            const user = 'someuser';
            const newPassword = 'abc123';

            return bigIp.onboard.password(user, newPassword)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                    assert.strictEqual(icontrolMock.lastCall.path, `/tm/auth/user/${user}`);
                    assert.strictEqual(icontrolMock.lastCall.body.password, newPassword);
                });
        });

        it('root test', () => {
            const user = 'root';
            const newPassword = 'abc123';
            const oldPassword = 'def456';

            let passedNewPassword;
            let passedOldPassword;

            bigIp.onboard.setRootPassword = (newPass, oldPass) => {
                passedNewPassword = newPass;
                passedOldPassword = oldPass;
            };

            return bigIp.onboard.password(user, newPassword, oldPassword)
                .then(() => {
                    assert.strictEqual(passedNewPassword, newPassword);
                    assert.strictEqual(passedOldPassword, oldPassword);
                });
        });

        it('current user test', () => {
            const user = 'user';
            const newPassword = 'abc123';

            return bigIp.onboard.password(user, newPassword)
                .then(() => {
                    assert.strictEqual(bigIp.password, newPassword);
                });
        });

        it('failure test', () => {
            const user = 'someuser';
            const newPassword = 'abc123';

            icontrolMock.fail('modify', '/tm/auth/user/someuser');

            return bigIp.onboard.password(user, newPassword, null, util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should have failed');
                })
                .catch(() => {
                    assert.ok(true);
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

        it('no old root password test', () => {
            return bigIp.onboard.setRootPassword('rootPassword', undefined, { enableRoot: true })
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
                });
        });

        it('old root password test', () => {
            return bigIp.onboard.setRootPassword('rootPassword', 'myOldPassword', { enableRoot: true })
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
                });
        });

        it('not enabling root test', () => {
            return bigIp.onboard.setRootPassword('rootPassword', undefined, { enableRoot: false })
                .then(() => {
                    assert.ok(true);
                    assert.strictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        undefined
                    );
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

        it('basic test', () => {
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

            return bigIp.onboard.provision(provisionSettings)
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/provision/mod1'),
                        {
                            level: 'level2'
                        }
                    );
                });
        });

        it('not provisionable test', () => {
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

            return bigIp.onboard.provision(provisionSettings, util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should have thrown as not provisionable.');
                })
                .catch((err) => {
                    assert.notEqual(err.message.indexOf('foo'), -1);
                    assert.notEqual(err.message.indexOf('not provisionable'), -1);
                });
        });

        it('no active check test', () => {
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

            return bigIp.onboard.provision(provisionSettings, { checkActive: false })
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/provision/mod1'),
                        {
                            level: 'level2'
                        }
                    );
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

        it('basic test', () => {
            const portToAdd = 456;
            return bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const httpdRequest = icontrolMock.getRequest('modify', '/tm/sys/httpd');
                    assert.strictEqual(httpdRequest.sslPort, portToAdd);
                });
        });

        it('not in defaults test', () => {
            const portToAdd = 456;
            return bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const newDefaults = icontrolMock.getRequest('modify', '/tm/net/self-allow').defaults;
                    assert.notStrictEqual(newDefaults.indexOf(`tcp:${portToAdd}`), -1);
                    assert.notStrictEqual(newDefaults.indexOf('tcp:123'), -1);
                });
        });

        it('already in defaults test', () => {
            const portToAdd = 123;
            return bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                });
        });

        it('remove 443 test', () => {
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

            return bigIp.onboard.sslPort(portToAdd, null, true)
                .then(() => {
                    const newDefaults = icontrolMock.getRequest('modify', '/tm/net/self-allow').defaults;
                    assert.strictEqual(newDefaults.indexOf('tcp:443'), -1);
                });
        });

        it('catch unknown error 8 test', () => {
            icontrolMock.fail(
                'modify',
                '/tm/net/self-allow',
                {
                    code: 400,
                    message: 'eXtremeDB - unknown error code: 8'
                }
            );
            const portToAdd = 443;

            return bigIp.onboard.sslPort(portToAdd, null, true)
                .then((response) => {
                    const httpdRequest = icontrolMock.getRequest('modify', '/tm/sys/httpd');
                    assert.strictEqual(httpdRequest.sslPort, portToAdd);
                    assert.strictEqual(response, `Unable to add port "${portToAdd}" to self allow defaults`);
                });
        });

        it('reject errors test', () => {
            const message = '"defaults" invalid entry "tcp:invalidPort", invalid port';
            icontrolMock.fail(
                'modify',
                '/tm/net/self-allow',
                {
                    code: 400,
                    message
                }
            );

            return bigIp.onboard.sslPort(443, null, true)
                .then(() => {
                    assert.ok(false);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
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

        it('create test', () => {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'admin'
                    }
                ]
            );
            return bigIp.onboard.updateUser('myUser', 'myPass', 'myRole')
                .then(() => {
                    const userParams = icontrolMock.getRequest('create', '/tm/auth/user');
                    assert.strictEqual(userParams.name, 'myUser');
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                });
        });

        it('create on bigiq test', () => {
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

            return bigIp.onboard.updateUser('myUser', 'myPass', 'myRole')
                .then(() => {
                    const userParams = icontrolMock.getRequest('create', '/shared/authz/users');
                    assert.strictEqual(userParams.name, 'myUser');
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                });
        });

        it('create no existing users test', () => {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                {}
            );
            return bigIp.onboard.updateUser('myUser', 'myPass', 'myRole', 'myShell')
                .then(() => {
                    const userParams = icontrolMock.getRequest('create', '/tm/auth/user');
                    assert.strictEqual(userParams.name, 'myUser');
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams.shell, 'myShell');
                    assert.strictEqual(userParams['partition-access']['all-partitions'].role, 'myRole');
                });
        });

        it('create no role test', () => {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'admin'
                    }
                ]
            );
            return bigIp.onboard.updateUser('myUser', 'myPass')
                .then(() => {
                    assert.ok(false, 'Should have thrown that we are creating with no role.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('update test', () => {
            icontrolMock.when(
                'list',
                '/tm/auth/user',
                [
                    {
                        name: 'myUser'
                    }
                ]
            );
            return bigIp.onboard.updateUser('myUser', 'myPass', 'myRole', 'bash')
                .then(() => {
                    const userParams = icontrolMock.getRequest('modify', '/tm/auth/user/myUser');
                    assert.strictEqual(userParams.name, undefined);
                    assert.strictEqual(userParams.password, 'myPass');
                    assert.strictEqual(userParams['partition-access'], undefined);
                    assert.strictEqual(userParams.shell, 'bash');
                });
        });

        it('update current test', () => {
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
            return bigIp.onboard.updateUser('user', 'myPass')
                .then(() => {
                    assert.strictEqual(passwordSent, 'myPass');
                    assert.strictEqual(optionsSent.port, 443);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    BigIp.prototype.init = init;
                });
        });

        it('update with password url test', () => {
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
            return bigIp.onboard.updateUser(
                'myUser',
                'file:///foo/bar',
                'myRole',
                null,
                { passwordIsUrl: true }
            )
                .then(() => {
                    const userParams = icontrolMock.getRequest('modify', '/tm/auth/user/myUser');
                    assert.strictEqual(userParams.password, 'myPass');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    fsMock.readFile = realReadFile;
                });
        });
    });
});
