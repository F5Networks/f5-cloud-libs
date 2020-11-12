/**
 * Copyright 2016 F5 Networks, Inc.
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

const assert = require('assert');

describe('onboard tests', () => {
    const realExit = process.exit;

    /* eslint-disable global-require */
    const fs = require('fs');
    const q = require('q');
    const util = require('util');
    const ActiveError = require('../../../f5-cloud-libs').activeError;
    const CloudProvider = require('../../lib/cloudProvider');
    const signals = require('../../../f5-cloud-libs').signals;

    let metricsCollectorMock;

    let rebootCalled = false;
    let signalInstanceProvisionedCalled = false;
    const installIlxPackageParams = [];
    let functionsCalled;
    let onboard;
    let ipcMock;
    let utilMock;
    let cryptoUtilMock;
    let exitMessage;
    let exitCode;
    let logErrorMessage;
    let logErrorOptions;

    let bigIpMock;
    let providerMock;
    let localCryptoUtilMock;

    const testOptions = {};

    let argv;
    let rebootRequested;
    let signalsSent;

    // Our tests cause too many event listeners. Turn off the check.
    const options = require('commander');

    options.setMaxListeners(0);

    util.inherits(ProviderMock, CloudProvider);
    function ProviderMock() {
        ProviderMock.super_.call(this);
        this.functionCalls = {};
    }

    ProviderMock.prototype.init = function init() {
        this.functionCalls.init = arguments;
        return q();
    };

    ProviderMock.prototype.signalInstanceProvisioned = () => {
        signalInstanceProvisionedCalled = true;
        return q();
    };

    beforeEach(() => {
        bigIpMock = {
            init() {
                functionsCalled.bigIp.init = arguments;
                return q();
            },

            isBigIp() {
                return true;
            },

            isBigIq() {
                return false;
            },

            list() {
                functionsCalled.bigIp.list = arguments;
                return q();
            },

            modify() {
                functionsCalled.bigIp.modify = arguments;
                return q();
            },

            create() {
                functionsCalled.bigIp.create = arguments;
                return q();
            },

            delete() {
                functionsCalled.bigIp.delete = arguments;
                return q();
            },

            ready() {
                functionsCalled.bigIp.ready = arguments;
                return q();
            },

            save() {
                functionsCalled.bigIp.save = arguments;
                return q();
            },

            active() {
                functionsCalled.bigIp.active = arguments;
                return q();
            },

            ping() {
                functionsCalled.bigIp.ping = arguments;
                return q();
            },

            rebootRequired() {
                functionsCalled.bigIp.rebootRequired = arguments;
                return q(false);
            },

            reboot() {
                functionsCalled.bigIp.reboot = arguments;
                rebootRequested = true;
                return q();
            },

            onboard: {
                globalSettings() {
                    functionsCalled.bigIp.onboard.globalSettings = arguments;
                    return q();
                },

                license() {
                    functionsCalled.bigIp.onboard.license = arguments;
                    return q();
                },

                licenseViaBigIq() {
                    functionsCalled.bigIp.onboard.licenseViaBigIq = arguments;
                    return q();
                },

                password() {
                    functionsCalled.bigIp.onboard.password = arguments;
                    return q();
                },

                provision() {
                    functionsCalled.bigIp.onboard.provision = arguments;
                    return q();
                },

                setDbVars() {
                    functionsCalled.bigIp.onboard.setDbVars = arguments;
                    return q();
                },

                isPrimaryKeySet() {
                    return q(true);
                },

                setPrimaryPassphrase() {
                    functionsCalled.bigIp.onboard.setPrimaryPassphrase = arguments[0];
                    return q();
                },

                updateUser(user, password, role, shell) {
                    functionsCalled.bigIp.onboard.updateUser = arguments;
                    this.updatedUsers = this.updatedUsers || [];
                    this.updatedUsers.push({
                        user,
                        password,
                        role,
                        shell
                    });

                    return q();
                },

                installIlxPackage(packageUri) {
                    installIlxPackageParams.push(packageUri);
                },

                sslPort() {
                    functionsCalled.bigIp.onboard.sslPort = arguments;
                    return q();
                }
            }
        };

        testOptions.bigIp = bigIpMock;

        signalsSent = [];

        /* eslint-disable global-require */
        ipcMock = require('../../lib/ipc');

        ipcMock.once = function once() {
            const deferred = q.defer();
            functionsCalled.ipc.once = arguments;
            return deferred.promise;
        };

        ipcMock.send = (signal) => {
            signalsSent.push(signal);
        };

        cryptoUtilMock = require('../../lib/cryptoUtil');
        utilMock = require('../../lib/util');
        onboard = require('../../scripts/onboard');
        localCryptoUtilMock = require('../../lib/localCryptoUtil');
        metricsCollectorMock = require('../../../f5-cloud-libs').metricsCollector;

        argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];
        rebootRequested = false;
        functionsCalled = {
            bigIp: {
                onboard: {}
            },
            ipc: {},
            metrics: {},
            utilMock: {},
            localCryptoUtilMock: {}
        };

        utilMock.logAndExit = (message, level, code) => {
            exitMessage = message;
            exitCode = code;
        };
        utilMock.logError = (msg, opts) => {
            logErrorMessage = msg;
            logErrorOptions = opts;
        };
        exitMessage = '';
        exitCode = undefined;

        metricsCollectorMock.upload = function upload() {
            functionsCalled.metrics.upload = arguments;
            return q();
        };
    });

    afterEach(() => {
        process.exit = realExit;
        utilMock.removeDirectorySync(ipcMock.signalBasePath);
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    describe('undefined options tests', () => {
        it('no bigiq password test', (done) => {
            const uri = 'uri-path';
            argv.push(
                '--license-pool',
                '--big-iq-host', '1.2.3.4',
                '--big-iq-user', 'user',
                '--big-iq-password',
                '--license-pool-name', 'pool1',
                '--big-iq-password-uri', uri
            );

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[2], uri);
                assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[5].passwordIsUri, true);
                done();
            });
        });

        it('no bigiq password uri test', (done) => {
            const password = 'password';
            argv.push(
                '--license-pool',
                '--big-iq-host', '1.2.3.4',
                '--big-iq-user', 'user',
                '--big-iq-password', password,
                '--license-pool-name', 'pool1',
                '--big-iq-password-uri'
            );

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[2], password);
                assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[5].passwordIsUri, false);
                done();
            });
        });

        it('no metrics test', (done) => {
            argv.push('--metrics');
            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.metrics.upload, undefined);
                done();
            });
        });

        it('no password test', (done) => {
            const passwordUrl = 'https://password';
            argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo',
                '--password-url', passwordUrl, '--password', '--log-level', 'none'];

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.init[2], passwordUrl);
                assert.strictEqual(functionsCalled.bigIp.init[3].passwordIsUrl, true);
                done();
            });
        });

        it('no password uri test', (done) => {
            const password = 'password';
            argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo',
                '--password-url', '--password', password, '--log-level', 'none'];

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.init[2], password);
                assert.strictEqual(functionsCalled.bigIp.init[3].passwordIsUrl, false);
                done();
            });
        });
    });

    describe('required options tests', () => {
        it('no host test', (done) => {
            argv = ['node', 'onboard', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

            onboard.run(argv, testOptions, () => {
                assert.notStrictEqual(exitMessage.indexOf('host'), -1);
                assert.notStrictEqual(logErrorMessage.indexOf('host'), -1);
                assert.strictEqual(logErrorOptions.logLevel, 'none');
                assert.strictEqual(exitCode, 1);
                done();
            });
        });

        it('no password test', (done) => {
            argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '--log-level', 'none'];

            onboard.run(argv, testOptions, () => {
                assert.notStrictEqual(exitMessage.indexOf('password'), -1);
                assert.notStrictEqual(logErrorMessage.indexOf('password'), -1);
                assert.strictEqual(logErrorOptions.logLevel, 'none');
                assert.strictEqual(exitCode, 1);
                done();
            });
        });
    });

    it('wait for test', (done) => {
        argv.push('--wait-for', 'foo');

        ipcMock.once = function once() {
            functionsCalled.ipc.once = arguments;
            return q();
        };

        onboard.run(argv, testOptions, () => {
            assert.strictEqual(functionsCalled.ipc.once[0], 'foo');
            done();
        });
    });

    it('background test', (done) => {
        let runInBackgroundCalled = false;
        utilMock.runInBackgroundAndExit = () => {
            runInBackgroundCalled = true;
        };

        argv.push('--background');

        onboard.run(argv, testOptions, () => {
            assert.ok(runInBackgroundCalled);
            done();
        });
    });

    it('exception signals error test', (done) => {
        const sentSignals = [];

        cryptoUtilMock.createRandomUser = () => {
            return q.reject('err');
        };

        argv = ['node', 'onboard', '--host', '1.2.3.4', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.indexOf(signal) > -1) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        onboard.run(argv, testOptions, () => {
            assert.deepEqual(sentSignals, [signals.ONBOARD_RUNNING, signals.CLOUD_LIBS_ERROR]);
            done();
        });
    });

    it('signal done test', (done) => {
        const sentSignals = [];

        argv = ['node', 'onboard', '--host', '1.2.3.4', '-u', 'foo', '-p', 'bar', '--log-level', 'none'];

        ipcMock.send = (signal) => {
            sentSignals.push(signal);
        };

        ipcMock.once = (signal) => {
            const deferred = q.defer();
            setInterval(() => {
                if (sentSignals.indexOf(signal) > -1) {
                    deferred.resolve();
                }
            }, 100);
            return deferred.promise;
        };
        onboard.run(argv, testOptions, () => {
            assert.deepEqual(sentSignals, [signals.ONBOARD_RUNNING, signals.ONBOARD_DONE]);
            assert.strictEqual(sentSignals.indexOf(signals.CLOUD_LIBS_ERROR), -1);
            done();
        });
    });

    it('no user test', (done) => {
        argv = ['node', 'onboard', '--host', '1.2.3.4', '-p', 'bar', '--log-level', 'none'];

        const randomUser = 'my random user';
        let userCreated;
        let userDeleted;
        cryptoUtilMock.createRandomUser = () => {
            userCreated = true;
            return q({
                user: randomUser
            });
        };
        utilMock.deleteUser = (user) => {
            userDeleted = user;
        };
        onboard.run(argv, testOptions, () => {
            assert.ok(userCreated);
            assert.strictEqual(userDeleted, randomUser);
            done();
        });
    });

    describe('global settings tests', () => {
        it('hostname test', (done) => {
            let hostnameSet;
            bigIpMock.onboard.hostname = (hostname) => {
                hostnameSet = hostname;
            };

            argv.push('--hostname', 'hostname1', '--global-setting', 'hostname:hostname2');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(hostnameSet, 'hostname1');
                assert.strictEqual(functionsCalled.bigIp.onboard.globalSettings[0].hostname, undefined);
                done();
            });
        });

        it('is bigip test', (done) => {
            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.globalSettings[0].guiSetup, 'disabled');
                assert.strictEqual(functionsCalled.bigIp.modify, undefined);
                done();
            });
        });

        it('is bigiq test', (done) => {
            bigIpMock.isBigIq = () => {
                return true;
            };
            bigIpMock.isBigIp = () => {
                return false;
            };

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.globalSettings, undefined);
                assert.deepEqual(
                    functionsCalled.bigIp.modify[1],
                    {
                        isSystemSetup: true,
                        isRootPasswordChanged: true,
                        isAdminPasswordChanged: true
                    }
                );
                done();
            });
        });
    });

    describe('password data uri tests', () => {
        beforeEach(() => {
            providerMock = new ProviderMock();
            testOptions.cloudProvider = providerMock;

            bigIpMock.isBigIq = () => {
                return true;
            };
            bigIpMock.isBigIp = () => {
                return false;
            };

            bigIpMock.onboard.isPrimaryKeySet = () => {
                functionsCalled.bigIp.onboard.isPrimaryKeySet = false;
                return q(false);
            };

            bigIpMock.onboard.setRootPassword = function setRootPassword() {
                functionsCalled.bigIp.onboard.setRootPassword = arguments;
                return q();
            };
        });

        it('set passwords from json test', (done) => {
            utilMock.readData = function readData() {
                functionsCalled.utilMock.readData = arguments;
                return q(JSON.stringify(
                    {
                        primaryPassphrase: 'keykeykey',
                        root: 'rootpass',
                        admin: 'AdPass'
                    }
                ));
            };

            const s3Arn = 'arn:::foo:bar/password';
            argv.push('--big-iq-password-data-uri', s3Arn, '--cloud', 'aws');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.utilMock.readData[0], s3Arn);
                assert.strictEqual(functionsCalled.utilMock.readData[1], true);
                assert.deepEqual(
                    bigIpMock.onboard.updatedUsers, [{
                        user: 'admin',
                        password: 'AdPass',
                        role: undefined,
                        shell: undefined
                    }]
                );
                assert.strictEqual(functionsCalled.bigIp.onboard.setPrimaryPassphrase, 'keykeykey');
                assert.strictEqual(functionsCalled.bigIp.onboard.setRootPassword[0], 'rootpass');
                assert.deepEqual(functionsCalled.bigIp.onboard.setRootPassword[2], { enableRoot: true });
                done();
            });
        });

        it('bigiq password decrypted test', (done) => {
            const encryptedData = 'dke9cxk';
            const passwordFile = 'file:///tmp/passwords';

            utilMock.readData = function readData() {
                functionsCalled.utilMock.readData = arguments;
                return q(encryptedData);
            };

            localCryptoUtilMock.decryptPassword = function decryptPassword() {
                functionsCalled.localCryptoUtilMock.decryptPassword = arguments;
                return q(JSON.stringify(
                    {
                        primaryPassphrase: 'keykeykey',
                        root: 'rootpazz',
                        admin: 'AdPass'
                    }
                ));
            };

            argv.push('--big-iq-password-data-uri', passwordFile,
                '--big-iq-password-data-encrypted', '--cloud', 'aws');
            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.localCryptoUtilMock.decryptPassword[0], encryptedData);
                assert.strictEqual(functionsCalled.utilMock.readData[0], passwordFile);
                done();
            });
        });
    });

    it('primary key set test', (done) => {
        providerMock = new ProviderMock();
        testOptions.cloudProvider = providerMock;

        bigIpMock.isBigIq = () => {
            return true;
        };
        bigIpMock.isBigIp = () => {
            return false;
        };
        bigIpMock.onboard.isPrimaryKeySet = () => {
            functionsCalled.bigIp.onboard.isPrimaryKeySet = true;
            return q(true);
        };

        onboard.run(argv, testOptions, () => {
            assert.deepEqual(functionsCalled.bigIp.onboard, { isPrimaryKeySet: true });
            done();
        });
    });

    it('reboot test', (done) => {
        bigIpMock.rebootRequired = function rebootRequired() {
            functionsCalled.bigIp.rebootRequired = arguments;
            return q(true);
        };

        onboard.run(argv, testOptions, () => {
            assert.ok(rebootRequested);
            done();
        });
    });

    it('no reboot test', (done) => {
        argv.push('--no-reboot');

        bigIpMock.rebootRequired = function rebootRequired() {
            functionsCalled.bigIp.rebootRequired = arguments;
            return q(true);
        };

        onboard.run(argv, testOptions, () => {
            assert.strictEqual(rebootRequested, false);
            assert.notStrictEqual(signalsSent.indexOf('REBOOT_REQUIRED'), -1);
            done();
        });
    });

    describe('provider tests', () => {
        beforeEach(() => {
            providerMock = new ProviderMock();
            testOptions.cloudProvider = providerMock;

            signalInstanceProvisionedCalled = false;
        });

        it('signal instance provisioned test', (done) => {
            argv.push('--cloud', 'aws', '--signal-resource');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(signalInstanceProvisionedCalled, true);
                done();
            });
        });

        it('onboard no signal test', (done) => {
            argv.push('--cloud', 'aws');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(signalInstanceProvisionedCalled, false);
                done();
            });
        });
    });

    describe('ssl port arguments tests', () => {
        beforeEach(() => {
            utilMock.deletearguments = () => { };
            Date.now = () => {
                return '1234';
            };
        });

        it('no port test', (done) => {
            argv.push('--ssl-port', '8443');

            onboard.run(argv, testOptions, () => {
                const argumentsFile = fs.readFileSync('/tmp/rebootScripts/onboard_1234.sh');
                assert.notStrictEqual(argumentsFile.indexOf('--port 8443'), -1);
                done();
            });
        });

        it('port test', (done) => {
            argv.push('--port', '443', '--ssl-port', '8443');

            onboard.run(argv, testOptions, () => {
                const argumentsFile = fs.readFileSync('/tmp/rebootScripts/onboard_1234.sh');
                assert.strictEqual(argumentsFile.indexOf('--port 443'), -1);
                assert.notStrictEqual(argumentsFile.indexOf('--port 8443'), -1);
                done();
            });
        });
    });

    describe('root password tests', () => {
        it('basic test', (done) => {
            argv.push('--set-root-password', 'old:myOldPassword,new:myNewPassword');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.password[0], 'root');
                assert.strictEqual(functionsCalled.bigIp.onboard.password[1], 'myNewPassword');
                assert.strictEqual(functionsCalled.bigIp.onboard.password[2], 'myOldPassword');
                done();
            });
        });

        it('missing new test', (done) => {
            argv.push('--set-root-password', 'old:myOldPassword,new:');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                done();
            });
        });

        it('missing old test', (done) => {
            argv.push('--set-root-password', 'old:,new:myNewPassword');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                done();
            });
        });

        it('missing both test', (done) => {
            argv.push('--set-root-password', 'foo:myOldPassword,bar:myNewPassword');

            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.onboard.password, undefined);
                done();
            });
        });
    });

    it('update user test', (done) => {
        argv.push('--update-user', 'user:user1,password:pass1,role:role1,shell:shell1',
            '--update-user', 'user:user2,password:pass2,shell:shell2');
        onboard.run(argv, testOptions, () => {
            assert.strictEqual(bigIpMock.onboard.updatedUsers.length, 2);
            assert.deepEqual(bigIpMock.onboard.updatedUsers[0], {
                user: 'user1',
                password: 'pass1',
                role: 'role1',
                shell: 'shell1'
            });
            assert.deepEqual(bigIpMock.onboard.updatedUsers[1], {
                user: 'user2',
                password: 'pass2',
                role: undefined,
                shell: 'shell2'
            });
            done();
        });
    });

    describe('ntp tests', () => {
        it('ntp test', (done) => {
            const ntpServer = 'ntp.server1';
            argv.push('--ntp', ntpServer);

            onboard.run(argv, testOptions, () => {
                assert.deepEqual(functionsCalled.bigIp.modify[1], { servers: [ntpServer] });
                done();
            });
        });

        it('tz test', (done) => {
            const tz = 'myTimezone';
            argv.push('--tz', tz);

            onboard.run(argv, testOptions, () => {
                assert.deepEqual(functionsCalled.bigIp.modify[1], { timezone: tz });
                done();
            });
        });
    });

    it('dns test', (done) => {
        const dns = 'mydns.com';
        argv.push('--dns', dns);

        onboard.run(argv, testOptions, () => {
            assert.deepEqual(functionsCalled.bigIp.modify[1], { 'name-servers': [dns] });
            done();
        });
    });

    it('db vars test', (done) => {
        const dbVar1 = 'key1:value1';
        const dbVar2 = 'key2:value2';

        argv.push('--db', dbVar1, '--db', dbVar2);

        onboard.run(argv, testOptions, () => {
            assert.deepEqual(functionsCalled.bigIp.onboard.setDbVars[0], { key1: 'value1', key2: 'value2' });
            done();
        });
    });

    describe('license tests', () => {
        it('reg key test', (done) => {
            const regKey = '123345';

            argv.push('--license', regKey);

            onboard.run(argv, testOptions, () => {
                assert.deepEqual(
                    functionsCalled.bigIp.onboard.license[0],
                    {
                        registrationKey: regKey,
                        addOnKeys: [],
                        overwrite: true
                    }
                );
                done();
            });
        });

        it('add on keys test', (done) => {
            const addOnKey1 = 'addOn1';
            const addOnKey2 = 'addOn2';

            argv.push('--add-on', addOnKey1, '--add-on', addOnKey2);

            onboard.run(argv, testOptions, () => {
                assert.deepEqual(
                    functionsCalled.bigIp.onboard.license[0],
                    {
                        registrationKey: undefined,
                        addOnKeys: [addOnKey1, addOnKey2],
                        overwrite: true
                    }
                );
                done();
            });
        });

        describe('license via bigiq tests', () => {
            it('basic test', (done) => {
                const bigIqHost = 'myBigIq';
                const bigIqUser = 'myBigIqUser';
                const bigIqPassword = 'myBigIqPassword';
                const licensePool = 'myLicensePool';
                const bigIpMgmtAddress = 'myMgmtAddress';
                const bigIpMgmtPort = '1234';
                const skuKeyword1 = 'mySku1';
                const skuKeyword2 = 'mySku2';
                const unitOfMeasure = 'myUnitOfMeasure';
                const tenant = 'myTenant';
                const cloud = 'myCloud';

                argv.push(
                    '--license-pool',
                    '--big-iq-host', bigIqHost,
                    '--big-iq-user', bigIqUser,
                    '--big-iq-password', bigIqPassword,
                    '--big-iq-password-encrypted',
                    '--license-pool-name', licensePool,
                    '--big-ip-mgmt-address', bigIpMgmtAddress,
                    '--big-ip-mgmt-port', bigIpMgmtPort,
                    '--sku-keyword-1', skuKeyword1,
                    '--sku-keyword-2', skuKeyword2,
                    '--unit-of-measure', unitOfMeasure,
                    '--tenant', tenant,
                    '--cloud', cloud
                );

                onboard.run(argv, testOptions, () => {
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[0], bigIqHost);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[1], bigIqUser);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[2], bigIqPassword);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[3], licensePool);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[4], cloud);
                    assert.deepEqual(
                        functionsCalled.bigIp.onboard.licenseViaBigIq[5],
                        {
                            passwordIsUri: false,
                            passwordEncrypted: true,
                            bigIpMgmtAddress,
                            bigIpMgmtPort,
                            skuKeyword1,
                            skuKeyword2,
                            unitOfMeasure,
                            tenant,
                            noUnreachable: false
                        }
                    );
                    done();
                });
            });

            it('no unreachable test', (done) => {
                const bigIqHost = 'myBigIq';
                const bigIqUser = 'myBigIqUser';
                const bigIqPassword = 'myBigIqPassword';
                const licensePool = 'myLicensePool';
                const bigIpMgmtAddress = 'myMgmtAddress';
                const bigIpMgmtPort = '1234';
                const skuKeyword1 = 'mySku1';
                const skuKeyword2 = 'mySku2';
                const unitOfMeasure = 'myUnitOfMeasure';
                const tenant = 'myTenant';
                const cloud = 'myCloud';

                argv.push(
                    '--license-pool',
                    '--big-iq-host', bigIqHost,
                    '--big-iq-user', bigIqUser,
                    '--big-iq-password', bigIqPassword,
                    '--big-iq-password-encrypted',
                    '--license-pool-name', licensePool,
                    '--big-ip-mgmt-address', bigIpMgmtAddress,
                    '--big-ip-mgmt-port', bigIpMgmtPort,
                    '--sku-keyword-1', skuKeyword1,
                    '--sku-keyword-2', skuKeyword2,
                    '--unit-of-measure', unitOfMeasure,
                    '--tenant', tenant,
                    '--cloud', cloud,
                    '--no-unreachable'
                );

                onboard.run(argv, testOptions, () => {
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[0], bigIqHost);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[1], bigIqUser);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[2], bigIqPassword);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[3], licensePool);
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq[4], cloud);
                    assert.deepEqual(
                        functionsCalled.bigIp.onboard.licenseViaBigIq[5],
                        {
                            passwordIsUri: false,
                            passwordEncrypted: true,
                            bigIpMgmtAddress,
                            bigIpMgmtPort,
                            skuKeyword1,
                            skuKeyword2,
                            unitOfMeasure,
                            tenant,
                            noUnreachable: true
                        }
                    );
                    done();
                });
            });

            it('optional sku test', (done) => {
                const bigIqHost = 'myBigIq';
                const bigIqUser = 'myBigIqUser';
                const bigIqPassword = 'myBigIqPassword';
                const licensePool = 'myLicensePool';
                const bigIpMgmtAddress = 'myMgmtAddress';
                const bigIpMgmtPort = '1234';
                const unitOfMeasure = 'myUnitOfMeasure';
                const tenant = 'myTenant';
                const cloud = 'myCloud';

                argv.push(
                    '--license-pool',
                    '--big-iq-host', bigIqHost,
                    '--big-iq-user', bigIqUser,
                    '--big-iq-password', bigIqPassword,
                    '--big-iq-password-encrypted',
                    '--license-pool-name', licensePool,
                    '--big-ip-mgmt-address', bigIpMgmtAddress,
                    '--big-ip-mgmt-port', bigIpMgmtPort,
                    '--sku-keyword-1', '',
                    '--sku-keyword-2', '',
                    '--unit-of-measure', unitOfMeasure,
                    '--tenant', tenant,
                    '--cloud', cloud,
                    '--no-unreachable'
                );

                onboard.run(argv, testOptions, () => {
                    assert.deepEqual(
                        functionsCalled.bigIp.onboard.licenseViaBigIq[5],
                        {
                            passwordIsUri: false,
                            passwordEncrypted: true,
                            bigIpMgmtAddress,
                            bigIpMgmtPort,
                            skuKeyword1: '',
                            skuKeyword2: '',
                            unitOfMeasure,
                            tenant,
                            noUnreachable: true
                        }
                    );
                    done();
                });
            });

            it('missing params test', (done) => {
                argv.push('--license-pool');

                onboard.run(argv, testOptions, () => {
                    assert.strictEqual(functionsCalled.bigIp.onboard.licenseViaBigIq, undefined);
                    done();
                });
            });
        });
    });

    it('provision test', (done) => {
        const module1 = 'module1:level1';
        const module2 = 'module2:level2';

        argv.push('--module', module1, '--module', module2);

        onboard.run(argv, testOptions, () => {
            assert.deepEqual(functionsCalled.bigIp.onboard.provision[0],
                { module1: 'level1', module2: 'level2' });
            done();
        });
    });

    it('provision multiple test', (done) => {
        const modulesString = 'module1:level1,module2:level2';

        argv.push('--modules', modulesString);

        onboard.run(argv, testOptions, () => {
            assert.deepEqual(functionsCalled.bigIp.onboard.provision[0],
                { module1: 'level1', module2: 'level2' });
            done();
        });
    });

    it('install multiple ilx packages test', (done) => {
        const iapp = 'file:///dir/f5-iapp.rpm';
        const icontrol = 'file:///dir/f5-icontrol.rpm';
        argv.push('--install-ilx-package', iapp);
        argv.push('--install-ilx-package', icontrol);

        onboard.run(argv, testOptions, () => {
            assert.strictEqual(installIlxPackageParams[0], iapp);
            assert.strictEqual(installIlxPackageParams[1], icontrol);
            done();
        });
    });

    it('asm signatures test', (done) => {
        argv.push('--update-sigs');
        onboard.run(argv, testOptions, () => {
            assert.strictEqual(functionsCalled.bigIp.create[0], '/tm/asm/tasks/update-signatures');
            done();
        });
    });

    describe('ping tests', () => {
        it('default test', (done) => {
            argv.push('--ping');
            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.ping[0], 'f5.com');
                done();
            });
        });

        it('address test', (done) => {
            const address = 'www.foo.com';

            argv.push('--ping', address);
            onboard.run(argv, testOptions, () => {
                assert.strictEqual(functionsCalled.bigIp.ping[0], address);
                done();
            });
        });
    });

    it('metrics test', (done) => {
        argv.push('--metrics', 'key1:value1');
        onboard.run(argv, testOptions, () => {
            assert.strictEqual(functionsCalled.metrics.upload[0].action, 'onboard');
            assert.strictEqual(functionsCalled.metrics.upload[0].key1, 'value1');
            done();
        });
    });

    it('active error test', (done) => {
        utilMock.reboot = () => {
            rebootCalled = true;
        };

        bigIpMock.active = () => {
            return q.reject(new ActiveError('BIG-IP not active.'));
        };

        onboard.run(argv, testOptions, () => {
            assert.strictEqual(rebootCalled, true);
            done();
        });
    });
});
