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

    beforeEach(() => {
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
            });
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        setTimeout = realSetTimeout; // eslint-disable-line no-global-assign
        fs.unlink = realUnlink;
        fs.access = realAccess;
        childProcessMock.execFile = realExecFile;
        /* eslint-enable global-require */
    });

    it('constructor test', (done) => {
        assert.doesNotThrow(() => {
            // eslint-disable-next-line no-unused-vars
            const x = new BigIp({
                logger: {}
            });
        });
        done();
    });

    describe('active tests', () => {
        it('active test', (done) => {
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

            bigIp.active()
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

        it('standby test', (done) => {
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

            bigIp.active()
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

        it('not active test', (done) => {
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

            bigIp.active(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'BIG-IP should not be active.');
                })
                .catch((err) => {
                    assert.strictEqual(err.name, 'ActiveError');
                })
                .finally(() => {
                    done();
                });
        });

        it('active throw test', (done) => {
            icontrolMock.fail('list', '/tm/cm/failover-status');

            bigIp.active(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'BIG-IP should not be active.');
                })
                .catch((err) => {
                    assert.strictEqual(err.name, 'ActiveError');
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('create modify delete tests', () => {
        describe('common partition tests', () => {
            it('does not exist test', (done) => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/sys/foo/~Common~bar',
                    error404
                );

                bigIp.createOrModify('/tm/sys/foo', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo');
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('exists test', (done) => {
                bigIp.createOrModify('/tm/sys/foo', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/~Common~bar');
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('delete test', (done) => {
                icontrolMock.when('delete', '/tm/sys/foo/bar', {});

                bigIp.delete('/tm/sys/foo/bar')
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'delete');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/bar');
                    })
                    .catch((err) => {
                        assert.ok(false, err.message);
                    })
                    .finally(() => {
                        done();
                    });
            });
        });

        describe('other partition tests', () => {
            it('does not exist test', (done) => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/sys/foo/~myOtherPartition~bar',
                    error404
                );

                bigIp.createOrModify('/tm/sys/foo', { name: 'bar', partition: 'myOtherPartition' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo');
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('exists test', (done) => {
                bigIp.createOrModify('/tm/sys/foo', { name: 'bar', partition: 'myOtherPartition' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/~myOtherPartition~bar');
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });
        });

        describe('trunk tests', () => {
            it('does not exist test', (done) => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/net/trunk/bar',
                    error404
                );

                bigIp.createOrModify('/tm/net/trunk', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/net/trunk');
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('exists test', (done) => {
                bigIp.createOrModify('/tm/net/trunk', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/net/trunk/bar');
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });
        });

        describe('user tests', () => {
            it('does not exist test', (done) => {
                const error404 = new Error('does not exist');
                error404.code = 404;
                icontrolMock.fail(
                    'list',
                    '/tm/auth/user/bar',
                    error404
                );

                bigIp.createOrModify('/tm/auth/user', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'create');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/auth/user');
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('exists test', (done) => {
                bigIp.createOrModify('/tm/auth/user', { name: 'bar' })
                    .then(() => {
                        assert.strictEqual(icontrolMock.lastCall.method, 'modify');
                        assert.strictEqual(icontrolMock.lastCall.path, '/tm/auth/user/bar');
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

    describe('init tests', () => {
        it('basic test', (done) => {
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
            bigIp.init(host, user, password, { port })
                .then(() => {
                    assert.strictEqual(bigIp.host, host);
                    assert.strictEqual(bigIp.user, user);
                    assert.strictEqual(bigIp.password, password);
                    assert.strictEqual(bigIp.port, port);
                    // Test that for BIG-IP, we do not add in the BIG-IQ mixins
                    assert.strictEqual(bigIp.onboard.isPrimaryKeySet, undefined);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('not initialized test', (done) => {
            bigIp = new BigIp();

            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Uninitialized BIG-IP should not be ready');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('bigiq test', (done) => {
            bigIp = new BigIp();
            bigIp.ready = () => {
                return q();
            };

            utilMock.getProduct = () => {
                return q('BIG-IQ');
            };

            bigIp.init('host', 'user', 'password')
                .then(() => {
                    // test that BIG-IQ mixins were added
                    assert.notStrictEqual(bigIp.onboard.isPrimaryKeySet, undefined);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
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

            it('product specified test', (done) => {
                bigIp.init('host', 'user', 'password', { product: 'foo' })
                    .then(() => {
                        assert.strictEqual(getProductCalled, false);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('product not specified test', (done) => {
                bigIp.init('host', 'user', 'password')
                    .then(() => {
                        assert.strictEqual(getProductCalled, true);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });
        });

        it('product not specified test', (done) => {
            bigIp.list()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('create folder tests', () => {
        it('basic test', (done) => {
            const folderName = 'foo';

            icontrolMock.when(
                'list',
                '/tm/sys/folder',
                []
            );

            bigIp.createFolder(folderName)
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
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('already exists test', (done) => {
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

            bigIp.createFolder(folderName)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('options test', (done) => {
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

            bigIp.createFolder(folderName, options)
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
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('get private key file path tests', () => {
        it('basic test', (done) => {
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

            bigIp.getPrivateKeyFilePath(folder, name)
                .then((privateKeyFilePath) => {
                    // eslint-disable-next-line max-len
                    assert.strictEqual(privateKeyFilePath, '/config/filestore/files_d/CloudLibs_d/certificate_key_d/:CloudLibs:cloudLibsPrivate.key_1234_1');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('no key suffix test', (done) => {
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

            bigIp.getPrivateKeyFilePath(folder, name)
                .then((privateKeyFilePath) => {
                    // eslint-disable-next-line max-len
                    assert.strictEqual(privateKeyFilePath, '/config/filestore/files_d/CloudLibs_d/certificate_key_d/:CloudLibs:cloudLibsPrivate_1234_1');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('not found test', (done) => {
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

            bigIp.getPrivateKeyFilePath(folder, name)
                .then((privateKeyFilePath) => {
                    assert.strictEqual(privateKeyFilePath, undefined);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
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

        it('basic test', (done) => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            const keyFile = '/foo/bar';
            const expectedBody = {
                command: 'install',
                name: '/CloudLibs/cloudLibsPrivate',
                fromLocalFile: keyFile
            };

            icontrolMock.when('create', '/tm/sys/crypto/key', {});

            bigIp.installPrivateKey(keyFile, folder, name)
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', '/tm/sys/crypto/key'), expectedBody);
                    assert.strictEqual(removedFile, keyFile);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('encrypted passphrase test', (done) => {
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

            bigIp.installPrivateKey(keyFile, folder, name, { passphrase })
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', '/tm/sys/crypto/key'), expectedBody);
                    assert.strictEqual(removedFile, keyFile);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('unlink error ignored test', (done) => {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            const keyFile = '/foo/bar';

            icontrolMock.when('create', '/tm/sys/crypto/key', {});

            fs.unlink = function unlink(file, cb) {
                cb(new Error());
            };

            bigIp.installPrivateKey(keyFile, folder, name)
                .then(() => {
                    assert.ok(true);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('get private key metadata tests', () => {
        it('no key suffix test', (done) => {
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

            bigIp.getPrivateKeyMetadata(privateKeyFolder, privateKeyName)
                .then((response) => {
                    assert.deepEqual(response, sslKey);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('key suffix test', (done) => {
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

            bigIp.getPrivateKeyMetadata(privateKeyFolder, `${privateKeyName}.key`)
                .then((response) => {
                    assert.deepEqual(response, sslKey);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    it('get password test', (done) => {
        bigIp.getPassword()
            .then((response) => {
                assert.strictEqual(response, 'password');
            })
            .catch((err) => {
                assert.ok(false, err);
            })
            .finally(() => {
                done();
            });
    });

    describe('load config tests', () => {
        it('no file test', (done) => {
            bigIp.loadConfig()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'load');
                    assert.strictEqual(icontrolMock.lastCall.body.name, 'default');
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('file test', (done) => {
            const fileName = 'foobar';

            bigIp.loadConfig(fileName)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.options[0].file, fileName);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
                });
        });

        it('options test', (done) => {
            const options = {
                foo: 'bar',
                hello: 'world'
            };

            bigIp.loadConfig(null, options)
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.options[0].foo, options.foo);
                    assert.strictEqual(icontrolMock.lastCall.body.options[1].hello, options.hello);
                })
                .catch((err) => {
                    assert.ok(false, err.message);
                })
                .finally(() => {
                    done();
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

        it('basic test', (done) => {
            bigIp.loadUcs('/tmp/foo')
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('replace', `${UCS_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('load options test', (done) => {
            bigIp.loadUcs('/tmp/foo', { foo: 'bar', hello: 'world' })
                .then(() => {
                    const command = icontrolMock.getRequest('create', UCS_TASK_PATH);
                    assert.deepEqual(command.options, [{ foo: 'bar' }, { hello: 'world' }]);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
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

            it('basic test', (done) => {
                bigIp.initOptions = {
                    passwordIsUrl: true,
                    passwordEncrypted: true
                };

                bigIp.loadUcs('/tmp/foo', undefined, { initLocalKeys: true, restoreUser: true })
                    .then(() => {
                        assert.strictEqual(tmshCommandCalled.startsWith('modify auth user'), true);
                        assert.strictEqual(dataWritten, encryptedPassword);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        childProcessMock.execFile = realExecFile;
                        done();
                    });
            });

            it('auth token test', (done) => {
                bigIp.initOptions = {
                    passwordIsToken: true
                };

                bigIp.loadUcs('/tmp/foo', undefined, { initLocalKeys: true, restoreUser: true })
                    .then(() => {
                        assert.strictEqual(tmshCommandCalled, undefined);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        childProcessMock.execFile = realExecFile;
                        done();
                    });
            });
        });

        it('failed test', (done) => {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'FAILED' });
            bigIp.loadUcs('foo')
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('never complete test', (done) => {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'PENDING' });
            utilMock.DEFAULT_RETRY = { maxRetries: 0, retryIntervalMs: 0 };
            bigIp.loadUcs('/tmp/foo', undefined, undefined, utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('mcp never ready test', (done) => {
            const message = 'mcp is not ready';
            bigIp.ready = function ready() {
                return q.reject(new Error(message));
            };

            bigIp.loadUcs('/tmp/foo', undefined, undefined, utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Should have thrown mcp not ready');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        describe('password url tests', () => {
            it('basic test', (done) => {
                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                bigIp.init('host', 'user', passwordUrl, { passwordIsUrl: true })
                    .then(() => {
                        bigIp.icontrol = icontrolMock;
                        bigIp.password = '';
                        bigIp.loadUcs('/tmp/foo')
                            .then(() => {
                                assert.strictEqual(bigIp.password, password);
                            })
                            .catch((err) => {
                                assert.ok(false, err);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                                done();
                            });
                    });
            });

            it('get data from url error test', (done) => {
                const message = 'getDataFromUrl error';

                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                bigIp.init('host', 'user', passwordUrl, { passwordIsUrl: true })
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
                                done();
                            });
                    });
            });

            it('decrypt password error test', (done) => {
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
                        bigIp.loadUcs('/tmp/foo', {}, { initLocalKeys: true })
                            .then(() => {
                                assert.ok(false, 'should have thrown getDataFromUrl error');
                            })
                            .catch((err) => {
                                assert.strictEqual(err.message, message);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                                done();
                            });
                    });
            });
        });
    });

    describe('ping tests', () => {
        it('no address test', (done) => {
            bigIp.ping()
                .then(() => {
                    assert.ok(false, 'Ping with no address should have been rejected.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Address is required'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('packets received test', (done) => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    // eslint-disable-next-line max-len
                    commandResult: 'PING 104.219.104.168 (104.219.104.168) 56(84) bytes of data.\n64 bytes from 104.219.104.168: icmp_seq=1 ttl=240 time=43.5 ms\n\n--- 104.219.104.168 ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss, time 43ms\nrtt min/avg/max/mdev = 43.593/43.593/43.593/0.000 ms\n'
                }
            );
            bigIp.ping('1.2.3.4')
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

        it('no packets received test', (done) => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    // eslint-disable-next-line max-len
                    commandResult: 'PING 1.2.3.4 (1.2.3.4) 56(84) bytes of data.\n\n--- 1.2.3.4 ping statistics ---\n2 packets transmitted, 0 received, 100% packet loss, time 2000ms\n\n'
                }
            );
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with no packets should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('unknown host test', (done) => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    commandResult: 'ping: unknown host f5.com\n'
                }
            );
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with unknown host should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('unexpected response test', (done) => {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    commandResult: 'foobar'
                }
            );
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with unexpected response should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('no response test', (done) => {
            icontrolMock.setDefaultResponse(undefined);
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                undefined
            );
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ping with no response should have failed.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
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

        it('basic test', (done) => {
            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(true);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('availability fail test', (done) => {
            icontrolMock.fail(
                'list',
                '/shared/echo/available'
            );

            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ready should have failed availability.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('mcp not ready test', (done) => {
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

            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ready should have failed MCP check.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('mcp check reject test', (done) => {
            icontrolMock.fail('list', '/tm/sys/mcp-state');

            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'MCP check should have rejected.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('sys not ready test', (done) => {
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

            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'Ready should have failed sys ready check.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('sys ready 13_0 no op test', (done) => {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '13.0.0'
                }
            );

            // fail any call to the sys ready endpoint
            icontrolMock.fail('list', '/tm/sys/ready');

            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(true);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    it('reboot test', (done) => {
        icontrolMock.when('create', '/tm/sys', {});
        bigIp.reboot()
            .then(() => {
                assert.strictEqual(icontrolMock.lastCall.method, 'create');
                assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys');
                assert.strictEqual(icontrolMock.lastCall.body.command, 'reboot');
            })
            .catch((err) => {
                assert.ok(false, err);
            })
            .finally(() => {
                done();
            });
    });

    describe('reboot required tests', () => {
        it('reboot required test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {
                    value: 'reboot'
                }
            );

            bigIp.rebootRequired()
                .then((rebootRequired) => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'list');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/db/provision.action');
                    assert.ok(rebootRequired, 'Reboot should have been required.');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('reboot not required test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {
                    value: 'none'
                }
            );

            bigIp.rebootRequired()
                .then((rebootRequired) => {
                    assert.ifError(rebootRequired);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('unexpected response test', (done) => {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {}
            );

            bigIp.rebootRequired(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'rebootRequired with no value should not have resolved.');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('no value'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('failed action check test', (done) => {
            icontrolMock.fail('list', '/tm/sys/db/provision.action');
            bigIp.rebootRequired(utilMock.NO_RETRY)
                .then(() => {
                    assert.ok(false, 'rebootRequired with failed action check should not have resolved.');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('run task tests', () => {
        beforeEach(() => {
            icontrolMock.when('create', DUMMY_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'COMPLETED' });
            utilMock.DEFAULT_RETRY = { maxRetries: 10, retryIntervalMs: 10 };
        });

        it('basic test', (done) => {
            const commandBody = { foo: 'bar', hello: 'world' };
            bigIp.runTask(DUMMY_TASK_PATH, commandBody)
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', DUMMY_TASK_PATH), commandBody);
                    assert.deepEqual(
                        icontrolMock.getRequest('replace', `${DUMMY_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('options test', (done) => {
            icontrolMock.when('create', DUMMY_TASK_PATH, { id: '1234' });
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { status: 'FINISHED' });

            const commandBody = { foo: 'bar', hello: 'world' };
            const options = { idAttribute: 'id', validate: false, statusAttribute: 'status' };
            bigIp.runTask(DUMMY_TASK_PATH, commandBody, options)
                .then(() => {
                    assert.deepEqual(icontrolMock.getRequest('create', DUMMY_TASK_PATH), commandBody);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('created task status test', (done) => {
            icontrolMock.when('create', DUMMY_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'CREATED' });
            icontrolMock.whenNext('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'FINISHED' });

            const commandBody = { foo: 'bar', hello: 'world' };
            bigIp.runTask(DUMMY_TASK_PATH, commandBody)
                .then(() => {
                    assert.strictEqual(icontrolMock.getNumRequests('list', `${DUMMY_TASK_PATH}/1234`), 2);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('failed test', (done) => {
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234`, { _taskState: 'FAILED' });
            bigIp.runTask(DUMMY_TASK_PATH, {}, { neverReject: true })
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('save tests', () => {
        it('no file test', (done) => {
            icontrolMock.when('create', '/tm/sys/config', {});

            bigIp.save()
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.method, 'create');
                    assert.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                    assert.strictEqual(icontrolMock.lastCall.body.command, 'save');
                    assert.strictEqual(icontrolMock.lastCall.body.options, undefined);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('file test', (done) => {
            icontrolMock.when('create', '/tm/sys/config', {});

            bigIp.save('foo')
                .then(() => {
                    assert.strictEqual(icontrolMock.lastCall.body.options[0].file, 'foo');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
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

        it('basic test', (done) => {
            bigIp.saveUcs('foo')
                .then(() => {
                    assert.deepEqual(
                        icontrolMock.getRequest('replace', `${UCS_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('failed test', (done) => {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234`, { _taskState: 'FAILED' });
            bigIp.saveUcs('foo')
                .then(() => {
                    assert.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('transaction tests', () => {
        it('basic test', (done) => {
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

            bigIp.transaction(commands)
                .then(() => {
                    assert.strictEqual(icontrolMock.getRequest('list', '/foo/bar'), null);
                    assert.deepEqual(icontrolMock.getRequest('create', '/bar/foo'), { foo: 'bar' });
                    assert.deepEqual(icontrolMock.getRequest('modify', 'hello/world', { roger: 'dodger' }));
                    assert.deepEqual(icontrolMock.getRequest('delete', '/okie/dokie'), { hello: 'world' });
                    assert.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/transaction/1234'), { state: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('incomplete test', (done) => {
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

            bigIp.transaction(commands)
                .then(() => {
                    assert.ok(false, 'Transaction should have rejected incomplete');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('not completed'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('no commands test', (done) => {
            bigIp.transaction()
                .then(() => {
                    assert.ok(true);
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
