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
const childProcess = require('child_process');
const q = require('q');

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
let spawnCalled;
let calledArgs;

// child_process mock
let childProcessSpawn;
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
module.exports = {
    setUp(callback) {
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

        cloudProviderFactoryMock.getCloudProvider = (...args) => {
            functionsCalled.cloudProviderFactoryMock.getCloudProvider = args[0];
            return providerMock;
        };

        functionsCalled = {
            cloudProviderFactoryMock: {},
            providerMock: {}
        };

        callback();
    },

    tearDown(callback) {
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
        callback();
    },

    testCommandLineParsing: {
        testCollect(test) {
            const container = [];
            let input = 'foobar';
            util.collect(input, container);
            input = 'hello world';
            util.collect(input, container);
            test.strictEqual(container.length, 2);
            test.notStrictEqual(container.indexOf('foobar'), -1);
            test.notStrictEqual(container.indexOf('hello world'), -1);
            test.done();
        },

        testCsv(test) {
            test.deepEqual(util.csv('1,2,3', []), [['1', '2', '3']]);
            test.deepEqual(util.csv('1, 2, 3 ', []), [['1', '2', '3']]);
            test.deepEqual(util.csv('1, 2, 3', [['4', '5', '6']]), [['4', '5', '6'], ['1', '2', '3']]);

            test.done();
        },

        testMap(test) {
            let container = {};
            let input = 'foo:bar, hello:world';
            util.map(input, container);
            test.deepEqual(container, { foo: 'bar', hello: 'world' });
            input = 'fooz:bazz';
            util.map(input, container);
            test.deepEqual(container, { foo: 'bar', hello: 'world', fooz: 'bazz' });
            input = 'hello:goodbye';
            util.map(input, container);
            test.deepEqual(container, { foo: 'bar', hello: 'goodbye', fooz: 'bazz' });
            input = 'key1:value1,key2:true,key3:false';
            container = {};
            util.map(input, container);
            test.deepEqual(container, { key1: 'value1', key2: true, key3: false });
            test.done();
        },

        testMapArray(test) {
            const container = [];
            let input = 'foo:bar, hello:world';
            util.mapArray(input, container);
            input = 'fooz:bazz';
            util.mapArray(input, container);
            test.strictEqual(container[0].foo, 'bar');
            test.strictEqual(container[0].hello, 'world');
            test.strictEqual(container[1].fooz, 'bazz');
            test.done();
        },

        testPair(test) {
            const container = {};
            let input = 'foo:bar';
            util.pair(input, container);
            input = 'hello: world ';
            util.pair(input, container);
            test.strictEqual(container.foo, 'bar');
            test.strictEqual(container.hello, 'world');
            test.done();
        }
    },

    testLowerCaseKeys(test) {
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

        test.expect(2);
        test.deepEqual(util.lowerCaseKeys(nestedObject),
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
        test.strictEqual(util.lowerCaseKeys(asString), asString);
        test.done();
    },

    testDeleteArgs(test) {
        const id = 'foo';
        let deletedPath;

        fs.existsSync = function existsSync() { return true; };
        fs.unlinkSync = function unlinkSync(path) {
            deletedPath = path;
        };
        util.deleteArgs(id);
        test.strictEqual(deletedPath, '/tmp/rebootScripts/foo.sh');
        test.done();
    },

    testIpToNumber(test) {
        test.strictEqual(util.ipToNumber('10.11.12.13'), 168496141);
        test.done();
    },

    testWriteDataToFile: {
        setUp(callback) {
            fs.writeFile = function writeFile(file, data, options, cb) {
                fileNameWritten = file;
                dataWritten = data;
                cb(null);
            };

            callback();
        },

        testDoesNotExist(test) {
            const fileToWrite = '/tmp/foo/bar';
            const dataToWrite = {
                hello: 'world'
            };

            fs.existsSync = function existsSync() { return false; };

            test.expect(2);
            util.writeDataToFile(dataToWrite, fileToWrite)
                .then(() => {
                    test.strictEqual(fileNameWritten, fileToWrite);
                    test.deepEqual(dataWritten, dataToWrite);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testExists(test) {
            fs.existsSync = function existsSync() { return true; };
            fs.unlinkSync = function unlinkSync() {
                unlinkSyncCalled = true;
            };
            unlinkSyncCalled = false;

            test.expect(1);
            util.writeDataToFile('foo', 'bar')
                .then(() => {
                    test.ok(unlinkSyncCalled);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testError(test) {
            const message = 'foo foo';
            fs.writeFile = function writeFile(file, data, options, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            util.writeDataToFile('foo', 'bar')
                .then(() => {
                    test.ok(false, 'should have thrown fs error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testReadDataFromFile: {
        testBasic(test) {
            const dataToRead = {
                foo: 'bar'
            };
            const fileToRead = '/tmp/hello/world';
            let fileRead;

            fs.readFile = function readFile(file, cb) {
                fileRead = file;
                cb(null, dataToRead);
            };

            test.expect(2);
            util.readDataFromFile(fileToRead)
                .then((dataRead) => {
                    test.strictEqual(fileRead, fileToRead);
                    test.deepEqual(dataRead, dataToRead);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testError(test) {
            const message = 'file error';

            fs.readFile = function readFile(file, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            util.readDataFromFile()
                .then(() => {
                    test.ok(false, 'should have thrown file read error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testWriteDataToUrl: {
        testBasic(test) {
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

            test.expect(2);
            util.writeDataToUrl(dataToWrite, fileUrl)
                .then(() => {
                    test.strictEqual(fileNameWritten, fileToWrite);
                    test.deepEqual(dataWritten, dataToWrite);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadUrl(test) {
            const fileUrl = {};

            test.expect(1);
            util.writeDataToUrl('foo', fileUrl)
                .then(() => {
                    test.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('must be a string'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testNonFileUrl(test) {
            const fileUrl = 'http://www.example.com';

            test.expect(1);
            util.writeDataToUrl('foo', fileUrl)
                .then(() => {
                    test.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('Only file URLs'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testWriteError(test) {
            const message = 'bad write';
            fs.writeFile = function writeFile(file, data, options, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            util.writeDataToUrl('foo', 'file:///tmp/foo')
                .then(() => {
                    test.ok(false, 'should have thrown bad url');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testDownload: {
        setUp(callback) {
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

            callback();
        },

        tearDown(callback) {
            http.get = httpGet;
            callback();
        },

        testBasic(test) {
            util.download('http://www.example.com')
                .then(() => {
                    test.ok(dataWritten, 'No data written');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadProtocol(test) {
            test.expect(1);
            util.download('file:///tmp')
                .then(() => {
                    test.ok(false, 'should have thrown bad protocol');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('Unhandled protocol'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testHttpError(test) {
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

            test.expect(1);
            util.download('http://www.example.com/foo')
                .then(() => {
                    test.ok(false, 'should have thrown http error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        },

        testHttpErrorFileWritten(test) {
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

            test.expect(1);
            util.download('http://www.example.com/foo')
                .then(() => {
                    test.ok(false, 'should have thrown http error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testRemoveDirectorySync(test) {
        const os = require('os');
        const sep = require('path').sep;
        const tmpDirBase = os.tmpdir();
        const tmpDir = fs.mkdtempSync(`${tmpDirBase}${sep}`);
        const fileName = 'foo';
        const subDir = fs.mkdtempSync(`${tmpDir}${sep}`);

        test.expect(1);

        fs.writeFileSync(`${tmpDir}${sep}${fileName}`, 'bar');
        fs.writeFileSync(`${subDir}${sep}${fileName}`, 'bar');

        util.removeDirectorySync(tmpDir);
        test.strictEqual(fs.existsSync(tmpDir), false);
        test.done();
    },

    testReadData: {
        testAWSReadUriData(test) {
            providerMock.init = () => {
                return q();
            };
            providerMock.getDataFromUri = (...args) => {
                functionsCalled.providerMock.getDataFromUri = args;
                return q('password');
            };
            const s3Arn = 'arn:::foo:bar/password';

            test.expect(3);
            util.readData(s3Arn, true)
                .then((readPassword) => {
                    test.deepEqual(functionsCalled.providerMock.getDataFromUri, [s3Arn]);
                    test.strictEqual(readPassword, 'password');
                    test.strictEqual(functionsCalled.cloudProviderFactoryMock.getCloudProvider, 'aws');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testCallsGetDataFromUrl(test) {
            const password = 'foobar';
            const passwordFile = '/tmp/mypass';

            fs.writeFileSync(passwordFile, password, { encoding: 'ascii' });

            test.expect(1);
            util.readData(`file://${passwordFile}`, true)
                .then((readPassword) => {
                    test.strictEqual(readPassword, password);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    fs.unlinkSync(passwordFile);
                    test.done();
                });
        },

        testReadsPlainData(test) {
            const password = 'foobar';

            test.expect(1);
            util.readData(password, false)
                .then((readPassword) => {
                    test.strictEqual(readPassword, password);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testGetDataFromUrl: {
        testFile(test) {
            const password = 'foobar';
            const passwordFile = '/tmp/mypass';

            fs.writeFileSync(passwordFile, password, { encoding: 'ascii' });

            test.expect(1);
            util.getDataFromUrl(`file://${passwordFile}`)
                .then((readPassword) => {
                    test.strictEqual(readPassword, password);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    fs.unlinkSync(passwordFile);
                    test.done();
                });
        },

        testHttp: {
            setUp(callback) {
                Object.keys(require.cache).forEach((key) => {
                    delete require.cache[key];
                });

                httpMock = require('../testUtil/httpMock');
                httpMock.reset();

                require.cache.http = {
                    exports: httpMock
                };

                util = require('../../../f5-cloud-libs').util;

                callback();
            },

            testBasic(test) {
                const password = 'foobar';

                httpMock.setResponse(password);

                test.expect(2);
                util.getDataFromUrl('http://www.example.com')
                    .then((readPassword) => {
                        test.strictEqual(httpMock.lastRequest.path, '/');
                        test.strictEqual(readPassword, password);
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testPathAndHeaders(test) {
                const path = '/foo/bar';
                const headers = { headerName: 'headerValue' };

                test.expect(2);
                util.getDataFromUrl(`http://www.example.com${path}`, { headers })
                    .then(() => {
                        test.strictEqual(httpMock.lastRequest.path, path);
                        test.deepEqual(httpMock.lastRequest.headers, headers);
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testQuery(test) {
                const query = '?hello=world&alpha=beta';

                test.expect(1);
                util.getDataFromUrl(`http://www.example.com${query}`)
                    .then(() => {
                        test.strictEqual(httpMock.lastRequest.path, `/${query}`);
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testJson(test) {
                const response = { foo: 'bar', hello: 'world' };

                httpMock.setResponse(response, { 'content-type': 'application/json' });

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then((data) => {
                        test.deepEqual(data, response);
                    })
                    .catch((err) => {
                        test.ok(false, err);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testBadJson(test) {
                const response = 'foobar';

                httpMock.setResponse(response, { 'content-type': 'application/json' });

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        test.ok(false, 'Should have thrown bad json');
                    })
                    .catch(() => {
                        test.ok(true);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testBadStatus(test) {
                const status = 400;

                httpMock.setResponse('foo', {}, status);

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        test.ok(false, 'Should have been a bad status');
                    })
                    .catch((err) => {
                        test.notStrictEqual(err.message.indexOf(400), -1);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testHttpError(test) {
                const message = 'http error occurred';
                httpMock.setError(message);

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        test.ok(false, 'Should have thrown an error');
                    })
                    .catch((err) => {
                        test.strictEqual(err.message, message);
                    })
                    .finally(() => {
                        test.done();
                    });
            },

            testHttpThrow(test) {
                const message = 'http get threw';
                httpMock.get = function get() {
                    throw new Error(message);
                };

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(() => {
                        test.ok(false, 'Should have thrown an error');
                    })
                    .catch((err) => {
                        test.strictEqual(err.message, message);
                    })
                    .finally(() => {
                        test.done();
                    });
            }
        },

        testUnsupportedUrl(test) {
            test.expect(1);
            util.getDataFromUrl('ftp://www.foo.com')
                .then(() => {
                    test.ok(false, 'Unsupported URL should have failed');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('URLs are currently supported'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testReadFileError(test) {
            const message = 'read file error';
            fs.readFile = function readFile(file, options, cb) {
                cb(new Error(message));
            };

            util.getDataFromUrl('file:///foo/bar')
                .then(() => {
                    test.ok(false, 'should have thrown read file error');
                })
                .catch((err) => {
                    test.strictEqual(err.message, message);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testLogAndExit: {
        setUp(callback) {
            // eslint-disable-next-line no-global-assign
            setTimeout = function (cb) {
                cb();
            };
            process.exit = function exit() {
                exitCalled = true;
            };
            callback();
        },

        tearDown(callback) {
            setTimeout = realSetTimeout; // eslint-disable-line no-global-assign
            callback();
        },

        testBasic(test) {
            logger = Logger.getLogger({ console: true });

            util.logAndExit();
            test.strictEqual(exitCalled, true);
            test.done();
        },

        testLogToFile(test) {
            logger = Logger.getLogger({ console: false, fileName: LOGFILE });
            logger.transports.file.on('flush', () => {
                return q();
            });

            util.logAndExit();
            test.strictEqual(exitCalled, true);
            test.done();
        }
    },

    testlogError(test) {
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

        test.expect(4);
        test.strictEqual(loggerReceivedOptions.json, true);
        test.strictEqual(loggerReceivedOptions.fileName, '/tmp/cloudLibsError.log');
        test.strictEqual(loggerReceivedOptions.verboseLabel, true);
        test.strictEqual(errorMessage, loggerReceivedMessage);
        test.done();
    },

    testRunInBackgroundAndExit: {
        setUp(callback) {
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

            callback();
        },

        tearDown(callback) {
            childProcess.spawn = childProcessSpawn;
            callback();
        },

        testBasic(test) {
            util.runInBackgroundAndExit(process);
            test.ok(spawnCalled, 'child_process.spawn() was not called');
            test.ok(unrefCalled, 'child.unref() was not called');
            test.ok(exitCalled, 'process.exit() was not called');
            test.done();
        },

        testTooManyArgs(test) {
            const processArgv = process.argv;
            const argvMock = [];

            for (let i = 0; i < 101; ++i) {
                argvMock.push(i);
            }

            process.argv = argvMock;

            util.runInBackgroundAndExit(process);
            test.ifError(spawnCalled);
            test.ok(exitCalled, 'process.exit() was not called');

            process.argv = processArgv;
            test.done();
        },

        testBackgroundRemoved(test) {
            const processArgv = process.argv;
            const argvMock = ['node', '--foo', '--background'];

            process.argv = argvMock;

            calledArgs.length = 0;
            util.runInBackgroundAndExit(process, 'myLogFile');
            test.strictEqual(calledArgs.length, 3); // --output myLogFile will be pushed
            test.strictEqual(calledArgs.indexOf('--background'), -1);

            process.argv = processArgv;
            test.done();
        },

        testOutputAdded(test) {
            const processArgv = process.argv;
            const argvMock = ['node'];
            const logFile = 'myLogFile';

            process.argv = argvMock;

            calledArgs.length = 0;
            util.runInBackgroundAndExit(process, logFile);
            test.strictEqual(calledArgs.length, 2); // --output myLogFile will be pushed
            test.notStrictEqual(calledArgs.indexOf('--output'), -1);
            test.notStrictEqual(calledArgs.indexOf(logFile), -1);

            process.argv = processArgv;
            test.done();
        }
    },

    testReboot: {
        setUp(callback) {
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

            callback();
        },

        testBasic(test) {
            test.expect(4);
            util.reboot(bigIpMock)
                .then(() => {
                    startupScripts.forEach((script) => {
                        test.notStrictEqual(writtenCommands.indexOf(script), -1);
                        test.strictEqual(bigIpMock.rebootCalled, true);
                    });
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testSignalOnly(test) {
            test.expect(4);
            util.reboot(bigIpMock, { signalOnly: true })
                .then(() => {
                    startupScripts.forEach((script) => {
                        test.notStrictEqual(writtenCommands.indexOf(script), -1);
                        test.strictEqual(bigIpMock.rebootCalled, false);
                    });
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMissingStartupDir(test) {
            fs.existsSync = function existsSync() {
                return false;
            };

            test.expect(2);
            util.reboot(bigIpMock)
                .then(() => {
                    test.strictEqual(writtenCommands, undefined);
                    test.strictEqual(bigIpMock.rebootCalled, true);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testReadFileError(test) {
            fs.readFileSync = function readFileSync() {
                throw new Error();
            };

            test.expect(1);
            util.reboot(bigIpMock)
                .then(() => {
                    test.ok(false, 'fs.readFileSync should have thrown');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testReaddirError(test) {
            fs.readdirSync = function readdirSync() {
                throw new Error();
            };

            test.expect(1);
            util.reboot(bigIpMock)
                .then(() => {
                    test.ok(false, 'fs.readdirSync should have thrown');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testWriteFileSyncError(test) {
            fs.writeFileSync = function writeFileSync() {
                throw new Error();
            };

            test.expect(1);
            util.reboot(bigIpMock)
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

    testSaveArgs: {

        setUp(callback) {
            argv = ['node', 'utilTests.js', '--one', '--two', 'abc'];
            callback();
        },

        tearDown(callback) {
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
            } finally {
                callback();
            }
        },

        testBasic(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    const savedArgs = getSavedArgs();
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    test.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testStripArgsWithParam(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--two'])
                .then(() => {
                    const savedArgs = getSavedArgs();
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    test.strictEqual(savedArgs.indexOf('abc'), -1);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testStripArgsWithoutParam(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--one'])
                .then(() => {
                    const savedArgs = getSavedArgs();
                    test.strictEqual(savedArgs.indexOf('--one'), -1);
                    test.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testDirCreated(test) {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            fs.mkdirSync = function mkdirSync(dirName) {
                createdDir = dirName;
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    test.strictEqual(createdDir, '/tmp/rebootScripts/');
                    test.done();
                });
        },

        testDirCreateError(test) {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'FOOBAR' });
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMkdirRaceCondition(test) {
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
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testMkdirRaceConditionFail(test) {
            fs.stat = function stat(dir, cb) {
                cb({ code: 'ENOENT' });
            };

            fs.mkdirSync = function mkdirSync(dirName) {
                fsMkdirSync(dirName);
                throw new Error();
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

        testStatThrows(test) {
            fs.stat = function stat() {
                throw new Error('fsStat threw');
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

        testOpenThrows(test) {
            fs.open = function open() {
                throw new Error('fsOpen threw');
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

        testWriteSyncThrows(test) {
            fs.writeSync = function writeSync() {
                throw new Error('fsWriteSync threw');
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
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

    testGetProduct: {
        testHasProductString(test) {
            util.getProductString = function getProductString() {
                return q('BIG-IQ');
            };
            util.getProduct()
                .then((response) => {
                    test.strictEqual(response, 'BIG-IQ');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testEmptyProductString(test) {
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
                    test.strictEqual(response, 'BIG-IP');
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testFailToGetProductString(test) {
            util.getProductString = function getProductString() {
                return q.reject('failed');
            };
            util.getProduct()
                .then((response) => {
                    test.ok(false, response);
                })
                .catch((err) => {
                    test.strictEqual(err, 'failed');
                })
                .finally(() => {
                    test.done();
                });
        },

        testFailToRunTmshCommand(test) {
            util.runTmshCommand = function runTmshCommand() {
                return q.reject('failed');
            };
            util.getProductString = function getProductString() {
                return q('');
            };
            util.getProduct()
                .then((response) => {
                    test.ok(false, response);
                })
                .catch((err) => {
                    test.strictEqual(err, 'failed');
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testTryUntil: {
        setUp(callback) {
            funcCount = 0;
            callback();
        },

        testCalledOnce(test) {
            const func = function () {
                const deferred = q.defer();
                funcCount += 1;
                deferred.resolve();
                return deferred.promise;
            };

            test.expect(1);
            util.tryUntil(this, util.NO_RETRY, func)
                .then(() => {
                    test.strictEqual(funcCount, 1);
                    test.done();
                });
        },

        testCalledMultiple(test) {
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

            test.expect(1);
            util.tryUntil(this, { maxRetries: retries, retryIntervalMs: 10 }, func)
                .then(() => {
                    test.strictEqual(funcCount, retries);
                    test.done();
                });
        },

        testWithThrow(test) {
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

            test.expect(1);
            util.tryUntil(this, { maxRetries: retries, retryIntervalMs: 10 }, func)
                .then(() => {
                    test.strictEqual(funcCount, retries);
                    test.done();
                });
        },

        testNotResolved(test) {
            const func = function () {
                const deferred = q.defer();
                deferred.reject();
                return deferred.promise;
            };

            test.expect(1);
            util.tryUntil(this, { maxRetries: 2, retryIntervalMs: 10 }, func)
                .then(() => {
                    test.ok(false, 'func should never have resolved');
                })
                .catch(() => {
                    test.ok(true);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadRequest(test) {
            const errorMessage = 'foo';
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: errorMessage
                    }
                );
            };

            test.expect(1);
            util.tryUntil(this, { maxRetries: 90, retryIntervalMs: 10 }, func)
                .then(() => {
                    test.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    test.strictEqual(err.message, errorMessage);
                })
                .finally(() => {
                    test.done();
                });
        },

        testContinueOnError(test) {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'foo'
                    }
                );
            };

            test.expect(1);
            util.tryUntil(this, { maxRetries: 2, retryIntervalMs: 10, continueOnError: true }, func)
                .then(() => {
                    test.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('max tries'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testContinueOnErrorMessageIsMessage(test) {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'is foo'
                    }
                );
            };

            test.expect(1);
            util.tryUntil(this, { maxRetries: 2, retryIntervalMs: 10, continueOnErrorMessage: 'foo' }, func)
                .then(() => {
                    test.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('max tries'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testContinueOnErrorMessageIsMessageRegex(test) {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'is foo'
                    }
                );
            };

            test.expect(1);
            util.tryUntil(this, { maxRetries: 2, retryIntervalMs: 10, continueOnErrorMessage: /foo/ }, func)
                .then(() => {
                    test.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('max tries'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

        testContinueOnErrorMessageIsNotMessage(test) {
            const func = function () {
                return q.reject(
                    {
                        code: 400,
                        message: 'is foo'
                    }
                );
            };

            test.expect(1);
            util.tryUntil(this, { maxRetries: 2, retryIntervalMs: 10, continueOnErrorMessage: 'bar' }, func)
                .then(() => {
                    test.ok(false, 'func should never have resolved');
                })
                .catch((err) => {
                    test.strictEqual(err.message.indexOf('max tries'), -1);
                })
                .finally(() => {
                    test.done();
                });
        }
    },

    testVersionCompare(test) {
        test.strictEqual(util.versionCompare('1.7.1', '1.7.10'), -1);
        test.strictEqual(util.versionCompare('1.7.10', '1.7.1'), 1);
        test.strictEqual(util.versionCompare('1.7.2', '1.7.10'), -1);
        test.strictEqual(util.versionCompare('1.6.1', '1.7.10'), -1);
        test.strictEqual(util.versionCompare('1.6.20', '1.7.10'), -1);
        test.strictEqual(util.versionCompare('1.7.1', '1.7.10'), -1);
        test.strictEqual(util.versionCompare('1.7', '1.7.0'), -1);
        test.strictEqual(util.versionCompare('1.7', '1.8.0'), -1);
        test.strictEqual(util.versionCompare('1.7.2', '1.7.10b'), -1);

        test.strictEqual(util.versionCompare('1.7.10', '1.7.1'), 1);
        test.strictEqual(util.versionCompare('1.7.10', '1.6.1'), 1);
        test.strictEqual(util.versionCompare('1.7.10', '1.6.20'), 1);
        test.strictEqual(util.versionCompare('1.7.0', '1.7'), 1);
        test.strictEqual(util.versionCompare('1.8.0', '1.7'), 1);

        test.strictEqual(util.versionCompare('1.7.10', '1.7.10'), 0);
        test.strictEqual(util.versionCompare('1.7', '1.7'), 0);
        test.strictEqual(util.versionCompare('1.7', '1.7.0', { zeroExtend: true }), 0);

        test.strictEqual(util.versionCompare('1.3-dev1', '1.3-dev1'), 0);
        test.strictEqual(util.versionCompare('1.3-dev1', '1.3-dev2'), -1);
        test.strictEqual(util.versionCompare('1.3-dev2', '1.3-dev1'), 1);
        test.strictEqual(util.versionCompare('1.3-dev19', '1.3-dev2'), 1);

        test.strictEqual(util.versionCompare('12.0.0-hf1', '12.0.0-hf2'), -1);
        test.strictEqual(util.versionCompare('12.0.1-hf1', '12.0.0-hf3'), 1);
        test.strictEqual(util.versionCompare('12.1.0', '12.0.0-hf1'), 1);

        test.strictEqual(util.versionCompare('12.0.0-a1', '12.0.0-b1'), -1);
        test.strictEqual(util.versionCompare('12.0.1-b1', '12.0.0-a1'), 1);

        test.strictEqual(util.versionCompare('12.0.0-b1', '12.0.0-a1'), 1);

        test.strictEqual(util.versionCompare('12.0.0-1', '12.0.0-a1'), 1);
        test.strictEqual(util.versionCompare('12.0.0-a1', '12.0.0-1'), -1);

        test.done();
    }
};

