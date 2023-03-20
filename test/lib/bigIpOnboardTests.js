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
const util = require('../../../f5-cloud-libs').util;
const cryptoUtil = require('../../../f5-cloud-libs').cryptoUtil;
const BigIp = require('../../../f5-cloud-libs').bigIp;
const BigIq = require('../../../f5-cloud-libs').bigIq;

describe('bigip onboard tests', () => {
    let bigIp;
    let bigIpRunTaskSpy;

    const sharedAuthnRootResponse = {
        generation: 0,
        lastUpdateMicros: 0
    };

    beforeEach(() => {
        bigIp = new BigIp();

        sinon.stub(authnMock, 'authenticate').callsFake((host, user, password) => {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        });

        sinon.stub(util, 'getProduct').returns(q('BIG-IP'));

        bigIpRunTaskSpy = sinon.stub(bigIp, 'runTask').returns(q());
        sinon.stub(bigIp, 'ready').returns(q());

        bigIp.init('host', 'user', 'password')
            .then(() => {
                sinon.stub(bigIp, 'icontrol').value(icontrolMock);
                icontrolMock.reset();
            });
    });

    afterEach(() => {
        sinon.restore();
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
            sinon.stub(fs, 'existsSync').returns(true);
        });

        it('file uri test', () => {
            const packageUri = 'file:///dir1/dir2/iapp.rpm';

            return bigIp.onboard.installIlxPackage(packageUri)
                .then(() => {
                    assert.strictEqual(bigIpRunTaskSpy.callCount, 1);
                    assert.strictEqual(bigIpRunTaskSpy.args[0][0], '/shared/iapp/package-management-tasks');
                    assert.deepStrictEqual(bigIpRunTaskSpy.args[0][1], {
                        operation: 'INSTALL',
                        packageFilePath: '/dir1/dir2/iapp.rpm'
                    });
                });
        });

        it('already installed test', () => {
            bigIp.runTask.restore();
            sinon.stub(bigIp, 'runTask')
                .returns(q.reject(new Error('Package f5-appsvcs version 3.5.1-5 is already installed.')));
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
                    assert.deepStrictEqual(icontrolMock.lastCall.body, globalSettings);
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
                    assert.deepStrictEqual(globalSettingsRequest, { foo: 'bar' });
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
                    assert.deepStrictEqual(icontrolMock.getRequest(
                        'create',
                        '/tm/cm/device'
                    ), {
                        command: 'mv',
                        name: oldHostname,
                        target: newHostname
                    });
                    assert.deepStrictEqual(icontrolMock.getRequest(
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

        it('overwrite test with non-identical keys', () => {
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

        it('overwrite test with identical keys', () => {
            const oldRegKey = '1234-5678-ABCD-EFGH';
            const newRegKey = '1234-5678-ABCD-EFGH';

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
                    assert.deepStrictEqual(licenseRequest.addOnKeys, addOnKeys);
                });
        });

        it('no keys test', () => {
            return bigIp.onboard.license()
                .then((response) => {
                    assert.notStrictEqual(response.indexOf('No registration key'), -1);
                });
        });

        it('should install if the license is revoked on the BIG-IP', () => {
            const oldRegKey = '1234-5678-ABCD-EFGH';
            const newRegKey = '1234-5678-ABCD-EFGH';

            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: oldRegKey,
                    usage: 'Revoked License'
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
                .then(() => {
                    const licenseRequest = icontrolMock.getRequest('create', '/tm/sys/license');
                    assert.strictEqual(licenseRequest.command, 'install');
                    assert.strictEqual(licenseRequest.registrationKey, newRegKey);
                });
        });
    });

    describe('license via bigiq test', () => {
        let bigIqInitSpy;

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

            bigIqInitSpy = sinon.stub(BigIq.prototype, 'init').returns(q());
            BigIq.prototype.icontrol = icontrolMock;
            BigIq.prototype.bigip = bigIp;

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
            let bigIqLicenseBigIpSpy;

            beforeEach(() => {
                sinon.stub(BigIq.prototype, 'version').value('5.0.0');
                bigIqLicenseBigIpSpy = sinon.stub(BigIq.prototype, 'licenseBigIp').returns();

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
                        assert.strictEqual(bigIqInitSpy.callCount, 1);
                        assert.strictEqual(bigIqInitSpy.args[0][3].authProvider, 'myAuthProvider');
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
                        assert.strictEqual(bigIqLicenseBigIpSpy.callCount, 1);
                        assert.strictEqual(bigIqLicenseBigIpSpy.args[0][1], 'bigIpMgmtAddressDeviceInfo');
                    });
            });

            it('gets mgmt address from options test', () => {
                return bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null, { bigIpMgmtAddress: 'bigIpMgmtAddressOptions' }
                )
                    .then(() => {
                        assert.strictEqual(bigIqLicenseBigIpSpy.callCount, 1);
                        assert.strictEqual(bigIqLicenseBigIpSpy.args[0][1], 'bigIpMgmtAddressOptions');
                    });
            });

            it('gets port from options test', () => {
                const specifiedPort = '8787';

                return bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIpMgmtPort: specifiedPort }
                )
                    .then(() => {
                        assert.strictEqual(bigIqLicenseBigIpSpy.callCount, 1);
                        assert.strictEqual(bigIqLicenseBigIpSpy.args[0][2], specifiedPort);
                    });
            });

            it('gets bigip port from options test', () => {
                const specifiedPort = '9898';

                return bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { bigIpMgmtAddress: 'bigIpMgmtAddress', bigIqMgmtPort: specifiedPort }
                )
                    .then(() => {
                        assert.strictEqual(bigIqInitSpy.callCount, 1);
                        assert.strictEqual(bigIqInitSpy.args[0][3].port, specifiedPort);
                    });
            });

            it('chargebackTag present test', () => {
                return bigIp.onboard.licenseViaBigIq(
                    'host', 'user', 'password', 'pool1', null,
                    { chargebackTag: 'foo-bar' }
                )
                    .then(() => {
                        assert.strictEqual(bigIqLicenseBigIpSpy.callCount, 1);
                        assert.strictEqual(bigIqLicenseBigIpSpy.args[0][3].chargebackTag, 'foo-bar');
                    });
            });

            describe('already licensed test', () => {
                beforeEach(() => {
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
                            assert.strictEqual(bigIqInitSpy.called, false);
                        });
                });

                it('overwrite test', () => {
                    return bigIp.onboard.licenseViaBigIq(
                        'host', 'user', 'password', 'poolName', null, { overwrite: true }
                    )
                        .then(() => {
                            assert.strictEqual(bigIqInitSpy.called, true);
                        });
                });
            });
        });
    });

    describe('revoke license test', () => {
        beforeEach(() => {
            icontrolMock.when(
                'create',
                '/tm/sys/config',
                {}
            );
        });

        it('should revoke licensed BIG-IP', () => {
            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: '1234-5678-ABCD-EFGH'
                }
            );
            icontrolMock.when(
                'create',
                '/tm/sys/license',
                {
                    commandResult: 'New license installed'
                }
            );
            return bigIp.onboard.revokeLicense()
                .then(() => {
                    assert.strictEqual(
                        icontrolMock.getRequest('create', '/tm/sys/license').command, 'revoke'
                    );
                });
        });

        it('should skip revoking license if no license', () => {
            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {}
            );
            return bigIp.onboard.revokeLicense()
                .then((response) => {
                    assert.strictEqual(response, 'No license to revoke. Skipping.');
                });
        });

        it('should skip revoking license if already revoked', () => {
            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: '1234-5678-ABCD-EFGH',
                    usage: 'Revoked License'
                }
            );
            return bigIp.onboard.revokeLicense()
                .then((response) => {
                    assert.strictEqual(response, 'License is already revoked. Skipping.');
                });
        });

        it('should error on revoke failure', () => {
            icontrolMock.when(
                'list',
                '/tm/shared/licensing/registration',
                {
                    registrationKey: '1234-5678-ABCD-EFGH'
                }
            );
            icontrolMock.when(
                'create',
                '/tm/sys/license',
                {
                    commandResult: 'Failed to revoke'
                }
            );
            return bigIp.onboard.revokeLicense(util.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should have failed with revoke failure');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'tryUntil: max tries reached: Failed to revoke');
                });
        });
    });

    describe('revoke license via bigiq test', () => {
        let bigIqInitSpy;
        let bigIqRevokeLicenseSpy;

        beforeEach(() => {
            bigIqInitSpy = sinon.stub(BigIq.prototype, 'init').returns(q());
            bigIqRevokeLicenseSpy = sinon.stub(BigIq.prototype, 'revokeLicense').returns(q());
        });

        it('basic test', () => {
            const hostname = 'myHostname';
            const machineId = 'myMachineId';
            const poolName = 'myPoolName';

            const options = {
                authProvider: 'myAuthProvider'
            };

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    hostname,
                    machineId
                }
            );

            return bigIp.onboard.revokeLicenseViaBigIq('host', 'user', 'password', poolName, options)
                .then(() => {
                    assert.strictEqual(bigIqRevokeLicenseSpy.callCount, 1);
                    assert.strictEqual(bigIqRevokeLicenseSpy.args[0][0], poolName);
                    assert.strictEqual(bigIqRevokeLicenseSpy.args[0][1].hostname, hostname);
                    assert.strictEqual(bigIqRevokeLicenseSpy.args[0][1].machineId, machineId);
                    assert.strictEqual(bigIqInitSpy.callCount, 1);
                    assert.strictEqual(bigIqInitSpy.args[0][3].authProvider, 'myAuthProvider');
                });
        });

        it('failure test', () => {
            const errorMessage = 'this is my error';
            BigIq.prototype.revokeLicense.restore();
            sinon.stub(BigIq.prototype, 'revokeLicense').returns(q.reject(new Error(errorMessage)));
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
        let runShellCommandSpy;

        beforeEach(() => {
            runShellCommandSpy = sinon.stub(util, 'runShellCommand').returns(q());

            sinon.stub(cryptoUtil, 'generateRandomBytes').returns(q('randombytes'));

            icontrolMock.when(
                'create',
                '/shared/authn/root',
                sharedAuthnRootResponse
            );
        });

        it('no old root password test', () => {
            return bigIp.onboard.setRootPassword('rootPassword', undefined, { enableRoot: true })
                .then(() => {
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        { value: 'false' }
                    );
                    assert.strictEqual(runShellCommandSpy.callCount, 1);
                    assert.strictEqual(
                        runShellCommandSpy.args[0][0],
                        'echo -e "randombytes\nrandombytes" | passwd root'
                    );
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('create', '/shared/authn/root'),
                        { oldPassword: 'randombytes', newPassword: 'rootPassword' }
                    );
                });
        });

        it('old root password test', () => {
            return bigIp.onboard.setRootPassword('rootPassword', 'myOldPassword', { enableRoot: true })
                .then(() => {
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/db/systemauth.disablerootlogin'),
                        { value: 'false' }
                    );
                    assert.strictEqual(runShellCommandSpy.callCount, 0);
                    assert.deepStrictEqual(
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
        const TRANSACTION_PATH = '/tm/transaction/';
        const TRANSACTION_ID = '1234';

        beforeEach(() => {
            sinon.stub(util, 'callInSerial').callsFake((thisArg, promises) => {
                return util.callInSerial.wrappedMethod(thisArg, promises, 0);
            });
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
                    assert.deepStrictEqual(
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
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('modify', '/tm/sys/provision/mod1'),
                        {
                            level: 'level2'
                        }
                    );
                });
        });

        it('transaction test', () => {
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

            return bigIp.onboard.provision(provisionSettings, { useTransaction: true })
                .then(() => {
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('create', TRANSACTION_PATH),
                        {}
                    );
                    assert.deepStrictEqual(
                        icontrolMock.getRequest('modify', `${TRANSACTION_PATH}${TRANSACTION_ID}`),
                        {
                            state: 'VALIDATING'
                        }
                    );
                    assert.deepStrictEqual(
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
        let bigIpInitSpy;

        beforeEach(() => {
            // Stub init otherwise the real init creates
            // a new iControl and we lose our icontrolMock
            bigIpInitSpy = sinon.stub(BigIp.prototype, 'init').returns(q());
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
                    assert.strictEqual(bigIpInitSpy.callCount, 1);
                    assert.strictEqual(bigIpInitSpy.args[0][2], 'myPass');
                    assert.strictEqual(bigIpInitSpy.args[0][3].port, 443);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                });
        });

        it('update with password url test', () => {
            sinon.stub(fs, 'readFile').yields(null, 'myPass');

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
                });
        });
    });
});
