/**
 * Copyright 2016-2017 F5 Networks, Inc.
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

var fs = require('fs');
var util = require('../../../f5-cloud-libs').util;
var childProcess = require('child_process');
var http = require('http');
var q = require('q');

var UTIL_ARGS_TEST_FILE = 'UTIL_ARGS_TEST_FILE';

var argv;
var funcCount;

// process mock
var processExit;
var exitCalled;
var spawnCalled;
var calledArgs;

// child_process mock
var childProcessSpawn;
var unrefCalled;
var childMock = {
    unref: function() {
        unrefCalled = true;
    }
};

var bigIpMock = {};

// fs mock
var fsStat;
var fsExistsSync;
var fsUnlink;
var fsUnlinkSync;
var fsReadFile;
var fsReadFileSync;
var fsWriteFileSync;
var fsMkdirSync;
var fsReaddirSync;
var fsCreateWriteStream;
var startupCommands;
var startupScripts;
var writtenCommands;
var fileNameWritten;
var dataWritten;
var createdDir;
var unlinkSyncCalled;

// http mock
var httpMock;
var httpGet;

var getSavedArgs = function() {
    return fs.readFileSync('/tmp/rebootScripts/' + UTIL_ARGS_TEST_FILE + '.sh').toString();
};

module.exports = {
    setUp: function(callback) {
        fsStat = fs.stat;
        fsExistsSync = fs.existsSync;
        fsUnlink = fs.unlink;
        fsUnlinkSync = fs.unlinkSync;
        fsReadFile = fs.readFile;
        fsReadFileSync = fs.readFileSync;
        fsWriteFileSync = fs.writeFileSync;
        fsReaddirSync = fs.readdirSync;
        fsMkdirSync = fs.mkdirSync;
        fsCreateWriteStream = fs.createWriteStream;

        callback();
    },

    tearDown: function(callback) {
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });

        fs.stat = fsStat;
        fs.existsSync = fsExistsSync;
        fs.unlink = fsUnlink;
        fs.unlinkSync = fsUnlinkSync;
        fs.readFile = fsReadFile;
        fs.readFileSync = fsReadFileSync;
        fs.writeFileSync = fsWriteFileSync;
        fs.readdirSync = fsReaddirSync;
        fs.mkdirSync = fsMkdirSync;
        fs.createWriteStream = fsCreateWriteStream;

        callback();
    },

    testCommandLineParsing: {
        testCollect: function(test) {
            var container = [];
            var input = 'foobar';
            util.collect(input, container);
            input = 'hello world';
            util.collect(input, container);
            test.strictEqual(container.length, 2);
            test.notStrictEqual(container.indexOf('foobar'), -1);
            test.notStrictEqual(container.indexOf('hello world'), -1);
            test.done();
        },

        testCsv: function(test) {
            test.deepEqual(util.csv("1,2,3", []), [["1", "2", "3"]]);
            test.deepEqual(util.csv("1, 2, 3 ", []), [["1", "2", "3"]]);
            test.deepEqual(util.csv("1, 2, 3", [["4", "5", "6"]]), [["4", "5", "6"], ["1", "2", "3"]]);

            test.done();
        },

        testMap: function(test) {
            var container = {};
            var input = 'foo:bar, hello:world';
            util.map(input, container);
            test.deepEqual(container, {foo: 'bar', hello: 'world'});
            input = 'fooz:bazz';
            util.map(input, container);
            test.deepEqual(container, {foo: 'bar', hello: 'world', fooz: 'bazz'});
            input = 'hello:goodbye';
            util.map(input, container);
            test.deepEqual(container, {foo: 'bar', hello: 'goodbye', fooz: 'bazz'});
            test.done();
        },

        testMapArray: function(test) {
            var container = [];
            var input = 'foo:bar, hello:world';
            util.mapArray(input, container);
            input = 'fooz:bazz';
            util.mapArray(input, container);
            test.strictEqual(container[0].foo, 'bar');
            test.strictEqual(container[0].hello, 'world');
            test.strictEqual(container[1].fooz, 'bazz');
            test.done();
        },

        testPair: function(test) {
            var container = {};
            var input = 'foo:bar';
            util.pair(input, container);
            input = 'hello: world ';
            util.pair(input, container);
            test.strictEqual(container.foo, 'bar');
            test.strictEqual(container.hello, 'world');
            test.done();
        }
    },

    testDeleteArgs: function(test) {
        var id = 'foo';
        var deletedPath;

        fs.existsSync = function() {return true;};
        fs.unlinkSync = function(path) {
            deletedPath = path;
        };
        util.deleteArgs(id);
        test.strictEqual(deletedPath, '/tmp/rebootScripts/foo.sh');
        test.done();
    },

    testWriteDataToFile: {
        setUp: function(callback) {
            fs.writeFile = function(file, data, options, cb) {
                fileNameWritten = file;
                dataWritten = data;
                cb(null);
            };

            callback();
        },

        testDoesNotExist: function(test) {
            var fileToWrite = '/tmp/foo/bar';
            var dataToWrite = {
                hello: 'world'
            };

            fs.existsSync = function() {return false;};

            test.expect(2);
            util.writeDataToFile(dataToWrite, fileToWrite)
                .then(function() {
                    test.strictEqual(fileNameWritten, fileToWrite);
                    test.deepEqual(dataWritten, dataToWrite);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testExists: function(test) {
            fs.existsSync = function() {return true;};
            fs.unlinkSync = function() {
                unlinkSyncCalled = true;
            };
            unlinkSyncCalled = false;

            test.expect(1);
            util.writeDataToFile('foo', 'bar')
                .then(function() {
                    test.ok(unlinkSyncCalled);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testError: function(test) {
            var message = 'foo foo';
            fs.writeFile = function(file, data, options, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            util.writeDataToFile('foo', 'bar')
                .then(function() {
                    test.ok(false, 'should have thrown fs error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testReadDataFromFile: {
        testBasic: function(test) {
            var dataToRead = {
                foo: 'bar'
            };
            var fileToRead = '/tmp/hello/world';
            var fileRead;

            fs.readFile = function(file, cb) {
                fileRead = file;
                cb(null, dataToRead);
            };

            test.expect(2);
            util.readDataFromFile(fileToRead)
                .then(function(dataRead) {
                    test.strictEqual(fileRead, fileToRead);
                    test.deepEqual(dataRead, dataToRead);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testError: function(test) {
            var message = 'file error';

            fs.readFile = function(file, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            util.readDataFromFile()
                .then(function() {
                    test.ok(false, 'should have thrown file read error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testWriteDataToUrl: {
        testBasic: function(test) {
            var fileToWrite = '/tmp/foo';
            var fileUrl = 'file://' + fileToWrite;
            var dataToWrite = {
                foo: 'bar'
            };

            fs.writeFile = function(file, data, options, cb) {
                fileNameWritten = file;
                dataWritten = data;
                cb(null);
            };

            test.expect(2);
            util.writeDataToUrl(dataToWrite, fileUrl)
                .then(function() {
                    test.strictEqual(fileNameWritten, fileToWrite);
                    test.deepEqual(dataWritten, dataToWrite);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testBadUrl: function(test) {
            var fileUrl = {};

            test.expect(1);
            util.writeDataToUrl('foo', fileUrl)
                .then(function() {
                    test.ok(false, 'should have thrown bad url');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf("must be a string"), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testNonFileUrl: function(test) {
            var fileUrl = 'http://www.example.com';

            test.expect(1);
            util.writeDataToUrl('foo', fileUrl)
                .then(function() {
                    test.ok(false, 'should have thrown bad url');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('Only file URLs'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testWriteError: function(test) {
            var message = 'bad write';
            fs.writeFile = function(file, data, options, cb) {
                cb(new Error(message));
            };

            test.expect(1);
            util.writeDataToUrl('foo', 'file:///tmp/foo')
                .then(function() {
                    test.ok(false, 'should have thrown bad url');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testDownload: {
        setUp: function(callback) {
            dataWritten = false;

            var incomingMessageHandler = {
                pipe: function() {
                    dataWritten = true;
                }
            };

            var fileMock = {
                on: function(event, cb) {
                    cb();
                },

                close: function(cb) {
                    cb();
                }
            };

            fs.createWriteStream = function() {
                return fileMock;
            };

            httpGet = http.get;
            http.get = function(url, cb) {
                cb(incomingMessageHandler);
                return {
                    on: function() {}
                };
            };

            callback();
        },

        tearDown: function(callback) {
            http.get = httpGet;
            callback();
        },

        testBasic: function(test) {
            util.download('http://www.example.com')
                .then(function() {
                    test.ok(dataWritten, 'No data written');
                    test.done();
                });
        },

        testBadProtocol: function(test) {
            test.expect(1);
            util.download('file:///tmp')
                .then(function() {
                    test.ok(false, 'should have thrown bad protocol');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('Unhandled protocol'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testHttpError: function(test) {
            const message = 'http get error';

            httpMock = require('../testUtil/httpMock');
            httpMock.reset();

            require.cache.http = {
                exports: httpMock
            };

            httpMock.setError(message);

            test.expect(1);
            util.download('http://www.example.com/foo')
                .then(function() {
                    test.ok(false, 'should have thrown http error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        },

        testHttpErrorFileWritten: function(test) {
            const message = 'http get error';

            fs.existsSync = function() {
                return true;
            };
            fs.unlink = function() {};
            httpMock = require('../testUtil/httpMock');
            httpMock.reset();

            require.cache.http = {
                exports: httpMock
            };

            httpMock.setError(message);

            test.expect(1);
            util.download('http://www.example.com/foo')
                .then(function() {
                    test.ok(false, 'should have thrown http error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testGetDataFromUrl: {
        testFile: function(test) {
            var password = 'foobar';
            var passwordFile = '/tmp/mypass';

            fs.writeFileSync(passwordFile, password, {encoding: 'ascii'});

            test.expect(1);
            util.getDataFromUrl('file://' + passwordFile)
                .then(function(readPassword) {
                    test.strictEqual(readPassword, password);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    fs.unlinkSync(passwordFile);
                    test.done();
                });
        },

        testHttp: {
            setUp: function(callback) {
                httpMock = require('../testUtil/httpMock');
                httpMock.reset();

                require.cache.http = {
                    exports: httpMock
                };

                callback();
            },

            tearDown: function(callback) {
                delete require.cache.http;
                callback();
            },

            testBasic: function(test) {
                var password = 'foobar';

                httpMock.setResponse(password);

                test.expect(2);
                util.getDataFromUrl('http://www.example.com')
                    .then(function(readPassword) {
                        test.strictEqual(httpMock.lastRequest.path, '/');
                        test.strictEqual(readPassword, password);
                    })
                    .catch(function(err) {
                        test.ok(false, err);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testPathAndHeaders: function(test) {
                var path = '/foo/bar';
                var headers = {headerName: 'headerValue'};

                test.expect(2);
                util.getDataFromUrl('http://www.example.com' + path, {headers: headers})
                    .then(function() {
                        test.strictEqual(httpMock.lastRequest.path, path);
                        test.deepEqual(httpMock.lastRequest.headers, headers);
                    })
                    .catch(function(err) {
                        test.ok(false, err);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testQuery: function(test) {
                var query = '?hello=world&alpha=beta';

                test.expect(1);
                util.getDataFromUrl('http://www.example.com' + query)
                    .then(function() {
                        test.strictEqual(httpMock.lastRequest.path, '/' + query);
                    })
                    .catch(function(err) {
                        test.ok(false, err);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testJson: function(test) {
                var response = {foo: 'bar', hello: 'world'};

                httpMock.setResponse(response, {'content-type': 'application/json'});

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(function(data) {
                        test.deepEqual(data, response);
                    })
                    .catch(function(err) {
                        test.ok(false, err);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testBadJson: function(test) {
                var response = 'foobar';

                httpMock.setResponse(response, {'content-type': 'application/json'});

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(function() {
                        test.ok(false, 'Should have thrown bad json');
                    })
                    .catch(function() {
                        test.ok(true);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testBadStatus: function(test) {
                const status = 400;

                httpMock.setResponse('foo', {}, status);

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(function() {
                        test.ok(false, 'Should have been a bad status');
                    })
                    .catch(function(err) {
                        test.notStrictEqual(err.message.indexOf(400), -1);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testHttpError: function(test) {
                const message = 'http error occurred';
                httpMock.setError(message);

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(function() {
                        test.ok(false, 'Should have thrown an error');
                    })
                    .catch(function(err) {
                        test.strictEqual(err.message, message);
                    })
                    .finally(function() {
                        test.done();
                    });
            },

            testHttpThrow: function(test) {
                const message = 'http get threw';
                httpMock.get = function() {
                    throw new Error(message);
                };

                test.expect(1);
                util.getDataFromUrl('http://www.example.com')
                    .then(function() {
                        test.ok(false, 'Should have thrown an error');
                    })
                    .catch(function(err) {
                        test.strictEqual(err.message, message);
                    })
                    .finally(function() {
                        test.done();
                    });
            }
        },

        testUnsupportedUrl: function(test) {
            test.expect(1);
            util.getDataFromUrl('ftp://www.foo.com')
                .then(function() {
                    test.ok(false, 'Unsupported URL should have failed');
                })
                .catch(function(err) {
                    test.notStrictEqual(err.message.indexOf('URLs are currently supported'), -1);
                })
                .finally(function() {
                    test.done();
                });
        },

        testReadFileError: function(test) {
            const message = 'read file error';
            fs.readFile = function(file, options, cb) {
                cb (new Error(message));
            };

            util.getDataFromUrl('file:///foo/bar')
                .then(function() {
                    test.ok(false, 'should have thrown read file error');
                })
                .catch(function(err) {
                    test.strictEqual(err.message, message);
                })
                .finally(function() {
                    test.done();
                });
    }
    },

    testLogAndExit: function(test) {
        var exit = process.exit;
        var exitCalled;
        var setImmediateTemp = setImmediate;

        setImmediate = function(cb) {cb();};
        process.exit = function() {
            exitCalled = true;
        };

        util.logAndExit();
        test.strictEqual(exitCalled, true);
        test.done();
        process.exit = exit;
        setImmediate = setImmediateTemp;
    },

    testRunInBackgroundAndExit: {
        setUp: function(callback) {
            processExit = process.exit;
            exitCalled = false;
            unrefCalled = false;
            spawnCalled = false;
            process.exit = function() {
                exitCalled = true;
            };

            childProcessSpawn = childProcess.spawn;
            childProcess.spawn = function(name, args) {
                spawnCalled = true;
                calledArgs = args;
                return childMock;
            };

            callback();
        },

        tearDown: function(callback) {
            process.exit = processExit;
            childProcess.spawn = childProcessSpawn;
            callback();
        },

        testBasic: function(test) {
            util.runInBackgroundAndExit(process);
            test.ok(spawnCalled, 'child_process.spawn() was not called');
            test.ok(unrefCalled, 'child.unref() was not called');
            test.ok(exitCalled, 'process.exit() was not called');
            test.done();
        },

        testTooManyArgs: function(test) {
            var processArgv = process.argv;
            var argvMock = [];
            var i;

            for (i = 0; i < 101; ++i) {
                argvMock.push(i);
            }

            process.argv = argvMock;

            util.runInBackgroundAndExit(process);
            test.ifError(spawnCalled);
            test.ok(exitCalled, 'process.exit() was not called');

            process.argv = processArgv;
            test.done();
        },

        testBackgroundRemoved: function(test) {
            var processArgv = process.argv;
            var argvMock = ['node', '--foo', '--background'];

            process.argv = argvMock;

            calledArgs.length = 0;
            util.runInBackgroundAndExit(process, 'myLogFile');
            test.strictEqual(calledArgs.length, 3); // --output myLogFile will be pushed
            test.strictEqual(calledArgs.indexOf('--background'), -1);

            process.argv = processArgv;
            test.done();
        },

        testOutputAdded: function(test) {
            var processArgv = process.argv;
            var argvMock = ['node'];
            var logFile = 'myLogFile';

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
        setUp: function(callback) {
            startupCommands = 'command 1';
            startupScripts = ['script1', 'script2'];

            writtenCommands = undefined;

            fs.existsSync = function() {
                return true;
            };
            fs.readFileSync = function() {
                return startupCommands;
            };
            fs.writeFileSync = function(fileName, commands) {
                writtenCommands = commands;
            };
            fs.readdirSync = function() {
                return startupScripts;
            };
            fs.mkdirSync = function() {};

            bigIpMock.reboot = function() {
                bigIpMock.rebootCalled = true;
                return q();
            };

            callback();
        },

        testBasic: function(test) {
            test.expect(4);
            util.reboot(bigIpMock)
                .then(function() {
                    startupScripts.forEach(function(script) {
                        test.notStrictEqual(writtenCommands.indexOf(script), -1);
                        test.strictEqual(bigIpMock.rebootCalled, true);
                    });
                    test.done();
                });
        },

        testMissingStartupDir: function(test) {
            fs.existsSync = function() {
                return false;
            };

            test.expect(2);
            util.reboot(bigIpMock)
                .then(function() {
                    test.strictEqual(writtenCommands, undefined);
                    test.strictEqual(bigIpMock.rebootCalled, true);
                    test.done();
                });
        },

        testReadFileError: function(test) {
            fs.readFileSync = function() {
                throw new Error();
            };

            test.expect(1);
            util.reboot(bigIpMock)
                .then(function() {
                    test.ok(false, 'fs.readFileSync should have thrown');
                })
                .catch(function() {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });
        },

        testReaddirError: function(test) {
            fs.readdirSync = function() {
                throw new Error();
            };

            test.expect(1);
            util.reboot(bigIpMock)
                .then(function() {
                    test.ok(false, 'fs.readdirSync should have thrown');
                })
                .catch(function() {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });
        },

        testWriteFileSyncError: function(test) {
            fs.writeFileSync = function() {
                throw new Error();
            };

            test.expect(1);
            util.reboot(bigIpMock)
                .then(function() {
                    test.ok(true);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        }
    },

    testSaveArgs: {

        setUp: function(callback) {
            argv = ['node', 'utilTests.js', '--one', '--two', 'abc'];
            callback();
        },

        tearDown: function(callback) {
            var filesToDelete;
            try {
                if (fs.existsSync('/tmp/rebootScripts')) {
                    filesToDelete = fs.readdirSync('/tmp/rebootScripts/');
                    filesToDelete.forEach(function(fileToDelete) {
                        fs.unlinkSync('/tmp/rebootScripts/' + fileToDelete);
                    });
                    fs.rmdirSync('/tmp/rebootScripts');
                }
            }
            catch(err) {
                console.log('Error deleting test directory', err);
            }
            finally {
                callback();
            }
        },

        testBasic: function(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    var savedArgs = getSavedArgs();
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    test.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testStripArgsWithParam: function(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--two'])
                .then(function() {
                    var savedArgs = getSavedArgs();
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                    test.strictEqual(savedArgs.indexOf('abc'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testStripArgsWithoutParam: function(test) {
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE, ['--one'])
                .then(function() {
                    var savedArgs = getSavedArgs();
                    test.strictEqual(savedArgs.indexOf('--one'), -1);
                    test.notStrictEqual(savedArgs.indexOf('--two abc'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testDirCreated: function(test) {
            fs.stat = function(dir, cb) {
                cb({code: 'ENOENT'});
            };

            fs.mkdirSync = function(dirName) {
                createdDir = dirName;
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    test.strictEqual(createdDir, '/tmp/rebootScripts/');
                    test.done();
                });
        },

        testDirCreateError: function(test) {
            fs.stat = function(dir, cb) {
                cb({code: 'FOOBAR'});
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });
        },

        testMkdirRaceCondition: function(test) {
            function eexistError() {
                /*jshint validthis: true */
                this.code = 'EEXIST';
            }
            eexistError.prototype = Error.prototype;

            fs.stat = function(dir, cb) {
                cb({code: 'ENOENT'});
            };

            fs.mkdirSync = function(dirName) {
                fsMkdirSync(dirName);
                throw new eexistError();
            };

            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    var savedArgs = getSavedArgs();
                    test.notStrictEqual(savedArgs.indexOf('--one'), -1);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testMkdirRaceConditionFail: function(test) {
            fs.stat = function(dir, cb) {
                cb({code: 'ENOENT'});
            };

            fs.mkdirSync = function(dirName) {
                fsMkdirSync(dirName);
                throw new Error();
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    test.ok(true);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testStatThrows: function(test) {
            fs.stat = function() {
                throw new Error('fsStat threw');
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    test.ok(true);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    test.done();
                });
        },

        testOpenThrows: function(test) {
            var fsOpen = fs.open;
            fs.open = function() {
                throw new Error('fsOpen threw');
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    test.ok(true);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    fs.open = fsOpen;
                    test.done();
                });
        },

        testWriteSyncThrows: function(test) {
            var fsWriteSync = fs.writeSync;
            fs.writeSync = function() {
                throw new Error('fsWriteSync threw');
            };

            test.expect(1);
            util.saveArgs(argv, UTIL_ARGS_TEST_FILE)
                .then(function() {
                    test.ok(true);
                })
                .catch(function(err) {
                    test.ok(false, err);
                })
                .finally(function() {
                    fs.writeSync = fsWriteSync;
                    test.done();
                });
        }
    },

    testTryUntil: {
        setUp: function(callback) {
            funcCount = 0;
            callback();
        },

        testCalledOnce: function(test) {
            var func = function() {
                var deferred = q.defer();
                funcCount++;
                deferred.resolve();
                return deferred.promise;
            };

            test.expect(1);
            util.tryUntil(this, util.NO_RETRY, func)
                .then(function() {
                    test.strictEqual(funcCount, 1);
                    test.done();
                });
        },

        testCalledMultiple: function(test) {
            var retries = 3;

            var func = function() {
                var deferred = q.defer();

                funcCount++;

                if (funcCount < retries) {
                    deferred.reject();
                }
                else {
                    deferred.resolve();
                }

                return deferred.promise;
            };

            test.expect(1);
            util.tryUntil(this, {maxRetries: retries, retryIntervalMs: 10}, func)
                .then(function() {
                    test.strictEqual(funcCount, retries);
                    test.done();
                });
        },

        testWithThrow: function(test) {
            var retries = 3;

            var func = function() {
                var deferred = q.defer();

                funcCount++;

                if (funcCount === 1) {
                    deferred.reject();
                }
                else if (funcCount > 1 && funcCount < retries) {
                    throw new Error('foo');
                }
                else if (funcCount === retries) {
                    deferred.resolve();
                }

                return deferred.promise;
            };

            test.expect(1);
            util.tryUntil(this, {maxRetries: retries, retryIntervalMs: 10}, func)
                .then(function() {
                    test.strictEqual(funcCount, retries);
                    test.done();
                });
        },

        testNotResolved: function(test) {
            var func = function() {
                var deferred = q.defer();
                deferred.reject();
                return deferred.promise;
            };

            test.expect(1);
            util.tryUntil(this, {maxRetries: 2, retryIntervalMs: 10}, func)
                .then(function() {
                    test.ok(false, 'func should never have resolved');
                })
                .catch(function() {
                    test.ok(true);
                })
                .finally(function() {
                    test.done();
                });
            }
    },

    testVersionCompare: function(test) {
        test.strictEqual(util.versionCompare("1.7.1", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.7.10", "1.7.1"), 1);
        test.strictEqual(util.versionCompare("1.7.2", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.6.1", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.6.20", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.7.1", "1.7.10"), -1);
        test.strictEqual(util.versionCompare("1.7", "1.7.0"), -1);
        test.strictEqual(util.versionCompare("1.7", "1.8.0"), -1);
        test.strictEqual(util.versionCompare("1.7.2", "1.7.10b"), -1);

        test.strictEqual(util.versionCompare("1.7.10", "1.7.1"), 1);
        test.strictEqual(util.versionCompare("1.7.10", "1.6.1"), 1);
        test.strictEqual(util.versionCompare("1.7.10", "1.6.20"), 1);
        test.strictEqual(util.versionCompare("1.7.0", "1.7"), 1);
        test.strictEqual(util.versionCompare("1.8.0", "1.7"), 1);

        test.strictEqual(util.versionCompare("1.7.10", "1.7.10"), 0);
        test.strictEqual(util.versionCompare("1.7", "1.7"), 0);
        test.strictEqual(util.versionCompare("1.7", "1.7.0", {zeroExtend: true}), 0);

        test.strictEqual(util.versionCompare("1.3-dev1", "1.3-dev1"), 0);
        test.strictEqual(util.versionCompare("1.3-dev1", "1.3-dev2"), -1);
        test.strictEqual(util.versionCompare("1.3-dev2", "1.3-dev1"), 1);
        test.strictEqual(util.versionCompare("1.3-dev19", "1.3-dev2"), 1);

        test.strictEqual(util.versionCompare("12.0.0-hf1", "12.0.0-hf2"), -1);
        test.strictEqual(util.versionCompare("12.0.1-hf1", "12.0.0-hf3"), 1);
        test.strictEqual(util.versionCompare("12.1.0", "12.0.0-hf1"), 1);

        test.strictEqual(util.versionCompare("12.0.0-a1", "12.0.0-b1"), -1);
        test.strictEqual(util.versionCompare("12.0.1-b1", "12.0.0-a1"), 1);

        test.strictEqual(util.versionCompare("12.0.0-b1", "12.0.0-a1"), 1);

        test.strictEqual(util.versionCompare("12.0.0-1", "12.0.0-a1"), 1);
        test.strictEqual(util.versionCompare("12.0.0-a1", "12.0.0-1"), -1);

        test.done();
    }
};
