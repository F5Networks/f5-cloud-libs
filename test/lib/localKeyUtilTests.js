/**
 * Copyright 2017-2018 F5 Networks, Inc.
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
const fsMock = require('fs');

const realWriteFile = fsMock.writeFile;

const passphrase = 'abc123';

const publicKeyDirctory = 'myPublicKeyDir';
const publicKeyOutFile = 'myPublicKeyOutFile';
const privateKeyFolder = 'myPrivateKeyFolder';
const privateKeyName = 'myPrivateKeyName.key';

let childProcessMock;
let cryptoUtilMock;
let localKeyUtil;

let dirCreated;
let keyPairGenerated;
let bigIpFolderCreated;
let installCmd;

/* eslint-disable global-require */
module.exports = {
    setUp(callback) {
        childProcessMock = require('child_process');
        cryptoUtilMock = require('../../lib/cryptoUtil');
        localKeyUtil = require('../../lib/localKeyUtil');

        dirCreated = false;
        keyPairGenerated = false;
        bigIpFolderCreated = false;
        installCmd = undefined;

        childProcessMock.exec = function exec(command, cb) {
            if (command.startsWith('/usr/bin/tmsh -a install')) {
                installCmd = command;
            }

            cb(null, null);
        };
        childProcessMock.execFile = function execFile(file, cb) {
            cb();
        };
        cryptoUtilMock.generateKeyPair = function generateKeyPair() {
            keyPairGenerated = true;
            return q();
        };

        cryptoUtilMock.encrypt = function encrypt() {
            return q();
        };
        cryptoUtilMock.generateRandomBytes = function generateRandomBytes() {
            return q(passphrase);
        };

        fsMock.writeFile = function writeFile(file, data, options, cb) {
            cb();
        };
        fsMock.mkdir = function mkdir(dir, cb) {
            dirCreated = true;
            cb();
        };
        fsMock.access = function access(file, cb) {
            cb();
        };

        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        fsMock.writeFile = realWriteFile;
        callback();
    },

    testGenerateAndInstallKeyPair: {
        setUp(callback) {
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/tmsh -a list sys crypto key')) {
                    cb(null, false);
                } else if (command.startsWith('/usr/bin/tmsh -a list sys folder')) {
                    cb(null, {});
                } else if (command.startsWith('/usr/bin/tmsh -a install')) {
                    installCmd = command;
                    cb(null, null);
                } else {
                    cb(null, null);
                }
            };

            callback();
        },

        testPrivateKeyCreated(test) {
            test.expect(2);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ok(keyPairGenerated);
                    test.ok(installCmd.endsWith(`passphrase ${passphrase}`));
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPrivateKeyExists(test) {
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/tmsh -a list sys crypto key')) {
                    cb(null, 'ok');
                } else if (command.startsWith('/usr/bin/tmsh -a list sys file ssl-key')) {
                    cb(null, 'ok');
                } else if (command.startsWith('ls -1t')) {
                    cb(null, `:${privateKeyFolder}:${privateKeyName}.key`);
                } else {
                    cb();
                }
            };
            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ifError(keyPairGenerated);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testPrivateKeyExistsForce(test) {
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('ls -1t')) {
                    cb(null, `:${privateKeyFolder}:${privateKeyName}.key`);
                } else {
                    cb(null, 'ok');
                }
            };
            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName,
                { force: true }
            )
                .then(() => {
                    test.ok(keyPairGenerated);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDirectoryCreated(test) {
            fsMock.access = function access(file, cb) {
                cb(new Error());
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ok(dirCreated);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDirectoryExists(test) {
            fsMock.access = function access(file, cb) {
                cb();
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ifError(dirCreated);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDirectoryCreateError(test) {
            const message = 'cannot make directory';

            fsMock.access = function access(file, cb) {
                cb(new Error());
            };

            fsMock.mkdir = function mkdir(dir, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ok(false, 'should have thrown mkdir error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBigIpFolderCreated(test) {
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/tmsh -a list sys folder')) {
                    cb(new Error());
                } else if (command.startsWith('/usr/bin/tmsh -a create sys folder')) {
                    bigIpFolderCreated = true;
                    cb(null, null);
                } else {
                    cb(null, null);
                }
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ok(bigIpFolderCreated);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBigIpFolderExists(test) {
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/tmsh -a list sys folder')) {
                    cb(null, null);
                } else if (command.startsWith('/usr/bin/tmsh -a create sys folder')) {
                    bigIpFolderCreated = true;
                    cb(null, null);
                } else {
                    cb(null, null);
                }
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ifError(bigIpFolderCreated);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testTempPrivateKeyRemoved(test) {
            let fileDeleted = false;
            fsMock.unlink = function unlink(file, cb) {
                fileDeleted = true;
                cb();
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ok(fileDeleted);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBigIpNotReady(test) {
            const message = 'mcp not ready';
            childProcessMock.execFile = function execFile(file, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ok(false, 'should have thrown mkdir error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testInstallError(test) {
            const message = 'install failed';
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/tmsh -a install')) {
                    cb(new Error(message));
                } else {
                    cb(null, null);
                }
            };

            test.expect(1);
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    test.ok(false, 'should have thrown install error');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf(message), -1);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGetPrivateKeyFilePath: {
        testWithSuffix(test) {
            const folder = 'hello';
            const name = 'world';
            const suffix = '_1234_1';

            childProcessMock.exec = function exec(command, cb) {
                const shellOut = `:${folder}:${name}.key${suffix}`;
                cb(null, shellOut);
            };

            test.expect(1);
            localKeyUtil.getPrivateKeyFilePath(folder, name)
                .then((path) => {
                    test.strictEqual(
                        path,
                        `/config/filestore/files_d/${folder}_d/certificate_key_d/:${folder}:${name}.key${suffix}` // eslint-disable-line max-len
                    );
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNoSuffix(test) {
            const folder = 'hello';
            const name = 'world';
            const suffix = '_1234_1';

            childProcessMock.exec = function exec(command, cb) {
                const shellOut = `:${folder}:${name}${suffix}`;
                if (command === '/usr/bin/tmsh -a list sys crypto key /hello/world.key') {
                    cb(new Error('01020036:3: The requested Certificate Key File was not found'));
                }
                cb(null, shellOut);
            };

            test.expect(1);
            localKeyUtil.getPrivateKeyFilePath(folder, name)
                .then((path) => {
                    test.strictEqual(
                        path,
                        `/config/filestore/files_d/${folder}_d/certificate_key_d/:${folder}:${name}${suffix}`
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

    testGetPrivateKeyMetadata(test) {
        const folder = 'hello';
        const name = 'world';

        childProcessMock.exec = function exec(command, cb) {
            // eslint-disable-next-line max-len
            const tmshOut = `sys file ssl-key /CloudLibsLocal/cloudLibsLocalPrivate.key { passphrase ${passphrase} security-type password }`;
            cb(null, tmshOut);
        };

        test.expect(1);
        localKeyUtil.getPrivateKeyMetadata(folder, name)
            .then((metadata) => {
                test.strictEqual(metadata.passphrase, passphrase);
            })
            .catch((err) => {
                test.ok(false, err);
            })
            .finally(() => {
                test.done();
            });
    }
};
