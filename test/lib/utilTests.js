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
        it('collect test', (done) => {
            const container = [];
            let input = 'foobar';
            util.collect(input, container);
            input = 'hello world';
            util.collect(input, container);
            assert.strictEqual(container.length, 2);
            assert.notStrictEqual(container.indexOf('foobar'), -1);
            assert.notStrictEqual(container.indexOf('hello world'), -1);
            done();
        });

        it('csv test', (done) => {
            assert.deepEqual(util.csv('1,2,3', []), [['1', '2', '3']]);
            assert.deepEqual(util.csv('1, 2, 3 ', []), [['1', '2', '3']]);
            assert.deepEqual(util.csv('1, 2, 3', [['4', '5', '6']]), [['4', '5', '6'], ['1', '2', '3']]);

            done();
        });

        it('map test', (done) => {
            let container = {};
            let input = 'foo:bar, hello:world';
            util.map(input, container);
            assert.deepEqual(container, { foo: 'bar', hello: 'world' });
            input = 'fooz:bazz';
            util.map(input, container);
            assert.deepEqual(container, { foo: 'bar', hello: 'world', fooz: 'bazz' });
            input = 'hello:goodbye';
            util.map(input, container);
            assert.deepEqual(container, { foo: 'bar', hello: 'goodbye', fooz: 'bazz' });
            input = 'key1:value1,key2:true,key3:false';
            container = {};
            util.map(input, container);
            assert.deepEqual(container, { key1: 'value1', key2: true, key3: false });
            done();
        });

        it('map array test', (done) => {
            const container = [];
            let input = 'foo:bar, hello:world';
            util.mapArray(input, container);
            input = 'fooz:bazz';
            util.mapArray(input, container);
            assert.strictEqual(container[0].foo, 'bar');
            assert.strictEqual(container[0].hello, 'world');
            assert.strictEqual(container[1].fooz, 'bazz');
            done();
        });

        it('pair test', (done) => {
            const container = {};
            let input = 'foo:bar';
            util.pair(input, container);
            input = 'hello: world ';
            util.pair(input, container);
            assert.strictEqual(container.foo, 'bar');
            assert.strictEqual(container.hello, 'world');
            done();
        });
    });

    it('lower case keys test', (done) => {
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

        assert.deepEqual(util.lowerCaseKeys(nestedObject),
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
        done();
    });

    it('delete args test', (done) => {
        const id = 'foo';
        let deletedPath;

        fs.existsSync = function existsSync() { return true; };
        fs.unlinkSync = function unlinkSync(path) {
            deletedPath = path;
        };
        util.deleteArgs(id);
        assert.strictEqual(deletedPath, '/tmp/rebootScripts/foo.sh');
        done();
    });

    it('ip to number test', (done) => {
        assert.strictEqual(util.ipToNumber('10.11.12.13'), 168496141);
        done();
    });

    describe('write data to file tests', () => {
        beforeEach(() => {
            fs.writeFile = function writeFile(file, data, options, cb) {
                fileNameWritten = file;
                dataWritten = data;
                cb(null);
            };
        });

        it('does not exist test', (done) => {
            const fileToWrite = '/tmp/foo/bar';
            const dataToWrite = {
                hello: 'world'
            };

            fs.existsSync = function existsSync() { return false; };

            util.writeDataToFile(dataToWrite, fileToWrite)
                .then(() => {
                    assert.strictEqual(fileNameWritten, fileToWrite);
                    assert.deepEqual(dataWritten, dataToWrite);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('exists test', (done) => {
            fs.existsSync = function existsSync() { return true; };
            fs.unlinkSync = function unlinkSync() {
                unlinkSyncCalled = true;
            };
            unlinkSyncCalled = false;

            util.writeDataToFile('foo', 'bar')
                .then(() => {
                    assert.ok(unlinkSyncCalled);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('error test', (done) => {
            const message = 'foo foo';
            fs.writeFile = function writeFile(file, data, options, cb) {
                cb(new Error(message));
            };

            util.writeDataToFile('foo', 'bar')
                .then(() => {
                    assert.ok(false, 'should have thrown fs error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('read data from file tests', () => {
        it('basic test', (done) => {
            const dataToRead = {
                foo: 'bar'
            };
            const fileToRead = '/tmp/hello/world';
            let fileRead;

            fs.readFile = function readFile(file, cb) {
                fileRead = file;
                cb(null, dataToRead);
            };

            util.readDataFromFile(fileToRead)
                .then((dataRead) => {
                    assert.strictEqual(fileRead, fileToRead);
                    assert.deepEqual(dataRead, dataToRead);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('error test', (done) => {
            const message = 'file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            util.readDataFromFile()
                .then(() => {
                    assert.ok(false, 'should have thrown file read error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('write data to url tests', () => {
        it('basic test', (done) => {
            const fileToWrite = '/tmp/foo';
            const fileUrl = `file://${fileToWrite}`;
            const dataToWrite = {
                foo: 'bar'
            };

            fs.writeFile = function writeFile(file, data, options, cb) {
                fileNameWritten = file;
                dataWritten = data;
                cb(null);
            };

            util.writeDataToUrl(dataToWrite, fileUrl)
                .then(() => {
                    assert.strictEqual(fileNameWritten, fileToWrite);
                    assert.deepEqual(dataWritten, dataToWrite);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('bad url test', (done) => {
            const fileUrl = {};

            util.writeDataToUrl('foo', fileUrl)
                .then(() => {
                    assert.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('must be a string'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('non file url test', (done) => {
            const fileUrl = 'http://www.example.com';

            util.writeDataToUrl('foo', fileUrl)
                .then(() => {
                    assert.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Only file URLs'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('write error test', (done) => {
            const message = 'bad write';
            fs.writeFile = function writeFile(file, data, options, cb) {
                cb(new Error(message));
            };

            util.writeDataToUrl('foo', 'file:///tmp/foo')
                .then(() => {
                    assert.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
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

        it('basic test', (done) => {
            util.download('http://www.example.com')
                .then(() => {
                    assert.ok(dataWritten, 'No data written');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('bad protocol test', (done) => {
            util.download('file:///tmp')
                .then(() => {
                    assert.ok(false, 'should have thrown bad protocol');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Unhandled protocol'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('http error test', (done) => {
            const message = 'http get error';

            Object.keys(require.cache).forEach((key) => {
                delete require.cache[key];
            });

            httpMock = require('../testUtil/httpMock');
            httpMock.reset();
            httpMock.setError(message);

            require.cache.http = {
                exports: httpMock
            };

            util = require('../../../f5-cloud-libs').util;

            util.download('http://www.example.com/foo')
                .then(() => {
                    assert.ok(false, 'should have thrown http error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });

        it('http error file written test', (done) => {
            const message = 'http get error';

            Object.keys(require.cache).forEach((key) => {
                delete require.cache[key];
            });

            httpMock = require('../testUtil/httpMock');
            httpMock.reset();
            httpMock.setError(message);

            require.cache.http = {
                exports: httpMock
            };

            util = require('../../../f5-cloud-libs').util;

            fs.existsSync = function existsSync() {
                return true;
            };
            fs.unlink = function unlink() { };

            util.download('http://www.example.com/foo')
                .then(() => {
                    assert.ok(false, 'should have thrown http error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
                });
        });
    });

    it('remove directory sync test', (done) => {
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
        done();
    });

    describe('read data tests', () => {
        it('read data with cloud provider uri test', (done) => {
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

            util.readData(s3Arn, true)
                .then((readPassword) => {
                    assert.deepEqual(functionsCalled.providerMock.getDataFromUri, s3Arn);
                    assert.strictEqual(readPassword, 'password');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('calls get data from url test', (done) => {
            const password = 'foobar';
            const passwordFile = '/tmp/mypass';

            fs.writeFileSync(passwordFile, password, { encoding: 'ascii' });

            cloudProviderFactoryMock.getCloudProvider = () => {
                throw new Error('Unavailable cloud provider');
            };

            util.readData(`file://${passwordFile}`, true)
                .then((readPassword) => {
                    assert.strictEqual(readPassword, password);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    fs.unlinkSync(passwordFile);
                    done();
                });
        });

        it('reads plain data test', (done) => {
            const password = 'foobar';

            util.readData(password, false)
                .then((readPassword) => {
                    assert.strictEqual(readPassword, password);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('get data from url tests', () => {
        it('file test', (done) => {
            const password = 'foobar';
            const passwordFile = '/tmp/mypass';

            fs.writeFileSync(passwordFile, password, { encoding: 'ascii' });

            util.getDataFromUrl(`file://${passwordFile}`)
                .then((readPassword) => {
                    assert.strictEqual(readPassword, password);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    fs.unlinkSync(passwordFile);
                    done();
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

            it('basic test', (done) => {
                const password = 'foobar';

                httpMock.setResponse(password);

                util.getDataFromUrl('http://www.example.com')
                    .then((readPassword) => {
                        assert.strictEqual(httpMock.lastRequest.path, '/');
                        assert.strictEqual(readPassword, password);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('path and options test', (done) => {
                const path = '/foo/bar';
                const options = {
                    headers: { headerName: 'headerValue' },
                    rejectUnauthorized: false
                };

                util.getDataFromUrl(`http://www.example.com${path}`, options)
                    .then(() => {
                        assert.strictEqual(httpMock.lastRequest.path, path);
                        assert.deepEqual(httpMock.lastRequest.headers, options.headers);
                        assert.strictEqual(
                            httpMock.lastRequest.rejectUnauthorized,
                            options.rejectUnauthorized
                        );
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('query test', (done) => {
                const query = '?hello=world&alpha=beta';

                util.getDataFromUrl(`http://www.example.com${query}`)
                    .then(() => {
                        assert.strictEqual(httpMock.lastRequest.path, `/${query}`);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('json test', (done) => {
                const response = { foo: 'bar', hello: 'world' };

                httpMock.setResponse(response, { 'content-type': 'application/json' });

                util.getDataFromUrl('http://www.example.com')
                    .then((data) => {
                        assert.deepEqual(data, response);
                    })
                    .catch((err) => {
                        assert.ok(false, err);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('bad json test', (done) => {
                const response = 'foobar';

                httpMock.setResponse(response, { 'content-type': 'application/json' });

                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have thrown bad json');
                    })
                    .catch(() => {
                        assert.ok(true);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('bad status test', (done) => {
                const status = 400;

                httpMock.setResponse('foo', {}, status);

                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have been a bad status');
                    })
                    .catch((err) => {
                        assert.notStrictEqual(err.message.indexOf(400), -1);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('http error test', (done) => {
                const message = 'http error occurred';
                httpMock.setError(message);

                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have thrown an error');
                    })
                    .catch((err) => {
                        assert.strictEqual(err.message, message);
                    })
                    .finally(() => {
                        done();
                    });
            });

            it('http throw test', (done) => {
                const message = 'http get threw';
                httpMock.get = function get() {
                    throw new Error(message);
                };

                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        assert.ok(false, 'Should have thrown an error');
                    })
                    .catch((err) => {
                        assert.strictEqual(err.message, message);
                    })
                    .finally(() => {
                        done();
                    });
            });
        });

        it('Unsupported url test', (done) => {
            util.getDataFromUrl('ftp://www.foo.com')
                .then(() => {
                    assert.ok(false, 'Unsupported URL should have failed');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('URLs are currently supported'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('read file error test', (done) => {
            const message = 'read file error';
            fs.readFile = function readFile(file, options, cb) {
                cb(new Error(message));
            };

            util.getDataFromUrl('file:///foo/bar')
                .then(() => {
                    assert.ok(false, 'should have thrown read file error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
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

        it('basic test', (done) => {
            childProcess.exec = function exec(command, cb) {
                if (command.endsWith('.sh')) {
                    execCalled = true;
                    cb();
                }
            };

            util.localReady();
            assert.strictEqual(execCalled, true);
            done();
        });

        it('error test', (done) => {
            const message = 'process exec error';

            childProcess.exec = function exec(command, cb) {
                if (command.endsWith('.sh')) {
                    cb(new Error(message));
                }
            };

            util.localReady()
                .then(() => {
                    assert.ok(false, 'should have thrown process exec error');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, message);
                })
                .finally(() => {
                    done();
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

        it('basic test', (done) => {
            logger = Logger.getLogger({ console: true });

            util.logAndExit();
            assert.strictEqual(exitCalled, true);
            done();
        });

        it('log to file test', (done) => {
            logger = Logger.getLogger({ console: false, fileName: LOGFILE });
            logger.transports.file.on('flush', () => {
                return q();
            });

            util.logAndExit();
            assert.strictEqual(exitCalled, true);
            done();
        });
    });

    it('log error test', (done) => {
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
        done();
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

        it('basic test', (done) => {
            util.runInBackgroundAndExit(process);
            assert.ok(spawnCalled, 'child_process.spawn() was not called');
            assert.ok(unrefCalled, 'child.unref() was not called');
            assert.ok(exitCalled, 'process.exit() was not called');
            done();
        });

        it('too many args test', (done) => {
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
            done();
        });

        it('background removed test', (done) => {
            const processArgv = process.argv;
            const argvMock = ['node', '--foo', '--background'];

            process.argv = argvMock;

            calledArgs.length = 0;
            util.runInBackgroundAndExit(process, 'myLogFile');
            assert.strictEqual(calledArgs.length, 3); // --output myLogFile will be pushed
            assert.strictEqual(calledArgs.indexOf('--background'), -1);

            process.argv = processArgv;
            done();
        });

        it('output added test', (done) => {
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
            done();
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

        it('basic test', (done) => {
            util.reboot(bigIpMock)
                .then(() => {
                    startupScripts.forEach((script) => {
                        assert.notStrictEqual(writtenCommands.indexOf(script), -1);
                        assert.strictEqual(bigIpMock.rebootCalled, true);
                    });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('signal only test', (done) => {
            util.reboot(bigIpMock, { signalOnly: true })
                .then(() => {
                    startupScripts.forEach((script) => {
                        assert.notStrictEqual(writtenCommands.indexOf(script), -1);
                        assert.strictEqual(bigIpMock.rebootCalled, false);
                    });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('missing startup dir test', (done) => {
            fs.existsSync = function existsSync() {
                return false;
            };

            util.reboot(bigIpMock)
                .then(() => {
                    assert.strictEqual(writtenCommands, undefined);
                    assert.strictEqual(bigIpMock.rebootCalled, true);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('read file error test', (done) => {
            fs.readFileSync = function readFileSync() {
                throw new Error();
            };

            util.reboot(bigIpMock)
                .then(() => {
                    assert.ok(false, 'fs.readFileSync should have thrown');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('read dir error test', (done) => {
            fs.readdirSync = function readdirSync() {
                throw new Error();
            };

            util.reboot(bigIpMock)
                .then(() => {
                    assert.ok(false, 'fs.readdirSync should have thrown');
                })
                .catch(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('write file sync error test', (done) => {
            fs.writeFileSync = function writeFileSync() {
                throw new Error();
            };

            util.reboot(bigIpMock)
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

    describe('get args to strip during forced reboot test', () => {
        it('basic test', (done) => {
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
            done();
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

        it('basic test', (done) => {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    assert.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('strip args with param test', (done) => {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--one'])
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.strictEqual(savedArgs.indexOf('--one'), -1);
                    assert.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('strip args without param test', (done) => {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--two'])
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    assert.strictEqual(savedArgs.indexOf('abc'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('dir created test', (done) => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            fs.mkdirSync = function mkdirSync(dirName) {
                createdDir = dirName;
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.strictEqual(createdDir, '/tmp/rebootScripts/');
                    done();
                });
        });

        it('dir create error test', (done) => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'FOOBAR' });
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    assert.ok(true);
                })
                .finally(() => {
                    done();
                });
        });

        it('mkdir race condition test', (done) => {
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

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    const savedArgs = getSavedArgs();
                    assert.notStrictEqual(savedArgs.indexOf('--one'), -1);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('mkdir race condition fail test', (done) => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            fs.mkdirSync = function mkdirSync(dirName) {
                fsMkdirSync(dirName);
                throw new Error();
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

        it('stat throws test', (done) => {
            fs.stat = function stat() {
                throw new Error('fsStat threw');
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

        it('open throws test', (done) => {
            fs.open = function open() {
                throw new Error('fsOpen threw');
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

        it('write sync throws test', (done) => {
            fs.writeSync = function writeSync() {
                throw new Error('fsWriteSync threw');
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

    it('parse tmsh response test', (done) => {
        const tmshResponse = `sys crypto key garrett.key {
            key-size 3072
            key-type rsa-private
            security-type password
        }`;
        const response = util.parseTmshResponse(tmshResponse);
        assert.strictEqual(response['security-type'], 'password');
        done();
    });

    describe('get product test', () => {
        it('has product string test', (done) => {
            util.getProductString = function getProductString() {
                return q('BIG-IQ');
            };
            util.getProduct()
                .then((response) => {
                    assert.strictEqual(response, 'BIG-IQ');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('empty product string test', (done) => {
            util.getProductString = function getProductString() {
                return q('');
            };
            util.runTmshCommand = function runTmshCommand() {
                util.getProductString = function getProductString() {
                    return q('BIG-IP');
                };
                return q('BIG-IP');
            };
            util.getProduct()
                .then((response) => {
                    assert.strictEqual(response, 'BIG-IP');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('fail to get product string test', (done) => {
            util.getProductString = function getProductString() {
                return q.reject('failed');
            };
            util.getProduct()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err, 'failed');
                })
                .finally(() => {
                    done();
                });
        });

        it('container test', (done) => {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            util.getProduct()
                .then((response) => {
                    assert.strictEqual(response, 'CONTAINER');
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('fail to run fs stat test', (done) => {
            fs.stat = function stat(dir, cb) {
                cb({ message: 'failed', code: 'FOO' });
            };
            util.getProduct()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'failed');
                })
                .finally(() => {
                    done();
                });
        });

        it('fail to run tmsh command test', (done) => {
            util.runTmshCommand = function runTmshCommand() {
                return q.reject('failed');
            };
            util.getProductString = function getProductString() {
                return q('');
            };
            util.getProduct()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err, 'failed');
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('get process execution time with pid test', () => {
        it('no command provided test', (done) => {
            util.getProcessExecutionTimeWithPid()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'grep command is required');
                })
                .finally(() => {
                    done();
                });
        });

        it('shell command format test', (done) => {
            let passedCommand;
            util.runShellCommand = function runShellCommand(shellCommand) {
                passedCommand = shellCommand;
                return q(0);
            };

            const grepCommand = 'grep autoscale.js';
            const cmd = `/bin/ps -eo pid,etime,cmd --sort=-time | ${grepCommand} | awk '{ print $1"-"$2 }'`;
            util.getProcessExecutionTimeWithPid(grepCommand)
                .then(() => {
                    assert.strictEqual(passedCommand, cmd);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('terminate process by id test', () => {
        it('no command provided test', (done) => {
            util.terminateProcessById()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'pid is required for process termination');
                })
                .finally(() => {
                    done();
                });
        });

        it('shell command format test', (done) => {
            let passedCommand;
            util.runShellCommand = function runShellCommand(shellCommand) {
                passedCommand = shellCommand;
                return q(0);
            };

            const pid = '111';
            util.terminateProcessById(pid)
                .then(() => {
                    assert.strictEqual(passedCommand, `/bin/kill -9 ${pid}`);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('process count test', () => {
        it('no command provided test', (done) => {
            util.getProcessCount()
                .then((response) => {
                    assert.ok(false, response);
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'grep command is required');
                })
                .finally(() => {
                    done();
                });
        });

        it('shell command format test', (done) => {
            let passedCommand;
            util.runShellCommand = function runShellCommand(shellCommand) {
                passedCommand = shellCommand;
                return q(0);
            };

            const grepCommand = 'grep autoscale.js';
            util.getProcessCount(grepCommand)
                .then(() => {
                    assert.strictEqual(passedCommand, `/bin/ps -eo pid,cmd | ${grepCommand} | wc -l`);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
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
    });

    it('version compare test', (done) => {
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

        done();
    });
});
