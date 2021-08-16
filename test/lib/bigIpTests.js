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

const q = require('q');
const fs = require('fs');
const assert = require('assert');
const childProcessMock = require('child_process');
const sinon = require('sinon');

describe('bigip tests', () => {
    const realSetTimeout = setTimeout;
    const realUnlink = fs.unlink;
    const realExecFile = childProcessMock.execFile;
    const realAccess = fs.access;

    let BigIp;
    let utilMock;
    let icontrolMock;
    let localKeyUtilMock;
    let cryptoUtilMock;
    let authnMock;

    let bigIp;
    let realReady;

    let getProductCalled;
    let removedFile;

    const UCS_TASK_PATH = '/tm/task/sys/ucs';
    const DUMMY_TASK_PATH = '/foo/task/bar';

    const privateKeyFolder = 'aFolder';
    const privateKeyName = 'aKey';
    const privateKeyMetadata = [
        {
            name: 'default.key',
            partition: 'Common',
            fullPath: '/Common/default.key',
        }
    ];

    const encryptedPassword = 'myEncryptedPassword';
    let dataWritten;
    let tmshCommandCalled;

    beforeEach((done) => {
        /* eslint-disable global-require */
        utilMock = require('../../../f5-cloud-libs').util;
        icontrolMock = require('../testUtil/icontrolMock');
        localKeyUtilMock = require('../../../f5-cloud-libs').localKeyUtil;
        cryptoUtilMock = require('../../../f5-cloud-libs').cryptoUtil;
        authnMock = require('../../../f5-cloud-libs').authn;

        authnMock.authenticate = function authenticate(host, user, password) {
            icontrolMock.password = password;
            return q.resolve(icontrolMock);
        };

        BigIp = require('../../../f5-cloud-libs').bigIp;
        bigIp = new BigIp();

        utilMock.getProduct = function getProduct() {
            return q('BIG-IP');
        };

        utilMock.runShellCommand = function runShellCommand() {
            return q();
        };

        realReady = bigIp.ready; // Store this so we can test the ready function
        bigIp.ready = function ready() {
            return q();
        };
        // we have to call init so we can wait till it's done to set icontrol
        bigIp.init('host', 'user', 'password')
            .then(() => {
                icontrolMock.reset();
                done();
            });
    });

    afterEach(() => {
        sinon.restore();
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        setTimeout = realSetTimeout; // eslint-disable-line no-global-assign
        fs.unlink = realUnlink;
        fs.access = realAccess;
        childProcessMock.execFile = realExecFile;
        /* eslint-enable global-require */
    });

    it('constructor test', () => {
        assert.doesNotThrow(() => {
            // eslint-disable-next-line no-unused-vars
            const x = new BigIp({
                logger: {}
            });
        });
    });

    describe('list tests', () => {
        beforeEach(() => {
            icontrolMock.when(
                'list',
                '/tm/ltm/virtual',
                {
                    field1: 'myField1',
                    field2: 'myField2'
                }
            );
        });

        it('should succeeed if all required fields are present', () => {
            const options = {
                requiredFields: ['field1', 'field2']
            };
            return bigIp.list('/tm/ltm/virtual', null, null, options);
        });

        it('should fail if missing a required field', () => {
            utilMock.DEFAULT_RETRY = utilMock.NO_RETRY;
            const options = {
                requiredFields: ['field1', 'field2', 'field3']
            };
            return bigIp.list('/tm/ltm/virtual', null, null, options)
                .then(() => {
                    assert.ok(false, 'should have rejected because of missing field');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('missing required field'), -1);
                });
        });
    });

    describe('active tests', () => {
        it('active test', () => {
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

            return bigIp.active()
                .then(() => {
                    assert.ok(true);
                });
        });

        it('standby test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/failover-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/failover-status/0': {
                            nestedStats: {
                                entries: {
                                    status: {
                                        description: 'STANDBY'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            return bigIp.active()
                .then(() => {
                    assert.ok(true);
                });
        });

        it('not active test', () => {
            icontrolMock.when(
                'list',
                '/tm/cm/failover-status',
                {
                    entries: {
                        'https://localhost/mgmt/tm/cm/failover-status/0': {
                            nestedStats: {
                                entries: {
                                    status: {
                                        description: 'FOOBAR'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            return bigIp.active(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'BIG-IP should not be active.');
                })
                .catch((err) => {
                    assert.strictEqual(err.name, 'ActiveError');
                });
        });

        it('active throw test', () => {
            icontrolMock.fail('list', '/tm/cm/failover-status');

            return bigIp.active(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'BIG-IP should not be active.');
                })
                .catch((err) => {
                    assert.strictEqual(err.name, 'ActiveError');
                });
        });
    });

    describe('create modify delete tests', () => {
        describe('common partition tests', () => {
            it('does not exist test', () => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/sys/foo/~Common~bar',
                    error404
                );

                return bigIp.createOrModify('/tm/sys/foo', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo');
                    });
            });

            it('exists test', () => {
                return bigIp.createOrModify('/tm/sys/foo', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/~Common~bar');
                    });
            });

            it('delete test', () => {
                icontrolMock.when('delete', '/tm/sys/foo/bar', {});

                return bigIp.delete('/tm/sys/foo/bar')
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/bar');
                    });
            });
        });

        describe('other partition tests', () => {
            it('does not exist test', () => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/sys/foo/~myOtherPartition~bar',
                    error404
                );

                return bigIp.createOrModify('/tm/sys/foo', { name: 'bar', partition: 'myOtherPartition' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo');
                    });
            });

            it('exists test', () => {
                return bigIp.createOrModify('/tm/sys/foo', { name: 'bar', partition: 'myOtherPartition' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/~myOtherPartition~bar');
                    });
            });
        });

        describe('trunk tests', () => {
            it('does not exist test', () => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/net/trunk/bar',
                    error404
                );

                return bigIp.createOrModify('/tm/net/trunk', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/net/trunk');
                    });
            });

            it('exists test', () => {
                return bigIp.createOrModify('/tm/net/trunk', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/net/trunk/bar');
                    });
            });
        });

        describe('user tests', () => {
            it('does not exist test', () => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/auth/user/bar',
                    error404
                );

                return bigIp.createOrModify('/tm/auth/user', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/auth/user');
                    });
            });

            it('exists test', () => {
                return bigIp.createOrModify('/tm/auth/user', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/auth/user/bar');
                    });
            });
        });

        describe('race condition test', () => {
            let modifyPath;
            it('should update path if object exists first but then goes away', () => {
                sinon.stub(icontrolMock, 'modify').onFirstCall().callsFake((path, opts) => {
                    modifyPath = path;
                    icontrolMock.recordRequest('list', path, null, opts);
                    const err = new Error();
                    err.code = 404;
                    return Promise.reject(err);
                });

                sinon.stub(icontrolMock, 'list')
                    .onFirstCall()
                    .callsFake((path, opts) => {
                        icontrolMock.recordRequest('list', path, null, opts);
                        return Promise.resolve({});
                    })
                    .onSecondCall()
                    .callsFake((path, opts) => {
                        icontrolMock.recordRequest('list', path, null, opts);
                        const err = new Error();
                        err.code = 404;
                        return Promise.reject(err);
                    });

                return bigIp.createOrModify('/this/will/go/away', { name: 'bar' }, null, utilMock.SHORT_RETRY)
                    .then(() => {
                        assert.strictEqual(modifyPath, '/this/will/go/away/~Common~bar');
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/this/will/go/away');
                    });
            });
        });
    });

    describe('init tests', () => {
        it('basic test', () => {
            const host = 'myHost';
            const user = 'myUser';
            const password = 'myPassword';
            const port = 1234;
            bigIp = new BigIp();
            bigIp.ready = () => {
                return q();
            };

            // we have to call init here w/ the same params as the ctor can't
            // be async.
            return bigIp.init(host, user, password, { port })
                .then(() => {
                    assert.strictEqual(bigIp.host, host);
                    assert.strictEqual(bigIp.user, user);
                    assert.strictEqual(bigIp.password, password);
                    assert.strictEqual(bigIp.port, port);
                    // Test that for BIG-IP, we do not add in the BIG-IQ mixins
                    assert.strictEqual(bigIp.onboard.isPrimaryKeySet, undefined);
                });
        });

        it('not initialized test', () => {
            bigIp = new BigIp();

            return bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Uninitialized BIG-IP should not be ready');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('bigiq test', () => {
            bigIp = new BigIp();
            bigIp.ready = () => {
                return q();
            };

            utilMock.getProduct = () => {
                return q('BIG-IQ');
            };

            return bigIp.init('host', 'user', 'password')
                .then(() => {
                    // test that BIG-IQ mixins were added
                    assert.notStrictEqual(bigIp.onboard.isPrimaryKeySet, undefined);
                });
        });

        describe('get product option test', () => {
            beforeEach(() => {
                bigIp.product = null;
                getProductCalled = false;
                utilMock.getProduct = () => {
                    getProductCalled = true;
                    return q('BIG-IP');
                };
            });

            it('product specified test', () => {
                return bigIp.init('host', 'user', 'password', { product: 'foo' })
                    .then(() => {
                        assert.strictEqual(getProductCalled, false);
                    });
            });

            it('product not specified test', () => {
                return bigIp.init('host', 'user', 'password')
                    .then(() => {
                        assert.strictEqual(getProductCalled, true);
                    });
            });
        });

        it('product not specified test', () => {
            return bigIp.list()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                });
        });
    });

    describe('create folder tests', () => {
        it('basic test', () => {
            const folderName = 'foo';

            icontrolMock.when(
                'list',
                '/tm/sys/folder',
                []
            );

            return bigIp.createFolder(folderName)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            name: folderName,
                            subPath: '/Common',
                            deviceGroup: 'none',
                            trafficGroup: 'none'
                        }
                    );
                });
        });

        it('already exists test', () => {
            const folderName = 'foo';

            icontrolMock.when(
                'list',
                '/tm/sys/folder',
                [
                    {
                        fullPath: `/Common/${folderName}`
                    }
                ]
            );

            return bigIp.createFolder(folderName)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                });
        });

        it('options test', () => {
            const folderName = 'foo';
            const options = {
                subPath: '/',
                deviceGroup: 'myDevGroup',
                trafficGroup: 'myTrafficGroup'
            };

            icontrolMock.when(
                'list',
                '/tm/sys/folder',
                []
            );

            return bigIp.createFolder(folderName, options)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.deepEqual(
                        icontrolMock.lastCall.body,
                        {
                            name: folderName,
                            subPath: '/',
                            deviceGroup: options.deviceGroup,
                            trafficGroup: options.trafficGroup
                        }
                    );
                });
        });
    });

    describe('get private key file path tests', () => {
        it('basic test', () => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            icontrolMock.when(
                'create',
                '/tm/util/bash',
                {
                    // eslint-disable-next-line max-len
                    commandResult: ':CloudLibs:cloudLibsPrivate.key_1234_1\n:CloudLibs:cloudLibsPrivate.key_5678_1\n:Common:default.key_44648_1\n:Common:default.key_20253_1\n'
                }
            );

            return bigIp.getPrivateKeyFilePath(folder, name)
                .then((privateKeyFilePath) => {
                    // eslint-disable-next-line max-len
                    assert.strictEqual(privateKeyFilePath, '/config/filestore/files_d/CloudLibs_d/certificate_key_d/:CloudLibs:cloudLibsPrivate.key_1234_1');
                });
        });

        it('no key suffix test', () => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate.key';

            icontrolMock.when(
                'create',
                '/tm/util/bash',
                {
                    // eslint-disable-next-line max-len
                    commandResult: ':CloudLibs:cloudLibsPrivate_1234_1\n:CloudLibs:cloudLibsPrivate.key_5678_1\n:Common:default.key_44648_1\n:Common:default.key_20253_1\n'
                }
            );

            return bigIp.getPrivateKeyFilePath(folder, name)
                .then((privateKeyFilePath) => {
                    // eslint-disable-next-line max-len
                    assert.strictEqual(privateKeyFilePath, '/config/filestore/files_d/CloudLibs_d/certificate_key_d/:CloudLibs:cloudLibsPrivate_1234_1');
                });
        });

        it('not found test', () => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            icontrolMock.when(
                'create',
                '/tm/util/bash',
                {
                    // eslint-disable-next-line max-len
                    commandResult: ':Common:foo.key_1234_1\n:Common:bar.key_5678_1\n:Common:default.key_44648_1\n:Common:default.key_20253_1\n'
                }
            );

            return bigIp.getPrivateKeyFilePath(folder, name)
                .then((privateKeyFilePath) => {
                    assert.strictEqual(privateKeyFilePath, undefined);
                });
        });
    });

    describe('install private key tests', () => {
        beforeEach(() => {
            fs.unlink = (path, cb) => {
                removedFile = path;
                cb();
            };

            icontrolMock.when(
                'list',
                '/tm/sys/folder',
                [
                    {
                        fullPath: '/CloudLibs'
                    }
                ]
            );

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '13.1.0'
                }
            );
        });

        it('basic test', () => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            const keyFile = '/foo/bar';
            const expectedBody = {
                command: 'install',
                name: '/CloudLibs/cloudLibsPrivate',
                fromLocalFile: keyFile
            };

            icontrolMock.when('create', '/tm/sys/crypto/key', {});

            return bigIp.installPrivateKey(keyFile, folder, name)
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', '/tm/sys/crypto/key'), expectedBody);
                    assert.strictEqual(removedFile, keyFile);
                });
        });

        it('encrypted passphrase test', () => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';
            const passphrase = 'abc123';

            const keyFile = '/foo/bar';
            const expectedBody = {
                passphrase,
                command: 'install',
                name: '/CloudLibs/cloudLibsPrivate',
                fromLocalFile: keyFile
            };

            icontrolMock.when('create', '/tm/sys/crypto/key', {});

            return bigIp.installPrivateKey(keyFile, folder, name, { passphrase })
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', '/tm/sys/crypto/key'), expectedBody);
                    assert.strictEqual(removedFile, keyFile);
                });
        });

        it('unlink error ignored test', () => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            const keyFile = '/foo/bar';

            icontrolMock.when('create', '/tm/sys/crypto/key', {});

            fs.unlink = function unlink(file, cb) {
                cb(new Error());
            };

            return bigIp.installPrivateKey(keyFile, folder, name)
                .then(() => {
                    assert.ok(true);
                });
        });
    });

    describe('get private key metadata tests', () => {
        it('no key suffix test', () => {
            const sslKey = {
                name: 'aKey',
                partition: 'aFolder',
                fullPath: '/aFolder/aKey',
            };
            privateKeyMetadata.push(sslKey);
            icontrolMock.when(
                'list',
                '/tm/sys/file/ssl-key',
                privateKeyMetadata
            );

            return bigIp.getPrivateKeyMetadata(privateKeyFolder, privateKeyName)
                .then((response) => {
                    assert.deepEqual(response, sslKey);
                });
        });

        it('key suffix test', () => {
            const sslKey = {
                name: 'aKey.key',
                partition: 'aFolder',
                fullPath: '/aFolder/aKey.key',
            };
            privateKeyMetadata.push(sslKey);
            icontrolMock.when(
                'list',
                '/tm/sys/file/ssl-key',
                privateKeyMetadata
            );

            return bigIp.getPrivateKeyMetadata(privateKeyFolder, `${privateKeyName}.key`)
                .then((response) => {
                    assert.deepEqual(response, sslKey);
                });
        });
    });

    it('get password test', () => {
        return bigIp.getPassword()
            .then((response) => {
                assert.strictEqual(response, 'password');
            });
    });

    describe('load config tests', () => {
        it('no file test', () => {
            return bigIp.loadConfig()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'load');
                    assert.strictEqual(icontrolMock.lastCall.body.name, 'default');
                });
        });

        it('file test', () => {
            const fileName = 'foobar';

            return bigIp.loadConfig(fileName)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.options[0].file, fileName);
                });
        });

        it('options test', () => {
            const options = {
                foo: 'bar',
                hello: 'world'
            };

            return bigIp.loadConfig(null, options)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.options[0].foo, options.foo);
                    assert.strictEqual(icontrolMock.lastCall.body.options[1].hello, options.hello);
                });
        });
    });

    describe('load ucs tests', () => {
        beforeEach(() => {
            icontrolMock.when('create', UCS_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'COMPLETED' });

            // eslint-disable-next-line no-global-assign
            setTimeout = function (cb) {
                cb();
            };

            childProcessMock.execFile = function execFile(file, optionsOrCb, cb) {
                let funcToCall;
                if (typeof optionsOrCb === 'function') {
                    funcToCall = optionsOrCb;
                } else {
                    funcToCall = cb;
                }
                funcToCall();
            };
        });

        it('basic test', () => {
            return bigIp.loadUcs('/tmp/foo')
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('replace', `${UCS_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                });
        });

        it('load options test', () => {
            return bigIp.loadUcs('/tmp/foo', { foo: 'bar', hello: 'world' })
                .then(() => {
                    const command = icontrolMock.getRequest('create', UCS_TASK_PATH);
                    assert.deepEqual(command.options, [{ foo: 'bar' }, { hello: 'world' }]);
                });
        });

        describe('restore user tests', () => {
            beforeEach(() => {
                utilMock.runTmshCommand = function runTmshCommand(command) {
                    tmshCommandCalled = command;
                    return q();
                };
                utilMock.writeDataToUrl = function writeDataToUrl(data) {
                    dataWritten = data;
                };

                localKeyUtilMock.generateAndInstallKeyPair = function generateAndInstallKeyPair() {
                    return q();
                };

                cryptoUtilMock.encrypt = function encrypt() {
                    return q(encryptedPassword);
                };

                tmshCommandCalled = undefined;
            });

            it('basic test', () => {
                bigIp.initOptions = {
                    passwordIsUrl: true,
                    passwordEncrypted: true
                };

                return bigIp.loadUcs('/tmp/foo', undefined, { initLocalKeys: true, restoreUser: true })
                    .then(() => {
                        assert.strictEqual(tmshCommandCalled.startsWith('modify auth user'), true);
                        assert.strictEqual(dataWritten, encryptedPassword);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    });
            });

            it('auth token test', () => {
                bigIp.initOptions = {
                    passwordIsToken: true
                };

                return bigIp.loadUcs('/tmp/foo', undefined, { initLocalKeys: true, restoreUser: true })
                    .then(() => {
                        assert.strictEqual(tmshCommandCalled, undefined);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    });
            });
        });

        it('failed test', () => {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'FAILED' });
            return bigIp.loadUcs('foo')
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('never complete test', () => {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'PENDING' });
            utilMock.DEFAULT_RETRY = { maxRetries: 0, retryIntervalMs: 0 };
            return bigIp.loadUcs('/tmp/foo', undefined, undefined, utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('mcp never ready test', () => {
            const message = 'mcp is not ready';
            bigIp.ready = function ready() {
                return q.reject(new Error(message));
            };

            return bigIp.loadUcs('/tmp/foo', undefined, undefined, utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should have thrown mcp not ready');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                });
        });

        describe('password url tests', () => {
            it('basic test', () => {
                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                return bigIp.init('host', 'user', passwordUrl, { passwordIsUrl: true })
                    .then(() => {
                        bigIp.icontrol = icontrolMock;
                        bigIp.password = '';
                        bigIp.loadUcs('/tmp/foo')
                            .then(() => {
                                assert.strictEqual(bigIp.password, password);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                            });
                    });
            });

            it('get data from url error test', () => {
                const message = 'getDataFromUrl error';

                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                return bigIp.init('host', 'user', passwordUrl, { passwordIsUrl: true })
                    .then(() => {
                        utilMock.getDataFromUrl = function getDataFromUrl() {
                            return q.reject(new Error(message));
                        };

                        bigIp.icontrol = icontrolMock;
                        bigIp.password = '';
                        bigIp.loadUcs('/tmp/foo')
                            .then(() => {
                                assert.ok(false, 'should have thrown getDataFromUrl error');
                            })
                            .catch((err) => {
                                assert.strictEqual(err.message, message);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                            });
                    });
            });

            it('decrypt password error test', () => {
                const message = 'encrypt password error';

                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                bigIp.init('host', 'user', passwordUrl, { passwordIsUrl: true })
                    .then(() => {
                        cryptoUtilMock.encrypt = function encrypt() {
                            return q.reject(new Error(message));
                        };
                        localKeyUtilMock.generateAndInstallKeyPair = function generateAndInstallKeyPair() {
                            return q();
                        };

                        bigIp.initOptions.passwordEncrypted = true;
                        bigIp.icontrol = icontrolMock;
                        bigIp.password = '';
                        return bigIp.loadUcs('/tmp/foo', {}, { initLocalKeys: true })
                            .then(() => {
                                assert.ok(false, 'should have thrown getDataFromUrl error');
                            })
                            .catch((err) => {
                                assert.strictEqual(err.message, message);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                            });
                    });
            });
        });
    });

    describe('ping tests', () => {
        it('no address test', () => {
            return bigIp.ping()
                .then(() => {
                    assert.ok(false, 'Ping with no address should have been rejected.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Address is required'), -1);
                });
        });

        it('packets received test', () => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    // eslint-disable-next-line max-len
                    commandResult: 'PING 104.219.104.168 (104.219.104.168) 56(84) bytes of data.\n64 bytes from 104.219.104.168: icmp_seq=1 ttl=240 time=43.5 ms\n\n--- 104.219.104.168 ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss, time 43ms\nrtt min/avg/max/mdev = 43.593/43.593/43.593/0.000 ms\n'
                }
            );
            return bigIp.ping('1.2.3.4')
                .then(() => {
                    assert.ok(true);
                });
        });

        it('no packets received test', () => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    // eslint-disable-next-line max-len
                    commandResult: 'PING 1.2.3.4 (1.2.3.4) 56(84) bytes of data.\n\n--- 1.2.3.4 ping statistics ---\n2 packets transmitted, 0 received, 100% packet loss, time 2000ms\n\n'
                }
            );
            return bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with no packets should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('unknown host test', () => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    commandResult: 'ping: unknown host f5.com\n'
                }
            );
            return bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with unknown host should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('unexpected response test', () => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    commandResult: 'foobar'
                }
            );
            return bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with unexpected response should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('no response test', () => {
            icontrolMock.setDefaultResponse(undefined);
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                undefined
            );
            return bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with no response should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('ready tests', () => {
        beforeEach(() => {
            bigIp.ready = realReady;

            icontrolMock.when(
                'list',
                '/shared/echo-js/available',
                {}
            );

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info/available',
                {}
            );

            icontrolMock.when(
                'list',
                '/tm/sys/available',
                {}
            );

            icontrolMock.when(
                'list',
                '/tm/cm/available',
                {}
            );

            icontrolMock.when(
                'list',
                '/shared/iapp/package-management-tasks/available',
                {}
            );

            icontrolMock.when(
                'list',
                '/tm/sys/mcp-state',
                {
                    entries: {
                        entry: {
                            nestedStats: {
                                entries: {
                                    phase: {
                                        description: 'running'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '14.1.0'
                }
            );

            icontrolMock.when(
                'list',
                '/tm/sys/ready',
                {
                    entries: {
                        'https://localhost/mgmt/tm/sys/ready/0': {
                            nestedStats: {
                                entries: {
                                    configReady: {
                                        description: 'yes'
                                    },
                                    licenseReady: {
                                        description: 'yes'
                                    },
                                    provisionReady: {
                                        description: 'yes'
                                    }
                                }
                            }
                        }
                    }
                }
            );
        });

        it('basic test', () => {
            return bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(true);
                });
        });

        it('availability fail test', () => {
            icontrolMock.fail(
                'list',
                '/shared/echo/available'
            );

            return bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ready should have failed availability.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('mcp not ready test', () => {
            icontrolMock.when(
                'list',
                '/tm/sys/mcp-state',
                {
                    entries: {
                        entry: {
                            nestedStats: {
                                entries: {
                                    phase: {
                                        description: 'foo'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            return bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ready should have failed MCP check.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('mcp check reject test', () => {
            icontrolMock.fail('list', '/tm/sys/mcp-state');

            return bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'MCP check should have rejected.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('sys not ready test', () => {
            icontrolMock.when(
                'list',
                '/tm/sys/ready',
                {
                    entries: {
                        'https://localhost/mgmt/tm/sys/ready/0': {
                            nestedStats: {
                                entries: {
                                    configReady: {
                                        description: 'no'
                                    },
                                    licenseReady: {
                                        description: 'yes'
                                    },
                                    provisionReady: {
                                        description: 'yes'
                                    }
                                }
                            }
                        }
                    }
                }
            );

            return bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ready should have failed sys ready check.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });

        it('sys ready 13_0 no op test', () => {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '13.0.0'
                }
            );

            // fail any call to the sys ready endpoint
            icontrolMock.fail('list', '/tm/sys/ready');

            return bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(true);
                });
        });
    });

    it('reboot test', () => {
        icontrolMock.when('create', '/tm/sys', {});
        return bigIp.reboot()
            .then(() => {
                assert.strictEqual(icontrolMock.lastCall.method, 'create');
                assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys');
                assert.strictEqual(icontrolMock.lastCall.body.command, 'reboot');
            });
    });

    describe('reboot required tests', () => {
        it('reboot required test', () => {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {
                    value: 'reboot'
                }
            );

            return bigIp.rebootRequired()
                .then((rebootRequired) => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/db/provision.action');
                    assert.ok(rebootRequired, 'Reboot should have been required.');
                });
        });

        it('reboot not required test', () => {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {
                    value: 'none'
                }
            );

            return bigIp.rebootRequired()
                .then((rebootRequired) => {
                    assert.ifError(rebootRequired);
                });
        });

        it('unexpected response test', () => {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {}
            );

            return bigIp.rebootRequired(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'rebootRequired with no value should not have resolved.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('no value'), -1);
                });
        });

        it('failed action check test', () => {
            icontrolMock.fail('list', '/tm/sys/db/provision.action');
            return bigIp.rebootRequired(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'rebootRequired with failed action check should not have resolved.');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('run task tests', () => {
        beforeEach(() => {
            icontrolMock.when('create', DUMMY_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'COMPLETED' });
            utilMock.DEFAULT_RETRY = { maxRetries: 10, retryIntervalMs: 10 };
        });

        it('basic test', () => {
            const commandBody = { foo: 'bar', hello: 'world' };
            return bigIp.runTask(DUMMY_TASK_PATH, commandBody)
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', DUMMY_TASK_PATH), commandBody);
                    assert.deepEqual(
                        icontrolMock.getRequest('replace', `${DUMMY_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                });
        });

        it('options test', () => {
            icontrolMock.when('create', DUMMY_TASK_PATH, { id: '1234' });
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { status: 'FINISHED' });

            const commandBody = { foo: 'bar', hello: 'world' };
            const options = { idAttribute: 'id', validate: false, statusAttribute: 'status' };
            return bigIp.runTask(DUMMY_TASK_PATH, commandBody, options)
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', DUMMY_TASK_PATH), commandBody);
                });
        });

        it('created task status test', () => {
            icontrolMock.when('create', DUMMY_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'CREATED' });
            icontrolMock.whenNext('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'FINISHED' });

            const commandBody = { foo: 'bar', hello: 'world' };
            return bigIp.runTask(DUMMY_TASK_PATH, commandBody)
                .then(() => {
                    assert.strictEqual(icontrolMock.getNumRequests('list', `${DUMMY_TASK_PATH}/1234`), 2);
                });
        });

        it('failed test', () => {
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'FAILED' });
            return bigIp.runTask(DUMMY_TASK_PATH, {}, { neverReject: true })
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('save tests', () => {
        it('no file test', () => {
            icontrolMock.when('create', '/tm/sys/config', {});

            return bigIp.save()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'save');
                    assert.strictEqual(icontrolMock.lastCall.body.options, undefined);
                });
        });

        it('file test', () => {
            icontrolMock.when('create', '/tm/sys/config', {});

            return bigIp.save('foo')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.options[0].file, 'foo');
                });
        });
    });

    describe('save ucs tests', () => {
        beforeEach(() => {
            icontrolMock.when('create', UCS_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'COMPLETED' });

            fs.access = function access(file, cb) {
                cb();
            };

            utilMock.runShellCommand = function runShellCommand() {
                return q.resolve('OK');
            };

            // eslint-disable-next-line no-global-assign
            setTimeout = function (cb) {
                cb();
            };
        });

        it('basic test', () => {
            return bigIp.saveUcs('foo')
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('replace', `${UCS_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                });
        });

        it('failed test', () => {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'FAILED' });
            return bigIp.saveUcs('foo')
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                });
        });
    });

    describe('transaction tests', () => {
        it('basic test', () => {
            const commands = [
                {
                    method: 'list',
                    path: '/foo/bar'
                },
                {
                    method: 'create',
                    path: '/bar/foo',
                    body: {
                        foo: 'bar'
                    }
                },
                {
                    method: 'modify',
                    path: '/hello/world',
                    body: {
                        roger: 'dodger'
                    }
                },
                {
                    method: 'delete',
                    path: '/okie/dokie',
                    body: {
                        hello: 'world'
                    }
                }
            ];

            const transId = '1234';

            icontrolMock.when(
                'create',
                '/tm/transaction/',
                { transId }
            );

            icontrolMock.when(
                'modify',
                `/tm/transaction/${transId}`,
                {
                    state: 'COMPLETED'
                }
            );

            return bigIp.transaction(commands)
                .then(() => {
                    assert.strictEqual(icontrolMock.getRequest('list', '/foo/bar'), null);
                    assert.deepEqual(icontrolMock.getRequest('create', '/bar/foo'), { foo: 'bar' });
                    assert.deepEqual(icontrolMock.getRequest('modify', '/hello/world'), { roger: 'dodger' });
                    assert.deepEqual(icontrolMock.getRequest('delete', '/okie/dokie'), { hello: 'world' });
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/transaction/1234'), { state: 'VALIDATING' }
                    );
                });
        });

        it('incomplete test', () => {
            const commands = [
                {
                    method: 'list',
                    path: '/foo/bar'
                }
            ];

            const transId = '1234';

            icontrolMock.when(
                'create',
                '/tm/transaction/',
                { transId }
            );

            icontrolMock.when(
                'modify',
                `/tm/transaction/${transId}`,
                {
                    state: 'FOOBAR'
                }
            );

            return bigIp.transaction(commands)
                .then(() => {
                    assert.ok(false, 'Transaction should have rejected incomplete');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('not completed'), -1);
                });
        });

        it('no commands test', () => {
            return bigIp.transaction()
                .then(() => {
                    assert.ok(true);
                });
        });
    });

    describe('set host', () => {
        it('should set host to an ip', () => {
            return bigIp.setHost('1.2.3.4')
                .then(() => {
                    assert.strictEqual(bigIp.host, '1.2.3.4');
                    assert.strictEqual(bigIp.icontrol.host, '1.2.3.4');
                });
        });

        it('should set host to localhost', () => {
            return bigIp.setHost('localhost')
                .then(() => {
                    assert.strictEqual(bigIp.host, 'localhost');
                    assert.strictEqual(bigIp.icontrol.host, '127.0.0.1');
                });
        });
    });

    it('should set port', () => {
        return bigIp.setPort(1234)
            .then(() => {
                assert.strictEqual(bigIp.port, 1234);
                assert.strictEqual(bigIp.icontrol.port, 1234);
            });
    });

    describe('getManagementMac', () => {
        it('should return the proper macAddress from the tm/net/interface/mgmt endpoint', () => {
            const mgmtIp = '10.1.1.2';
            icontrolMock.when(
                'list',
                '/tm/net/interface/mgmt',
                {
                    kind: 'tm:net:interface:interfacestate',
                    name: 'mgmt',
                    fullPath: 'mgmt',
                    generation: 229,
                    selfLink: 'https://localhost/mgmt/tm/net/interface/mgmt?ver=15.1.2.1',
                    bundle: 'not-supported',
                    bundleSpeed: 'not-supported',
                    enabled: true,
                    flowControl: 'tx-rx',
                    forceGigabitFiber: 'disabled',
                    forwardErrorCorrection: 'not-supported',
                    ifIndex: 32,
                    linkTrapsEnabled: 'true',
                    lldpAdmin: 'txonly',
                    lldpTlvmap: 130943,
                    macAddress: 'fa:16:3e:be:5a:45',
                    mediaActive: '100TX-FD',
                    mediaFixed: 'auto',
                    mediaSfp: 'auto',
                    mtu: 1500,
                    portFwdMode: 'l3',
                    preferPort: 'sfp',
                    qinqEthertype: '0x8100',
                    sflow: {
                        pollInterval: 0,
                        pollIntervalGlobal: 'yes'
                    },
                    stp: 'enabled',
                    stpAutoEdgePort: 'enabled',
                    stpEdgePort: 'true',
                    stpLinkType: 'auto'
                }
            );

            return bigIp.getManagementMac(mgmtIp)
                .then((response) => {
                    assert.strictEqual(response, 'fa:16:3e:be:5a:45');
                });
        });
    });
});
