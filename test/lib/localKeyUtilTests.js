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
const assert = require('assert');

describe('local crypto util tests', () => {
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

    beforeEach(() => {
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
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
        fsMock.writeFile = realWriteFile;
    });

    describe('generate and install key pair tests', () => {
        beforeEach(() => {
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/tmsh -a list sys crypto key')) {
                    cb(null, false);
                } else if (command.startsWith('/usr/bin/tmsh -a list sys folder')) {
                    cb(null, {});
                } else if (command.startsWith('/usr/bin/tmsh -a create sys folder')) {
                    bigIpFolderCreated = true;
                    cb(null, null);
                } else if (command.startsWith('/usr/bin/tmsh -a install')) {
                    installCmd = command;
                    cb(null, null);
                } else {
                    cb(null, null);
                }
            };
        });

        it('private key created test', (done) => {
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ok(keyPairGenerated);
                    assert.ok(installCmd.endsWith(`passphrase ${passphrase}`));
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('private key exists test', (done) => {
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
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ifError(keyPairGenerated);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('private key exists force test', (done) => {
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('ls -1t')) {
                    cb(null, `:${privateKeyFolder}:${privateKeyName}.key`);
                } else {
                    cb(null, 'ok');
                }
            };
            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName,
                { force: true }
            )
                .then(() => {
                    assert.ok(keyPairGenerated);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('directory created test', (done) => {
            fsMock.access = function access(file, cb) {
                cb(new Error());
            };

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ok(dirCreated);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('directory exists test', (done) => {
            fsMock.access = function access(file, cb) {
                cb();
            };

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ifError(dirCreated);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('directory create error test', (done) => {
            const message = 'cannot make directory';

            fsMock.access = function access(file, cb) {
                cb(new Error());
            };

            fsMock.mkdir = function mkdir(dir, cb) {
                cb(new Error(message));
            };

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ok(false, 'should have thrown mkdir error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('bigip folder created test', (done) => {
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

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ok(bigIpFolderCreated);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        }).timeout(150000);

        it('bigip folder exists test', (done) => {
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

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ifError(bigIpFolderCreated);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('temp private key removed test', (done) => {
            let fileDeleted = false;
            fsMock.unlink = function unlink(file, cb) {
                fileDeleted = true;
                cb();
            };

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ok(fileDeleted);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('bigip not ready test', (done) => {
            const message = 'mcp not ready';
            childProcessMock.execFile = function execFile(file, cb) {
                cb(new Error(message));
            };

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ok(false, 'should have thrown mkdir error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('install error test', (done) => {
            const message = 'install failed';
            childProcessMock.exec = function exec(command, cb) {
                if (command.startsWith('/usr/bin/tmsh -a install')) {
                    cb(new Error(message));
                } else {
                    cb(null, null);
                }
            };

            localKeyUtil.generateAndInstallKeyPair(
                publicKeyDirctory,
                publicKeyOutFile,
                privateKeyFolder,
                privateKeyName
            )
                .then(() => {
                    assert.ok(false, 'should have thrown install error');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf(message), -1);
                })
                .finally(() => {
                    done();
                });
        }).timeout(150000);
    });

    describe('get private key file path tests', () => {
        it('with suffix test', (done) => {
            const folder = 'hello';
            const name = 'world';
            const suffix = '_1234_1';

            childProcessMock.exec = function exec(command, cb) {
                const shellOut = `:${folder}:${name}.key${suffix}`;
                cb(null, shellOut);
            };

            localKeyUtil.getPrivateKeyFilePath(folder, name)
                .then((path) => {
                    assert.strictEqual(
                        path,
                        `/config/filestore/files_d/${folder}_d/certificate_key_d/:${folder}:${name}.key${suffix}` // eslint-disable-line max-len
                    );
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('no suffix test', (done) => {
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

            localKeyUtil.getPrivateKeyFilePath(folder, name)
                .then((path) => {
                    assert.strictEqual(
                        path,
                        `/config/filestore/files_d/${folder}_d/certificate_key_d/:${folder}:${name}${suffix}`
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

    it('get private key metadata test', (done) => {
        const folder = 'hello';
        const name = 'world';

        childProcessMock.exec = function exec(command, cb) {
            // eslint-disable-next-line max-len
            const tmshOut = `sys file ssl-key /CloudLibsLocal/cloudLibsLocalPrivate.key { passphrase ${passphrase} security-type password }`;
            cb(null, tmshOut);
        };

        localKeyUtil.getPrivateKeyMetadata(folder, name)
            .then((metadata) => {
                assert.strictEqual(metadata.passphrase, passphrase);
            })
            .catch((err) => {
                assert.ok(false, err);
            })
            .finally(() => {
                done();
            });
    });
});
