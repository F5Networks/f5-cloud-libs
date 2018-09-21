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

const fs = require('fs');
const q = require('q');
const childProcessMock = require('child_process');

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
const privateKeyMetadata = {
    foo: 'bar',
    hello: 'world'
};

module.exports = {
    setUp(callback) {
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

        realReady = bigIp.ready; // Store this so we can test the ready function
        bigIp.ready = function ready() {
            return q();
        };
        // we have to call init so we can wait till it's done to set icontrol
        bigIp.init('host', 'user', 'password')
            .then(() => {
                icontrolMock.reset();
                callback();
            });
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        setTimeout = realSetTimeout; // eslint-disable-line no-global-assign
        fs.unlink = realUnlink;
        fs.access = realAccess;
        childProcessMock.execFile = realExecFile;

        callback();
        /* eslint-enable global-require */
    },

    testConstructor(test) {
        test.doesNotThrow(() => {
            // eslint-disable-next-line no-unused-vars
            const x = new BigIp({
                logger: {}
            });
        });
        test.done();
    },

    testActive: {
        testActive(test) {
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

            test.expect(1);
            bigIp.active()
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

        testStandby(test) {
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

            test.expect(1);
            bigIp.active()
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

        testNotActive(test) {
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

            test.expect(1);
            bigIp.active(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'BIG-IP should not be active.');
                })
                .catch((err) => {
                    test.strictEqual(err.name, 'ActiveError');
                })
                .finally(() => {
                    test.done();
                });
        },

        testActiveThrow(test) {
            icontrolMock.fail('list', '/tm/cm/failover-status');

            test.expect(1);
            bigIp.active(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'BIG-IP should not be active.');
                })
                .catch((err) => {
                    test.strictEqual(err.name, 'ActiveError');
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testCreateOrModify: {
        testDoesNotExist(test) {
            const error404 = new Error('does not exist');
            error404.code = 404;
            icontrolMock.fail(
                'list',
                '/tm/sys/foo/bar',
                error404
            );

            bigIp.createOrModify('/tm/sys/foo', { name: 'bar' })
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testExists(test) {
            bigIp.createOrModify('/tm/sys/foo', { name: 'bar' })
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'modify');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/bar');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testDelete(test) {
        icontrolMock.when('delete', '/tm/sys/foo/bar', {});

        test.expect(2);
        bigIp.delete('/tm/sys/foo/bar')
            .then(() => {
                test.strictEqual(icontrolMock.lastCall.method, 'delete');
                test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/foo/bar');
            })
            .catch((err) => {
                test.ok(false, err.message);
            })
            .finally(() => {
                test.done();
            });
    },

    testInit: {
        testBasic(test) {
            const host = 'myHost';
            const user = 'myUser';
            const password = 'myPassword';
            const port = 1234;
            bigIp = new BigIp();
            bigIp.ready = () => {
                return q();
            };

            test.expect(5);
            // we have to call init here w/ the same params as the ctor can't
            // be async.
            bigIp.init(host, user, password, { port })
                .then(() => {
                    test.strictEqual(bigIp.host, host);
                    test.strictEqual(bigIp.user, user);
                    test.strictEqual(bigIp.password, password);
                    test.strictEqual(bigIp.port, port);
                    // Test that for BIG-IP, we do not add in the BIG-IQ mixins
                    test.strictEqual(bigIp.onboard.isMasterKeySet, undefined);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotInitialized(test) {
            bigIp = new BigIp();

            test.expect(1);
            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Uninitialized BIG-IP should not be ready');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBigIq(test) {
            bigIp = new BigIp();
            bigIp.ready = () => {
                return q();
            };

            utilMock.getProduct = () => {
                return q('BIG-IQ');
            };

            test.expect(1);
            bigIp.init('host', 'user', 'password')
                .then(() => {
                    // test that BIG-IQ mixins were added
                    test.notStrictEqual(bigIp.onboard.isMasterKeySet, undefined);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testGetProductOption: {
            setUp(callback) {
                bigIp.product = null;
                getProductCalled = false;
                utilMock.getProduct = () => {
                    getProductCalled = true;
                    return q('BIG-IP');
                };

                callback();
            },

            testProductSpecified(test) {
                test.expect(1);
                bigIp.init('host', 'user', 'password', { product: 'foo' })
                    .then(() => {
                        test.strictEqual(getProductCalled, false);
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testProductNotSpecified(test) {
                test.expect(1);
                bigIp.init('host', 'user', 'password')
                    .then(() => {
                        test.strictEqual(getProductCalled, true);
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            }
        }
    },

    testList(test) {
        test.expect(1);
        bigIp.list()
            .then(() => {
                test.strictEqual(icontrolMock.lastCall.method, 'list');
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testCreateFolder: {
        testBasic(test) {
            const folderName = 'foo';

            icontrolMock.when(
                'list',
                '/tm/sys/folder',
                []
            );

            test.expect(2);
            bigIp.createFolder(folderName)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.deepEqual(
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
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAlreadyExists(test) {
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

            test.expect(1);
            bigIp.createFolder(folderName)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testOptions(test) {
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

            test.expect(2);
            bigIp.createFolder(folderName, options)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.deepEqual(
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
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGetPrivateKeyFilePath: {
        testBasic(test) {
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
                    test.strictEqual(privateKeyFilePath, '/config/filestore/files_d/CloudLibs_d/certificate_key_d/:CloudLibs:cloudLibsPrivate.key_1234_1');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNotFound(test) {
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
                    test.strictEqual(privateKeyFilePath, undefined);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testInstallPrivateKey: {
        setUp(callback) {
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

            callback();
        },

        testBasic(test) {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            const keyFile = '/foo/bar';
            const expectedBody = {
                command: 'install',
                name: '/CloudLibs/cloudLibsPrivate',
                fromLocalFile: keyFile
            };

            icontrolMock.when('create', '/tm/sys/crypto/key', {});

            test.expect(2);
            bigIp.installPrivateKey(keyFile, folder, name)
                .then(() => {
                    test.deepEqual(icontrolMock.getRequest('create', '/tm/sys/crypto/key'), expectedBody);
                    test.strictEqual(removedFile, keyFile);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testEncryptedPassphrase(test) {
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

            test.expect(2);
            bigIp.installPrivateKey(keyFile, folder, name, { passphrase })
                .then(() => {
                    test.deepEqual(icontrolMock.getRequest('create', '/tm/sys/crypto/key'), expectedBody);
                    test.strictEqual(removedFile, keyFile);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testUnlinkErrorIgnored(test) {
            const folder = 'CloudLibs';
            const name = 'cloudLibsPrivate';

            const keyFile = '/foo/bar';

            icontrolMock.when('create', '/tm/sys/crypto/key', {});

            fs.unlink = function unlink(file, cb) {
                cb(new Error());
            };

            test.expect(1);
            bigIp.installPrivateKey(keyFile, folder, name)
                .then(() => {
                    test.ok(true);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGetPrivateKeyMetadata: {
        test13_0(test) {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '13.1.0'
                }
            );

            icontrolMock.when(
                'list',
                `/tm/sys/file/ssl-key/~${privateKeyFolder}~${privateKeyName}.key`,
                privateKeyMetadata
            );

            bigIp.getPrivateKeyMetadata(privateKeyFolder, privateKeyName)
                .then((response) => {
                    test.deepEqual(response, privateKeyMetadata);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        test14_0(test) {
            icontrolMock.when(
                'list',
                '/shared/identified-devices/config/device-info',
                {
                    version: '14.0.0'
                }
            );

            icontrolMock.when(
                'list',
                `/tm/sys/file/ssl-key/~${privateKeyFolder}~${privateKeyName}`,
                privateKeyMetadata
            );

            bigIp.getPrivateKeyMetadata(privateKeyFolder, privateKeyName)
                .then((response) => {
                    test.deepEqual(response, privateKeyMetadata);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGetPassword(test) {
        bigIp.getPassword()
            .then((response) => {
                test.strictEqual(response, 'password');
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testLoadConfig: {
        testNoFile(test) {
            test.expect(4);
            bigIp.loadConfig()
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                    test.strictEqual(icontrolMock.lastCall.body.command, 'load');
                    test.strictEqual(icontrolMock.lastCall.body.name, 'default');
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFile(test) {
            const fileName = 'foobar';

            test.expect(1);
            bigIp.loadConfig(fileName)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.body.options[0].file, fileName);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testOptions(test) {
            const options = {
                foo: 'bar',
                hello: 'world'
            };

            test.expect(2);
            bigIp.loadConfig(null, options)
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.body.options[0].foo, options.foo);
                    test.strictEqual(icontrolMock.lastCall.body.options[1].hello, options.hello);
                })
                .catch((err) => {
                    test.ok(false, err.message);
                })
                .finally(() => {
                    test.done();
                });
        },
    },

    testLoadUcs: {
        setUp(callback) {
            icontrolMock.when('create', UCS_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234/result`, { _taskState: 'COMPLETED' });

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

            callback();
        },

        testBasic(test) {
            test.expect(1);
            bigIp.loadUcs('/tmp/foo')
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('replace', `${UCS_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testLoadOptions(test) {
            test.expect(1);
            bigIp.loadUcs('/tmp/foo', { foo: 'bar', hello: 'world' })
                .then(() => {
                    const command = icontrolMock.getRequest('create', UCS_TASK_PATH);
                    test.deepEqual(command.options, [{ foo: 'bar' }, { hello: 'world' }]);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRestoreUser(test) {
            const encryptedPassword = 'myEncryptedPassword';

            let dataWritten;

            bigIp.initOptions = {
                passwordIsUrl: true,
                passwordEncrypted: true
            };

            utilMock.runTmshCommand = function runTmshCommand() {
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

            test.expect(1);
            bigIp.loadUcs('/tmp/foo', undefined, { initLocalKeys: true, restoreUser: true })
                .then(() => {
                    test.strictEqual(dataWritten, encryptedPassword);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    childProcessMock.execFile = realExecFile;
                    test.done();
                });
        },

        testFailed(test) {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234/result`, { _taskState: 'FAILED' });
            test.expect(1);
            bigIp.loadUcs('foo')
                .then(() => {
                    test.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNeverComplete(test) {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234/result`, { _taskState: 'PENDING' });
            utilMock.DEFAULT_RETRY = { maxRetries: 0, retryIntervalMs: 0 };
            test.expect(1);
            bigIp.loadUcs('/tmp/foo', undefined, undefined, utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMcpNeverReady(test) {
            const message = 'mcp is not ready';
            bigIp.ready = function ready() {
                return q.reject(new Error(message));
            };

            test.expect(1);
            bigIp.loadUcs('/tmp/foo', undefined, undefined, utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Should have thrown mcp not ready');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRestjavadRestart(test) {
            icontrolMock.fail('list', `${UCS_TASK_PATH}/1234/result`);
            test.expect(1);
            bigIp.loadUcs('/tmp/foo', undefined, undefined, utilMock.NO_RETRY)
                .then(() => {
                    test.ok(true);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPasswordUrl: {
            testBasic(test) {
                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                test.expect(1);
                bigIp.init('host', 'user', passwordUrl, { passwordIsUrl: true })
                    .then(() => {
                        bigIp.icontrol = icontrolMock;
                        bigIp.password = '';
                        bigIp.loadUcs('/tmp/foo')
                            .then(() => {
                                test.strictEqual(bigIp.password, password);
                            })
                            .catch((err) => {
                                test.ok(false, err);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                                test.done();
                            });
                    });
            },

            testGetDataFromUrlError(test) {
                const message = 'getDataFromUrl error';

                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                test.expect(1);
                bigIp.init('host', 'user', passwordUrl, { passwordIsUrl: true })
                    .then(() => {
                        utilMock.getDataFromUrl = function getDataFromUrl() {
                            return q.reject(new Error(message));
                        };

                        bigIp.icontrol = icontrolMock;
                        bigIp.password = '';
                        bigIp.loadUcs('/tmp/foo')
                            .then(() => {
                                test.ok(false, 'should have thrown getDataFromUrl error');
                            })
                            .catch((err) => {
                                test.strictEqual(err.message, message);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                                test.done();
                            });
                    });
            },

            testDecryptPasswordError(test) {
                const message = 'encrypt password error';

                const password = 'myPassword';
                const passwordFile = '/tmp/passwordFromUrlTest';
                const passwordUrl = `file://${passwordFile}`;

                fs.writeFileSync(passwordFile, password);

                test.expect(1);
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
                                test.ok(false, 'should have thrown getDataFromUrl error');
                            })
                            .catch((err) => {
                                test.strictEqual(err.message, message);
                            })
                            .finally(() => {
                                fs.unlinkSync(passwordFile);
                                test.done();
                            });
                    });
            }
        }
    },

    testPing: {
        testNoAddress(test) {
            test.expect(1);
            bigIp.ping()
                .then(() => {
                    test.ok(false, 'Ping with no address should have been rejected.');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('Address is required'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPacketsReceived(test) {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    // eslint-disable-next-line max-len
                    commandResult: 'PING 104.219.104.168 (104.219.104.168) 56(84) bytes of data.\n64 bytes from 104.219.104.168: icmp_seq=1 ttl=240 time=43.5 ms\n\n--- 104.219.104.168 ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss, time 43ms\nrtt min/avg/max/mdev = 43.593/43.593/43.593/0.000 ms\n'
                }
            );
            test.expect(1);
            bigIp.ping('1.2.3.4')
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

        testNoPacketsReceived(test) {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    // eslint-disable-next-line max-len
                    commandResult: 'PING 1.2.3.4 (1.2.3.4) 56(84) bytes of data.\n\n--- 1.2.3.4 ping statistics ---\n2 packets transmitted, 0 received, 100% packet loss, time 2000ms\n\n'
                }
            );
            test.expect(1);
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Ping with no packets should have failed.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testUnknownHost(test) {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    commandResult: 'ping: unknown host f5.com\n'
                }
            );
            test.expect(1);
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Ping with unknown host should have failed.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testUnexpectedResponse(test) {
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                {
                    commandResult: 'foobar'
                }
            );
            test.expect(1);
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Ping with unexpected response should have failed.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoResponse(test) {
            icontrolMock.setDefaultResponse(undefined);
            icontrolMock.when(
                'create',
                '/tm/util/ping',
                undefined
            );
            test.expect(1);
            bigIp.ping('1.2.3.4', utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Ping with no response should have failed.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testReady: {
        setUp(callback) {
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
                '/tm/sys/mcp-state/',
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

            callback();
        },

        testBasic(test) {
            test.expect(1);
            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(true);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testAvailabilityFail(test) {
            icontrolMock.fail(
                'list',
                '/shared/echo/available'
            );

            test.expect(1);
            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Ready should have failed availability.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMcpNotReady(test) {
            icontrolMock.when(
                'list',
                '/tm/sys/mcp-state/',
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

            test.expect(1);
            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'Ready should have failed MCP check.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMcpCheckReject(test) {
            icontrolMock.fail('list', '/tm/sys/mcp-state/');

            test.expect(1);
            bigIp.ready(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'MCP check should have rejected.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testReboot(test) {
        icontrolMock.when('create', '/tm/sys', {});
        test.expect(3);
        bigIp.reboot()
            .then(() => {
                test.strictEqual(icontrolMock.lastCall.method, 'create');
                test.strictEqual(icontrolMock.lastCall.path, '/tm/sys');
                test.strictEqual(icontrolMock.lastCall.body.command, 'reboot');
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    },

    testRebootRequired: {
        testRebootRequired(test) {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {
                    value: 'reboot'
                }
            );

            test.expect(3);
            bigIp.rebootRequired()
                .then((rebootRequired) => {
                    test.strictEqual(icontrolMock.lastCall.method, 'list');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/db/provision.action');
                    test.ok(rebootRequired, 'Reboot should have been required.');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testRebootNotRequired(test) {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {
                    value: 'none'
                }
            );

            test.expect(1);
            bigIp.rebootRequired()
                .then((rebootRequired) => {
                    test.ifError(rebootRequired);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testUnexpectedResponse(test) {
            icontrolMock.when(
                'list',
                '/tm/sys/db/provision.action',
                {}
            );

            test.expect(1);
            bigIp.rebootRequired(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'rebootRequired with no value should not have resolved.');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('no value'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFailedActionCheck(test) {
            icontrolMock.fail('list', '/tm/sys/db/provision.action');
            test.expect(1);
            bigIp.rebootRequired(utilMock.NO_RETRY)
                .then(() => {
                    test.ok(false, 'rebootRequired with failed action check should not have resolved.');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRunTask: {
        setUp(callback) {
            icontrolMock.when('create', DUMMY_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234/result`, { _taskState: 'COMPLETED' });

            // eslint-disable-next-line no-global-assign
            setTimeout = function (cb) {
                cb();
            };

            callback();
        },

        testBasic(test) {
            const commandBody = { foo: 'bar', hello: 'world' };
            test.expect(2);
            bigIp.runTask(DUMMY_TASK_PATH, commandBody)
                .then(() => {
                    test.deepEqual(icontrolMock.getRequest('create', DUMMY_TASK_PATH), commandBody);
                    test.deepEqual(
                        icontrolMock.getRequest('replace', `${DUMMY_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFailed(test) {
            icontrolMock.when('list', `${DUMMY_TASK_PATH}/1234/result`, { _taskState: 'FAILED' });
            test.expect(1);
            bigIp.runTask(DUMMY_TASK_PATH)
                .then(() => {
                    test.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testSave: {
        testNoFile(test) {
            icontrolMock.when('create', '/tm/sys/config', {});

            test.expect(4);
            bigIp.save()
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.method, 'create');
                    test.strictEqual(icontrolMock.lastCall.path, '/tm/sys/config');
                    test.strictEqual(icontrolMock.lastCall.body.command, 'save');
                    test.strictEqual(icontrolMock.lastCall.body.options, undefined);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFile(test) {
            icontrolMock.when('create', '/tm/sys/config', {});

            test.expect(1);
            bigIp.save('foo')
                .then(() => {
                    test.strictEqual(icontrolMock.lastCall.body.options[0].file, 'foo');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testSaveUcs: {
        setUp(callback) {
            icontrolMock.when('create', UCS_TASK_PATH, { _taskId: '1234' });
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234/result`, { _taskState: 'COMPLETED' });

            fs.access = function access(file, cb) {
                cb();
            };

            // eslint-disable-next-line no-global-assign
            setTimeout = function (cb) {
                cb();
            };

            callback();
        },

        testBasic(test) {
            test.expect(1);
            bigIp.saveUcs('foo')
                .then(() => {
                    test.deepEqual(
                        icontrolMock.getRequest('replace', `${UCS_TASK_PATH}/1234`),
                        { _taskState: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFailed(test) {
            icontrolMock.when('list', `${UCS_TASK_PATH}/1234/result`, { _taskState: 'FAILED' });
            test.expect(1);
            bigIp.saveUcs('foo')
                .then(() => {
                    test.ok(false, 'Should not have completed');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testTransaction: {
        testBasic(test) {
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

            test.expect(5);
            bigIp.transaction(commands)
                .then(() => {
                    test.strictEqual(icontrolMock.getRequest('list', '/foo/bar'), null);
                    test.deepEqual(icontrolMock.getRequest('create', '/bar/foo'), { foo: 'bar' });
                    test.deepEqual(icontrolMock.getRequest('modify', 'hello/world', { roger: 'dodger' }));
                    test.deepEqual(icontrolMock.getRequest('delete', '/okie/dokie'), { hello: 'world' });
                    test.deepEqual(
                        icontrolMock.getRequest('modify', '/tm/transaction/1234'), { state: 'VALIDATING' }
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testIncomplete(test) {
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

            test.expect(1);
            bigIp.transaction(commands)
                .then(() => {
                    test.ok(false, 'Transaction should have rejected incomplete');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('not completed'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoCommands(test) {
            test.expect(1);
            bigIp.transaction()
                .then(() => {
                    test.ok(true);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
