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
const assert = require('assert');
const childProcess = require('child_process');
const q = require('q');
const commander = require('commander');

describe('util tests', () => {
    const UTIL_ARGS_TEST_FILE = 'UTIL_ARGS_TEST_FILE';
    const realSetTimeout = setTimeout;

    let http;
    let httpGet;

    let util;

    // Provider mock
    let providerMock;
    let cloudProviderFactoryMock;
    let functionsCalled;

    // Logger mock
    let Logger;
    let loggerReceivedOptions;
    let loggerReceivedMessage;

    let argv;
    let funcCount;

    let logger;
    const LOGFILE = 'foo';

    // process mock
    const processExit = process.exit;
    let exitCalled;
    let execCalled;
    let spawnCalled;
    let calledArgs;

    // child_process mock
    let childProcessSpawn;
    let childProcessExec;
    let unrefCalled;
    const childMock = {
        unref() {
            unrefCalled = true;
        }
    };

    const bigIpMock = {};

    // fs mock
    let fsOpen;
    let fsOpenSync;
    let fsCloseSync;
    let fsStat;
    let fsExistsSync;
    let fsUnlink;
    let fsUnlinkSync;
    let fsReadFile;
    let fsReadFileSync;
    let fsWriteSync;
    let fsWriteFile;
    let fsWriteFileSync;
    let fsMkdirSync;
    let fsReaddirSync;
    let fsCreateWriteStream;
    let startupCommands;
    let startupScripts;
    let writtenCommands;
    let fileNameWritten;
    let dataWritten;
    let createdDir;
    let unlinkSyncCalled;
    // http mock
    let httpMock;

    const getSavedArgs = function () {
        return fs.readFileSync(`/tmp/rebootScripts/${UTIL_ARGS_TEST_FILE}.sh`).toString();
    };

    /* eslint-disable global-require */

    beforeEach(() => {
        fsOpen = fs.open;
        fsOpenSync = fs.openSync;
        fsCloseSync = fs.closeSync;
        fsStat = fs.stat;
        fsExistsSync = fs.existsSync;
        fsUnlink = fs.unlink;
        fsUnlinkSync = fs.unlinkSync;
        fsReadFile = fs.readFile;
        fsReadFileSync = fs.readFileSync;
        fsWriteSync = fs.writeSync;
        fsWriteFile = fs.writeFile;
        fsWriteFileSync = fs.writeFileSync;
        fsReaddirSync = fs.readdirSync;
        fsMkdirSync = fs.mkdirSync;
        fsCreateWriteStream = fs.createWriteStream;

        http = require('http');

        httpMock = require('../testUtil/httpMock');
        httpMock.reset();

        Logger = require('../../../f5-cloud-libs').logger;

        util = require('../../../f5-cloud-libs').util;

        providerMock = require('../../lib/cloudProvider');
        cloudProviderFactoryMock = require('../../lib/cloudProviderFactory');

        functionsCalled = {
            cloudProviderFactoryMock: {},
            providerMock: {}
        };
    });

    afterEach(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        process.exit = processExit;

        fs.open = fsOpen;
        fs.closeSync = fsCloseSync;
        fs.openSync = fsOpenSync;
        fs.stat = fsStat;
        fs.existsSync = fsExistsSync;
        fs.unlink = fsUnlink;
        fs.unlinkSync = fsUnlinkSync;
        fs.readFile = fsReadFile;
        fs.readFileSync = fsReadFileSync;
        fs.writeSync = fsWriteSync;
        fs.writeFile = fsWriteFile;
        fs.writeFileSync = fsWriteFileSync;
        fs.readdirSync = fsReaddirSync;
        fs.mkdirSync = fsMkdirSync;
        fs.createWriteStream = fsCreateWriteStream;
    });

    describe('command line parsing tests', () => {
        it('collect test', () => {
            const container = [];
            let input = 'foobar';
            util.collect(input, container);
            input = 'hello world';
            util.collect(input, container);
            assert.strictEqual(container.length, 2);
            assert.notStrictEqual(container.indexOf('foobar'), -1);
            assert.notStrictEqual(container.indexOf('hello world'), -1);
        });

        it('csv test', () => {
            assert.deepStrictEqual(util.csv('1,2,3', []), [['1', '2', '3']]);
            assert.deepStrictEqual(util.csv('1, 2, 3 ', []), [['1', '2', '3']]);
            assert.deepStrictEqual(util.csv('1, 2, 3', [['4', '5', '6']]),
                [['4', '5', '6'], ['1', '2', '3']]);
        });

        it('map test', () => {
            let container = {};
            let input = 'foo:bar, hello:world';
            util.map(input, container);
            assert.deepStrictEqual(container, { foo: 'bar', hello: 'world' });
            input = 'fooz:bazz';
            util.map(input, container);
            assert.deepStrictEqual(container, { foo: 'bar', hello: 'world', fooz: 'bazz' });
            input = 'hello:goodbye';
            util.map(input, container);
            assert.deepStrictEqual(container, { foo: 'bar', hello: 'goodbye', fooz: 'bazz' });
            input = 'key1:value1,key2:true,key3:false';
            container = {};
            util.map(input, container);
            assert.deepStrictEqual(container, { key1: 'value1', key2: true, key3: false });
        });

        it('map array test', () => {
            const container = [];
            let input = 'foo:bar, hello:world';
            util.mapArray(input, container);
            input = 'fooz:bazz';
            util.mapArray(input, container);
            assert.strictEqual(container[0].foo, 'bar');
            assert.strictEqual(container[0].hello, 'world');
            assert.strictEqual(container[1].fooz, 'bazz');
        });

        it('pair test', () => {
            const container = {};
            let input = 'foo:bar';
            util.pair(input, container);
            input = 'hello: world ';
            util.pair(input, container);
            assert.strictEqual(container.foo, 'bar');
            assert.strictEqual(container.hello, 'world');
        });
    });

    it('lower case keys test', () => {
        const nestedObject = {
            First: 'vaLUe',
            secOND: 'Another',
            Level1: {
                item: 'item',
                Level2: {
                    Level2Key: 'level2val'
                }
            }
        };
        const asString = 'a string, not object';

        assert.deepStrictEqual(util.lowerCaseKeys(nestedObject),
            {
                first: 'vaLUe',
                second: 'Another',
                level1: {
                    item: 'item',
                    level2: {
                        level2key: 'level2val'
                    }
                }
            });
        assert.strictEqual(util.lowerCaseKeys(asString), asString);
    });

    it('delete args test', () => {
        const id = 'foo';
        let deletedPath;

        fs.existsSync = function existsSync() { return true; };
        fs.unlinkSync = function unlinkSync(path) {
            deletedPath = path;
        };
        util.deleteArgs(id);
        assert.strictEqual(deletedPath, '/tmp/rebootScripts/foo.sh');
    });

    it('ip to number test', () => {
        assert.strictEqual(util.ipToNumber('10.11.12.13'), 168496141);
    });

    describe('write data to file tests', () => {
        beforeEach(() => {
            fs.writeFile = function writeFile(file, data, options, cb) {
                fileNameWritten = file;
                dataWritten = data;
                cb(null);
            };
        });

        it('does not exist test', () => {
            const fileToWrite = '/tmp/foo/bar';
            const dataToWrite = {
                hello: 'world'
            };

            fs.existsSync = function existsSync() { return false; };

            return util.writeDataToFile(dataToWrite, fileToWrite)
                .then(() => {
                    assert.strictEqual(fileNameWritten, '/tmp/foo/bar');
                    assert.deepStrictEqual(dataWritten, dataToWrite);
                });
        });

        it('exists test', () => {
            fs.existsSync = function existsSync() { return true; };
            fs.unlinkSync = function unlinkSync() {
                unlinkSyncCalled = true;
            };
            unlinkSyncCalled = false;

            return util.writeDataToFile('foo', 'bar')
                .then(() => {
                    assert.ok(unlinkSyncCalled);
                });
        });

        it('error test', () => {
            fs.writeFile = function writeFile(file, data, options, cb) {
                cb(new Error('foo foo'));
            };

            return util.writeDataToFile('foo', 'bar')
                .then(() => {
                    assert.ok(false, 'should have thrown fs error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'foo foo');
                });
        });
    });

    describe('read data from file tests', () => {
        it('basic test', () => {
            const dataToRead = {
                foo: 'bar'
            };
            let fileRead;

            fs.readFile = function readFile(file, cb) {
                fileRead = file;
                cb(null, dataToRead);
            };

            return util.readDataFromFile('/tmp/hello/world')
                .then((dataRead) => {
                    assert.strictEqual(fileRead, '/tmp/hello/world');
                    assert.deepStrictEqual(dataRead, dataToRead);
                });
        });

        it('error test', () => {
            fs.readFile = function readFile(file, cb) {
                cb(new Error('file error'));
            };

            return util.readDataFromFile()
                .then(() => {
                    assert.ok(false, 'should have thrown file read error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'file error');
                });
        });
    });

    describe('write data to url tests', () => {
        it('basic test', () => {
            const fileUrl = 'file:///tmp/foo';
            const dataToWrite = {
                foo: 'bar'
            };

            fs.writeFile = function writeFile(file, data, options, cb) {
                fileNameWritten = file;
                dataWritten = data;
                cb(null);
            };

            return util.writeDataToUrl(dataToWrite, fileUrl)
                .then(() => {
                    assert.strictEqual(fileNameWritten, '/tmp/foo');
                    assert.deepStrictEqual(dataWritten, dataToWrite);
                });
        });

        it('bad url test', () => {
            const fileUrl = {};

            return util.writeDataToUrl('foo', fileUrl)
                .then(() => {
                    assert.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('must be a string'), -1);
                });
        });

        it('non file url test', () => {
            return util.writeDataToUrl('foo', 'http://www.example.com')
                .then(() => {
                    assert.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Only file URLs'), -1);
                });
        });

        it('write error test', () => {
            fs.writeFile = function writeFile(file, data, options, cb) {
                cb(new Error('bad write'));
            };

            return util.writeDataToUrl('foo', 'file:///tmp/foo')
                .then(() => {
                    assert.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'bad write');
                });
        });
    });

    describe('download tests', () => {
        beforeEach(() => {
            dataWritten = false;

            const incomingMessageHandler = {
                pipe() {
                    dataWritten = true;
                }
            };

            const fileMock = {
                on(event, cb) {
                    cb();
                },

                close(cb) {
                    cb();
                }
            };

            fs.createWriteStream = function createWriteStream() {
                return fileMock;
            };

            httpGet = http.get;
            http.get = function get(url, cb) {
                cb(incomingMessageHandler);
                return {
                    on() { }
                };
            };
        });

        afterEach(() => {
            http.get = httpGet;
        });

        it('basic test', () => {
            return util.download('http://www.example.com')
                .then(() => {
                    assert.ok(dataWritten, 'No data written');
                });
        });

        it('bad protocol test', () => {
            return util.download('file:///tmp')
                .then(() => {
                    assert.ok(false, 'should have thrown bad protocol');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Unhandled protocol'), -1);
                });
        });

        it('http error test', () => {
            Object.keys(require.cache).forEach((key) => {
                delete require.cache[key];
            });

            httpMock = require('../testUtil/httpMock');
            httpMock.reset();
            httpMock.setError('http get error');

            require.cache.http = {
                exports: httpMock
            };

            util = require('../../../f5-cloud-libs').util;

            return util.download('http://www.example.com/foo')
                .then(() => {
                    assert.ok(false, 'should have thrown http error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'http get error');
                });
        });

        it('http error file written test', () => {
            Object.keys(require.cache).forEach((key) => {
                delete require.cache[key];
            });

            httpMock = require('../testUtil/httpMock');
            httpMock.reset();
            httpMock.setError('http get error');

            require.cache.http = {
                exports: httpMock
            };

            util = require('../../../f5-cloud-libs').util;

            fs.existsSync = function existsSync() {
                return true;
            };
            fs.unlink = function unlink() { };

            return util.download('http://www.example.com/foo')
                .then(() => {
                    assert.ok(false, 'should have thrown http error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'http get error');
                });
        });
    });

    it('remove directory sync test', () => {
        const os = require('os');
        const sep = require('path').sep;
        const tmpDirBase = os.tmpdir();
        const fileName = 'foo';

        const uniqueTempDir = function uniqueTempDir(basePath) {
            const dir = `${basePath}${sep}${Math.random().toString(36).substring(2, 8)}`;
            fs.mkdirSync(dir);
            return dir;
        };

        const tmpDir = uniqueTempDir(tmpDirBase);
        const subDir = uniqueTempDir(tmpDir);

        fs.writeFileSync(`${tmpDir}${sep}${fileName}`, 'bar');
        fs.writeFileSync(`${subDir}${sep}${fileName}`, 'bar');

        util.removeDirectorySync(tmpDir);
        assert.strictEqual(fs.existsSync(tmpDir), false);
    });

    describe('read data tests', () => {
        it('read data with cloud provider uri test', () => {
            providerMock.init = () => {
                return q();
            };
            providerMock.getDataFromUri = (uri) => {
                functionsCalled.providerMock.getDataFromUri = uri;
                return q('password');
            };

            cloudProviderFactoryMock.getCloudProvider = () => {
                return providerMock;
            };
            const s3Arn = 'arn:::foo:bar/password';

            return util.readData(s3Arn, true)
                .then((readPassword) => {
                    assert.deepStrictEqual(functionsCalled.providerMock.getDataFromUri, s3Arn);
                    assert.strictEqual(readPassword, 'password');
                });
        });

        it('calls get data from url test', () => {
            const passwordFile = '/tmp/mypass';

            fs.writeFileSync(passwordFile, 'foobar', { encoding: 'ascii' });

            cloudProviderFactoryMock.getCloudProvider = () => {
                throw new Error('Unavailable cloud provider');
            };

            return util.readData(`file://${passwordFile}`, true)
                .then((readPassword) => {
                    assert.strictEqual(readPassword, 'foobar');
                    fs.unlinkSync(passwordFile);
                });
        });

        it('reads plain data test', () => {
            return util.readData('foobar', false)
                .then((readPassword) => {
                    assert.strictEqual(readPassword, 'foobar');
                });
        });
    });

    describe('get data from url tests', () => {
        it('file test', () => {
            const passwordFile = '/tmp/mypass';

            fs.writeFileSync(passwordFile, 'foobar', { encoding: 'ascii' });

            return util.getDataFromUrl(`file://${passwordFile}`)
                .then((readPassword) => {
                    assert.strictEqual(readPassword, 'foobar');
                    fs.unlinkSync(passwordFile);
                });
        });

        describe('http test', () => {
            beforeEach(() => {
                Object.keys(require.cache).forEach((key) => {
                    delete require.cache[key];
                });

                httpMock = require('../testUtil/httpMock');
                httpMock.reset();

                require.cache.http = {
                    exports: httpMock
                };

                util = require('../../../f5-cloud-libs').util;
            });

            it('basic test', () => {
                httpMock.setResponse('foobar');

                return util.getDataFromUrl('http://www.example.com')
                    .then((readPassword) => {
                        assert.strictEqual(httpMock.lastRequest.path, '/');
                        assert.strictEqual(readPassword, 'foobar');
                    });
            });

            it('path and options test', () => {
                const path = '/foo/bar';
                const options = {
                    headers: { headerName: 'headerValue' },
                    rejectUnauthorized: false
                };

                return util.getDataFromUrl(`http://www.example.com${path}`, options)
                    .then(() => {
                        assert.strictEqual(httpMock.lastRequest.path, path);
                        assert.deepStrictEqual(httpMock.lastRequest.headers, options.headers);
                        assert.strictEqual(httpMock.lastRequest.rejectUnauthorized, false);
                    });
            });

            it('query test', () => {
                const query = '?hello=world&alpha=beta';

                return util.getDataFromUrl(`http://www.example.com${query}`)
                    .then(() => {
                        assert.strictEqual(httpMock.lastRequest.path, `/${query}`);
                    });
            });

            it('json test', () => {
                const response = { foo: 'bar', hello: 'world' };

                httpMock.setResponse(response, { 'content-type': 'application/json' });

                return util.getDataFromUrl('http://www.example.com')
                    .then((data) => {
                        assert.deepStrictEqual(data, response);
                    });
            });

            it('bad json test', () => {
                httpMock.setResponse('foobar', { 'content-type': 'application/json' });

                return util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have thrown bad json');
                    })
                    .catch((err) => {
                        assert.ok(/Unexpected token o/.test(err.message));
                    });
            });

            it('bad status test', () => {
                const status = 400;

                httpMock.setResponse('foo', {}, status);

                return util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have been a bad status');
                    })
                    .catch((err) => {
                        assert.strictEqual(err.message,
                            'http://www.example.com returned with status code 400');
                    });
            });

            it('http error test', () => {
                httpMock.setError('http error occurred');

                return util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have thrown an error');
                    })
                    .catch((err) => {
                        assert.strictEqual(err.message, 'http error occurred');
                    });
            });

            it('http throw test', () => {
                httpMock.get = function get() {
                    throw new Error('http get threw');
                };

                return util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have thrown an error');
                    })
                    .catch((err) => {
                        assert.strictEqual(err.message, 'http get threw');
                    });
            });
        });

        it('Unsupported url test', () => {
            return util.getDataFromUrl('ftp://www.foo.com')
                .then(() => {
                    assert.ok(false, 'Unsupported URL should have failed');
                })
                .catch((err) => {
                    assert.strictEqual(err.message,
                        'Only file, http, and https URLs are currently supported.');
                });
        });

        it('read file error test', () => {
            fs.readFile = function readFile(file, options, cb) {
                cb(new Error('read file error'));
            };

            return util.getDataFromUrl('file:///foo/bar')
                .then(() => {
                    assert.ok(false, 'should have thrown read file error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'read file error');
                });
        });
    });

    describe('local ready test', () => {
        beforeEach(() => {
            childProcessExec = childProcess.exec;
            execCalled = false;
        });

        afterEach(() => {
            execCalled = false;
            childProcess.exec = childProcessExec;
        });

        it('basic test', () => {
            childProcess.exec = function exec(command, cb) {
                if (command.endsWith('.sh')) {
                    execCalled = true;
                    cb();
                }
            };

            util.localReady();
            assert.strictEqual(execCalled, true);
        });

        it('error test', () => {
            childProcess.exec = function exec(command, cb) {
                if (command.endsWith('.sh')) {
                    cb(new Error('process exec error'));
                }
            };

            return util.localReady()
                .then(() => {
                    assert.ok(false, 'should have thrown process exec error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'process exec error');
                });
        });
    });

    describe('log and exit test', () => {
        beforeEach(() => {
            // eslint-disable-next-line no-global-assign
            setTimeout = function (cb) {
                cb();
            };
            process.exit = function exit() {
                exitCalled = true;
            };
        });

        afterEach(() => {
            if (fs.existsSync(LOGFILE)) {
                fs.unlinkSync(LOGFILE);
            }

            setTimeout = realSetTimeout; // eslint-disable-line no-global-assign
        });

        it('basic test', () => {
            logger = Logger.getLogger({ console: true });

            util.logAndExit();
            assert.strictEqual(exitCalled, true);
        });

        it('log to file test', () => {
            logger = Logger.getLogger({ console: false, fileName: LOGFILE });
            logger.transports.file.on('flush', () => {
                return q();
            });

            util.logAndExit();
            assert.strictEqual(exitCalled, true);
        });
    });

    it('log error test', () => {
        const loggerOptions = {
            fileName: '/tmp/network.log',
            module
        };
        const errorMessage = 'utilTests error';

        Logger.getLogger = function getLogger(options) {
            loggerReceivedOptions = options;
            return {
                error(message) {
                    loggerReceivedMessage = message;
                }
            };
        };

        util.logError(errorMessage, loggerOptions);

        assert.strictEqual(loggerReceivedOptions.json, true);
        assert.strictEqual(loggerReceivedOptions.fileName, '/tmp/cloudLibsError.log');
        assert.strictEqual(loggerReceivedOptions.verboseLabel, true);
        assert.strictEqual(errorMessage, loggerReceivedMessage);
    });

    describe('run in background and exit test', () => {
        beforeEach(() => {
            exitCalled = false;
            unrefCalled = false;
            spawnCalled = false;
            process.exit = function exit() {
                exitCalled = true;
            };

            childProcessSpawn = childProcess.spawn;
            childProcess.spawn = function spawn(name, args) {
                spawnCalled = true;
                calledArgs = args;
                return childMock;
            };
        });

        afterEach(() => {
            childProcess.spawn = childProcessSpawn;
        });

        it('basic test', () => {
            util.runInBackgroundAndExit(process);
            assert.ok(spawnCalled, 'child_process.spawn() was not called');
            assert.ok(unrefCalled, 'child.unref() was not called');
            assert.ok(exitCalled, 'process.exit() was not called');
        });

        it('too many args test', () => {
            const processArgv = process.argv;
            const argvMock = [];

            for (let i = 0; i < 101; ++i) {
                argvMock.push(i);
            }

            process.argv = argvMock;

            util.runInBackgroundAndExit(process);
            assert.strictEqual(spawnCalled, false);

            assert.ok(exitCalled, 'process.exit() was not called');

            process.argv = processArgv;
        });

        it('background removed test', () => {
            const processArgv = process.argv;
            const argvMock = ['node', '--foo', '--background'];

            process.argv = argvMock;

            calledArgs.length = 0;
            util.runInBackgroundAndExit(process, 'myLogFile');
            assert.strictEqual(calledArgs.length, 3); // --output myLogFile will be pushed
            assert.strictEqual(calledArgs.indexOf('--background'), -1);

            process.argv = processArgv;
        });

        it('output added test', () => {
            const processArgv = process.argv;
            const argvMock = ['node'];
            const logFile = 'myLogFile';

            process.argv = argvMock;

            calledArgs.length = 0;
            util.runInBackgroundAndExit(process, logFile);
            assert.strictEqual(calledArgs.length, 2); // --output myLogFile will be pushed
            assert.notStrictEqual(calledArgs.indexOf('--output'), -1);
            assert.notStrictEqual(calledArgs.indexOf(logFile), -1);

            process.argv = processArgv;
        });
    });

    describe('reboot test', () => {
        beforeEach(() => {
            startupCommands = 'command 1';
            startupScripts = ['script1', 'script2'];

            writtenCommands = undefined;

            fs.existsSync = function existsSync() {
                return true;
            };
            fs.readFileSync = function readFileSync() {
                return startupCommands;
            };
            fs.writeFileSync = function writeFileSync(fileName, commands) {
                writtenCommands = commands;
            };
            fs.readdirSync = function readdirSync() {
                return startupScripts;
            };
            fs.mkdirSync = function mkdirSync() { };
            fs.closeSync = function closeSync() { };
            fs.openSync = function openSync() { };

            bigIpMock.reboot = function reboot() {
                bigIpMock.rebootCalled = true;
                return q();
            };
            bigIpMock.rebootCalled = false;
        });

        it('basic test', () => {
            return util.reboot(bigIpMock)
                .then(() => {
                    startupScripts.forEach((script) => {
                        assert.notStrictEqual(writtenCommands.indexOf(script), -1);
                        assert.strictEqual(bigIpMock.rebootCalled, true);
                    });
                });
        });

        it('signal only test', () => {
            return util.reboot(bigIpMock, { signalOnly: true })
                .then(() => {
                    startupScripts.forEach((script) => {
                        assert.notStrictEqual(writtenCommands.indexOf(script), -1);
                        assert.strictEqual(bigIpMock.rebootCalled, false);
                    });
                });
        });

        it('missing startup dir test', () => {
            fs.existsSync = function existsSync() {
                return false;
            };

            return util.reboot(bigIpMock)
                .then(() => {
                    assert.strictEqual(writtenCommands, undefined);
                    assert.strictEqual(bigIpMock.rebootCalled, true);
                });
        });

        it('read file error test', () => {
            fs.readFileSync = function readFileSync() {
                throw new Error('this error');
            };

            return util.reboot(bigIpMock)
                .then(() => {
                    assert.ok(false, 'fs.readFileSync should have thrown');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'this error');
                });
        });

        it('read dir error test', () => {
            fs.readdirSync = function readdirSync() {
                throw new Error('this error');
            };

            return util.reboot(bigIpMock)
                .then(() => {
                    assert.ok(false, 'fs.readdirSync should have thrown');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'this error');
                });
        });

        it('write file sync error test', () => {
            fs.writeFileSync = function writeFileSync() {
                throw new Error('this error');
            };

            return util.reboot(bigIpMock)
                .then(() => {
                    assert.ok(true);
                });
        });
    });

    describe('get args to strip during forced reboot test', () => {
        it('basic test', () => {
            const options = commander
                .version('1.0')
                .option(
                    '--host <ip_address>'
                )
                .option(
                    '-d, --db <value>'
                );

            const ARGS_TO_STRIP = util.getArgsToStripDuringForcedReboot(options);
            // check --host not in args to strip
            assert.strictEqual(ARGS_TO_STRIP.indexOf('--host'), -1);
            // check --db|-d in args to strip
            assert.notStrictEqual(ARGS_TO_STRIP.indexOf('--db'), -1);
            assert.notStrictEqual(ARGS_TO_STRIP.indexOf('-d'), -1);
        });
    });

    describe('save args test', () => {
        beforeEach(() => {
            argv = ['node', 'utilTests.js', '--one', '--two', 'abc'];
        });

        afterEach(() => {
            let filesToDelete;
            try {
                if (fs.existsSync('/tmp/rebootScripts')) {
                    filesToDelete = fs.readdirSync('/tmp/rebootScripts/');
                    filesToDelete.forEach((fileToDelete) => {
                        fs.unlinkSync(`/tmp/rebootScripts/${fileToDelete}`);
                    });
                    fs.rmdirSync('/tmp/rebootScripts');
                }
            } catch (err) {
                console.log('Error deleting test directory', err); // eslint-disable-line no-console
            }
        });

        it('basic test', () => {
            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    assert.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                });
        });

        it('strip args with param test', () => {
            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--one'])
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.strictEqual(savedArgs.indexOf('--one'), -1);
                    assert.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                });
        });

        it('strip args without param test', () => {
            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--two'])
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    assert.strictEqual(savedArgs.indexOf('abc'), -1);
                });
        });

        it('dir created test', () => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            fs.mkdirSync = function mkdirSync(dirName) {
                createdDir = dirName;
            };

            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.strictEqual(createdDir, '/tmp/rebootScripts/');
                });
        });

        it('dir create error test', () => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'FOOBAR' });
            };

            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.ok(true);
                });
        });

        it('mkdir race condition test', () => {
            function EexistError() {
                this.code = 'EEXIST';
            }
            EexistError.prototype = Error.prototype;

            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            fs.mkdirSync = function mkdirSync(dirName) {
                fsMkdirSync(dirName);
                throw new EexistError();
            };

            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.notStrictEqual(savedArgs.indexOf('--one'), -1);
                });
        });

        it('mkdir race condition fail test', () => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            fs.mkdirSync = function mkdirSync(dirName) {
                fsMkdirSync(dirName);
                throw new Error();
            };

            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.ok(true);
                });
        });

        it('stat throws test', () => {
            fs.stat = function stat() {
                throw new Error('fsStat threw');
            };

            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.ok(true);
                });
        });

        it('open throws test', () => {
            fs.open = function open() {
                throw new Error('fsOpen threw');
            };

            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.ok(true);
                });
        });

        it('write sync throws test', () => {
            fs.writeSync = function writeSync() {
                throw new Error('fsWriteSync threw');
            };

            return util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.ok(true);
                });
        });
    });

    it('parse tmsh response test', () => {
        const tmshResponse = `sys crypto key garrett.key {
            key-size 3072
            key-type rsa-private
            security-type password
        }`;
        const response = util.parseTmshResponse(tmshResponse);
        assert.strictEqual(response['security-type'], 'password');
    });

    describe('get product test', () => {
        it('has product string test', () => {
            util.getProductString = function getProductString() {
                return q('BIG-IQ');
            };
            return util.getProduct()
                .then((response) => {
                    assert.strictEqual(response, 'BIG-IQ');
                });
        });

        it('empty product string test', () => {
            util.getProductString = function getProductString() {
                return q('');
            };
            util.runTmshCommand = function runTmshCommand() {
                util.getProductString = function getProductString() {
                    return q('BIG-IP');
                };
                return q('BIG-IP');
            };
            return util.getProduct()
                .then((response) => {
                    assert.strictEqual(response, 'BIG-IP');
                });
        });

        it('fail to get product string test', () => {
            util.getProductString = function getProductString() {
                return q.reject('failed');
            };

            return util.getProduct()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err, 'failed');
                });
        });

        it('container test', () => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            return util.getProduct()
                .then((response) => {
                    assert.strictEqual(response, 'CONTAINER');
                });
        });

        it('fail to run fs stat test', () => {
            fs.stat = function stat(dir, cb) {
                cb({ message: 'failed', code: 'FOO' });
            };

            return util.getProduct()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'failed');
                });
        });

        it('fail to run tmsh command test', () => {
            util.runTmshCommand = function runTmshCommand() {
                return q.reject('failed');
            };
            util.getProductString = function getProductString() {
                return q('');
            };

            return util.getProduct()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err, 'failed');
                });
        });
    });

    describe('get process execution time with pid test', () => {
        it('no command provided test', () => {
            return util.getProcessExecutionTimeWithPid()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'grep command is required');
                });
        });

        it('shell command format test', () => {
            let passedCommand;
            util.runShellCommand = function runShellCommand(shellCommand) {
                passedCommand = shellCommand;
                return q(0);
            };

            const grepCommand = 'grep autoscale.js';
            const cmd = `/bin/ps -eo pid,etime,cmd --sort=-time | ${grepCommand} | awk '{ print $1"-"$2 }'`;
            return util.getProcessExecutionTimeWithPid(grepCommand)
                .then(() => {
                    assert.strictEqual(passedCommand, cmd);
                });
        });
    });

    describe('terminate process by id test', () => {
        it('no command provided test', () => {
            return util.terminateProcessById()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'pid is required for process termination');
                });
        });

        it('shell command format test', () => {
            let passedCommand;
            util.runShellCommand = function runShellCommand(shellCommand) {
                passedCommand = shellCommand;
                return q(0);
            };

            const pid = '111';

            return util.terminateProcessById(pid)
                .then(() => {
                    assert.strictEqual(passedCommand, `/bin/kill -9 ${pid}`);
                });
        });
    });

    describe('process count test', () => {
        it('no command provided test', () => {
            return util.getProcessCount()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'grep command is required');
                });
        });

        it('shell command format test', () => {
            let passedCommand;
            util.runShellCommand = function runShellCommand(shellCommand) {
                passedCommand = shellCommand;
                return q(0);
            };

            const grepCommand = 'grep autoscale.js';
            return util.getProcessCount(grepCommand)
                .then(() => {
                    assert.strictEqual(passedCommand, `/bin/ps -eo pid,cmd | ${grepCommand} | wc -l`);
                });
        });
    });

    describe('try until test', function tryUntilTests() {
        beforeEach(() => {
            funcCount = 0;
        });

        it('called once test', () => {
            const func = function () {
                const deferred = q.defer();
                funcCount += 1;
                deferred.resolve();
                return deferred.promise;
            };

            return util.tryUntil(this, util.NO_RETRY, func)
                .then(() => {
                    return assert.strictEqual(funcCount, 1);
                });
        });

        it('called multiple test', () => {
            const retries = 3;

            const func = function () {
                const deferred = q.defer();

                funcCount += 1;

                if (funcCount < retries) {
                    deferred.reject();
                } else {
                    deferred.resolve();
                }

                return deferred.promise;
            };

            return util.tryUntil(this, { maxRetries: retries, retryIntervalMs: 2 }, func)
                .then(() => {
                    return assert.strictEqual(funcCount, retries);
                });
        });

        it('with throw test', () => {
            const retries = 3;

            const func = function () {
                const deferred = q.defer();

                funcCount += 1;

                if (funcCount === 1) {
                    deferred.reject();
                } else if (funcCount > 1 && funcCount < retries) {
                    throw new Error('foo');
                } else if (funcCount === retries) {
                    deferred.resolve();
                }

                return deferred.promise;
            };

            return util.tryUntil(this, { maxRetries: retries, retryIntervalMs: 2 }, func)
                .then(() => {
                    return assert.strictEqual(funcCount, retries);
                });
        });

        it('not resolved test', () => {
            const func = function () {
                const deferred = q.defer();
                deferred.reject();
                return deferred.promise;
            };

            return util.tryUntil(this, { maxRetries: 2, retryIntervalMs: 2 }, func)
                .then(() => {
                    return assert.ok(false, 'func should never have resolved');
                })
                .catch(() => {
                    return assert.ok(true);
                });
        });

        it('bad request test', () => {
            const errorMessage = 'foo';
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: errorMessage
                    }
                );
            };

            return util.tryUntil(this, { maxRetries: 90, retryIntervalMs: 2 }, func)
                .then(() => {
                    return assert.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    return assert.strictEqual(err.message, errorMessage);
                });
        });

        it('continue on error test', () => {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'foo'
                    }
                );
            };

            return util.tryUntil(this, { maxRetries: 2, retryIntervalMs: 2, continueOnError: true }, func)
                .then(() => {
                    return assert.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    return assert.notStrictEqual(err.message.indexOf('max tries'), -1);
                });
        });

        it('continue on error message is message test', () => {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'is foo'
                    }
                );
            };

            return util.tryUntil(this,
                { maxRetries: 2, retryIntervalMs: 2, continueOnErrorMessage: 'foo' }, func)
                .then(() => {
                    return assert.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    return assert.notStrictEqual(err.message.indexOf('max tries'), -1);
                });
        });

        it('continue on error message is message regex test', () => {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'is foo'
                    }
                );
            };

            return util.tryUntil(this,
                { maxRetries: 2, retryIntervalMs: 2, continueOnErrorMessage: /foo/ }, func)
                .then(() => {
                    return assert.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    return assert.notStrictEqual(err.message.indexOf('max tries'), -1);
                });
        });

        it('continue on error message is not message test', () => {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'is foo'
                    }
                );
            };

            return util.tryUntil(this,
                { maxRetries: 2, retryIntervalMs: 2, continueOnErrorMessage: 'bar' },
                func)
                .then(() => {
                    return assert.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    return assert.strictEqual(err.message.indexOf('max tries'), -1);
                });
        });

        describe('failOnErrorX tests', () => {
            let callCount;

            const func = function () {
                callCount += 1;
                switch (callCount) {
                case 1:
                    return q.reject({ code: 400, message: 'is foo' });
                case 2:
                    return q.reject({ code: 500, message: 'monkeys are breaking things' });
                default:
                    return q.resolve({ code: 200, message: 'should have failed' });
                }
            };

            beforeEach(() => {
                callCount = 0;
            });

            it('should respect the continueOnError, until it hits a failOnErrorMessages', () => {
                return util.tryUntil(this,
                    {
                        maxRetries: 3,
                        retryIntervalMs: 1,
                        continueOnError: true,
                        failOnErrorMessages: ['boo far', 'monkeys are breaking things']
                    },
                    func)
                    .then(() => {
                        return assert.ok(false, 'func should not have made it to resolution');
                    })
                    .catch((err) => {
                        assert.strictEqual(callCount, 2);
                        assert.deepStrictEqual(err, { code: 500, message: 'monkeys are breaking things' });
                    });
            });

            it('should respect the continueOnError, until it hits a failOnErrorMessages with regex', () => {
                return util.tryUntil(this,
                    {
                        maxRetries: 3,
                        retryIntervalMs: 1,
                        continueOnError: true,
                        failOnErrorMessages: [/oof har/, /king thing/]
                    },
                    func)
                    .then(() => {
                        return assert.ok(false, 'func should not have made it to resolution');
                    })
                    .catch((err) => {
                        assert.strictEqual(callCount, 2);
                        assert.deepStrictEqual(err, { code: 500, message: 'monkeys are breaking things' });
                    });
            });

            it('should respect the continueOnError, until it hits a failOnErrorCode', () => {
                return util.tryUntil(this,
                    {
                        maxRetries: 3,
                        retryIntervalMs: 1,
                        continueOnError: true,
                        failOnErrorCodes: [200, 500]
                    },
                    func)
                    .then(() => {
                        return assert.ok(false, 'func should not have made it to resolution');
                    })
                    .catch((err) => {
                        assert.strictEqual(callCount, 2);
                        assert.deepStrictEqual(err, { code: 500, message: 'monkeys are breaking things' });
                    });
            });

            it('should attempt all retries if failOnErrorMessages is empty', () => {
                return util.tryUntil(this,
                    {
                        maxRetries: 3,
                        retryIntervalMs: 1,
                        continueOnError: true,
                        failOnErrorMessages: []
                    },
                    func)
                    .then((result) => {
                        assert.strictEqual(callCount, 3);
                        // Note: I realize the expected message is misleading, but it simplifies the
                        // code to expect the default result from this test's responses.
                        return assert.deepStrictEqual(result, { code: 200, message: 'should have failed' });
                    });
            });
        });

        describe('shortRetryOnError', () => {
            const retryOptions = {
                maxRetries: 20,
                retryIntervalMs: 1,
                continueOnError: true,
                shortRetryOnError: {
                    codes: [401],
                    retryOptions: {
                        maxRetries: 2,
                        retryIntervalMs: 1
                    }
                }
            };

            it('should use shortRetryOnError when specified code happens', () => {
                const func = function () {
                    funcCount += 1;
                    return q.reject({ code: 401, message: '401 Unauthorized' });
                };

                return util.tryUntil(this, retryOptions, func)
                    .then(() => {
                        return assert.ok(false, 'func should not have made it to resolution');
                    })
                    .catch((err) => {
                        assert.deepStrictEqual(
                            err,
                            {
                                code: 401,
                                message: 'tryUntil: max tries reached: 401 Unauthorized',
                                name: ''
                            }
                        );
                        assert.strictEqual(funcCount, 4);
                    });
            });

            it('should resume retries when shortRetryOnError.codes is no longer encountered', () => {
                const func = function () {
                    funcCount += 1;
                    switch (funcCount) {
                    case 1:
                        return q.reject({ code: 401, message: '401 Unauthorized' });
                    case 2:
                        return q.reject({ code: 401, message: '401 Unauthorized' });
                    default:
                        return q.reject({ code: 500, message: 'Not a 401' });
                    }
                };

                return util.tryUntil(this, retryOptions, func)
                    .then(() => {
                        return assert.ok(false, 'func should not have made it to resolution');
                    })
                    .catch((err) => {
                        assert.deepStrictEqual(
                            err,
                            {
                                code: 500,
                                message: 'tryUntil: max tries reached: Not a 401',
                                name: ''
                            }
                        );
                        assert.strictEqual(funcCount, 24);
                    });
            });

            it('should handle multiple codes in shortRetryOnError', () => {
                retryOptions.shortRetryOnError.codes = [401, 404];
                const func = function () {
                    funcCount += 1;
                    switch (funcCount) {
                    case 1:
                        return q.reject({ code: 401, message: '401 Unauthorized' });
                    case 2:
                        return q.reject({ code: 401, message: '401 Unauthorized' });
                    case 3:
                        return q.reject({ code: 400, message: 'Not in shortRetryOnError.codes' });
                    default:
                        return q.reject({ code: 404, message: 'Not a 401' });
                    }
                };

                return util.tryUntil(this, retryOptions, func)
                    .then(() => {
                        return assert.ok(false, 'func should not have made it to resolution');
                    })
                    .catch((err) => {
                        assert.deepStrictEqual(
                            err,
                            {
                                code: 404,
                                message: 'tryUntil: max tries reached: Not a 401',
                                name: ''
                            }
                        );
                        assert.strictEqual(funcCount, 7);
                    });
            });
        });
    });

    it('version compare test', () => {
        assert.strictEqual(util.versionCompare('1.7.1', '1.7.10'), -1);
        assert.strictEqual(util.versionCompare('1.7.10', '1.7.1'), 1);
        assert.strictEqual(util.versionCompare('1.7.2', '1.7.10'), -1);
        assert.strictEqual(util.versionCompare('1.6.1', '1.7.10'), -1);
        assert.strictEqual(util.versionCompare('1.6.20', '1.7.10'), -1);
        assert.strictEqual(util.versionCompare('1.7.1', '1.7.10'), -1);
        assert.strictEqual(util.versionCompare('1.7', '1.7.0'), -1);
        assert.strictEqual(util.versionCompare('1.7', '1.8.0'), -1);
        assert.strictEqual(util.versionCompare('1.7.2', '1.7.10b'), -1);

        assert.strictEqual(util.versionCompare('1.7.10', '1.7.1'), 1);
        assert.strictEqual(util.versionCompare('1.7.10', '1.6.1'), 1);
        assert.strictEqual(util.versionCompare('1.7.10', '1.6.20'), 1);
        assert.strictEqual(util.versionCompare('1.7.0', '1.7'), 1);
        assert.strictEqual(util.versionCompare('1.8.0', '1.7'), 1);

        assert.strictEqual(util.versionCompare('1.7.10', '1.7.10'), 0);
        assert.strictEqual(util.versionCompare('1.7', '1.7'), 0);
        assert.strictEqual(util.versionCompare('1.7', '1.7.0', { zeroExtend: true }), 0);

        assert.strictEqual(util.versionCompare('1.3-dev1', '1.3-dev1'), 0);
        assert.strictEqual(util.versionCompare('1.3-dev1', '1.3-dev2'), -1);
        assert.strictEqual(util.versionCompare('1.3-dev2', '1.3-dev1'), 1);
        assert.strictEqual(util.versionCompare('1.3-dev19', '1.3-dev2'), 1);

        assert.strictEqual(util.versionCompare('12.0.0-hf1', '12.0.0-hf2'), -1);
        assert.strictEqual(util.versionCompare('12.0.1-hf1', '12.0.0-hf3'), 1);
        assert.strictEqual(util.versionCompare('12.1.0', '12.0.0-hf1'), 1);

        assert.strictEqual(util.versionCompare('12.0.0-a1', '12.0.0-b1'), -1);
        assert.strictEqual(util.versionCompare('12.0.1-b1', '12.0.0-a1'), 1);

        assert.strictEqual(util.versionCompare('12.0.0-b1', '12.0.0-a1'), 1);

        assert.strictEqual(util.versionCompare('12.0.0-1', '12.0.0-a1'), 1);
        assert.strictEqual(util.versionCompare('12.0.0-a1', '12.0.0-1'), -1);
    });
});
