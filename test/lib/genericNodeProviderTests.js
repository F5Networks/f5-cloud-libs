/**
 * Copyright 2018 F5 Networks, Inc.
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

const assert = require('assert');

describe('generic Node Provider tests', () => {
    /* eslint-disable global-require */
    const GenericNodeProvider = require('../../lib/genericNodeProvider');
    const utilMock = require('../../lib/util');
    const q = require('q');

    const origGetDataFromUrl = utilMock.getDataFromUrl;

    const propertyPaths = {
        propertyPathId: 'node.uuid',
        propertyPathIpPrivate: 'node.ips.0',
        propertyPathIpPublic: 'node.ips.1'
    };

    let providerOptions = {
        foo: 'bar',
    };
    providerOptions = Object.assign(providerOptions, propertyPaths);

    const providerJmesPathOptions = {
        jmesPathQuery: '[*].{id:node.uuid,ip:{private:node.ips[0],public:node.ips[1]}}'
    };

    const providerJmesPathOptions2 = {
        jmesPathQuery: '[*].{id:ID||Node,ip:{private:Node,public:Node},port:ServicePort}'
    };

    const initOptions = {
        bar: 'foo',
        world: 'hello'
    };

    const responseNodeData = [
        {
            foo: 'bar',
            node: {
                uuid: 'b10b5485-d6f1-47c2-9153-831dda8e1467',
                ips: [
                    '192.168.0.140',
                    '10.10.0.10'
                ]
            }
        },
        {
            hello: 'world',
            node: {
                uuid: '4cd3e814-09b1-4ea6-88f5-9524d45c1eda',
                ips: [
                    '192.168.0.141',
                    '11.11.0.11'
                ]
            }
        }

    ];

    const responseNodeData2 = [
        {
            ID: '',
            Node: '192.168.128.1',
            Address: '192.168.128.1',
            Datacenter: 'dc1',
            TaggedAddresses: null,
            NodeMeta: {
                'external-node': 'true',
                'external-probe': 'false'
            },
            ServiceKind: '',
            ServiceID: 'dc1-Production-app001-1',
            ServiceName: 'app001',
            ServiceTags: [
                'as3',
                'Production'
            ],
            ServiceAddress: '',
            ServiceWeights: {
                Passing: 1,
                Warning: 1
            },
            ServiceMeta: {},
            ServicePort: 443,
            ServiceEnableTagOverride: false,
            ServiceProxy: {
                MeshGateway: {}
            },
            ServiceConnect: {},
            CreateIndex: 360503,
            ModifyIndex: 360503
        },
        {
            ID: '',
            Node: '192.168.128.2',
            Address: '192.168.128.2',
            Datacenter: 'dc1',
            TaggedAddresses: null,
            NodeMeta: {
                'external-node': 'true',
                'external-probe': 'false'
            },
            ServiceKind: '',
            ServiceID: 'dc1-Production-app001-2',
            ServiceName: 'app001',
            ServiceTags: [
                'as3',
                'Production'
            ],
            ServiceAddress: '',
            ServiceWeights: {
                Passing: 1,
                Warning: 1
            },
            ServiceMeta: {},
            ServicePort: 443,
            ServiceEnableTagOverride: false,
            ServiceProxy: {
                MeshGateway: {}
            },
            ServiceConnect: {},
            CreateIndex: 360503,
            ModifyIndex: 360503
        },
        {
            ID: '',
            Node: '192.168.128.3',
            Address: '192.168.128.3',
            Datacenter: 'dc1',
            TaggedAddresses: null,
            NodeMeta: {
                'external-node': 'true',
                'external-probe': 'false'
            },
            ServiceKind: '',
            ServiceID: 'dc1-Production-app001-3',
            ServiceName: 'app001',
            ServiceTags: [
                'as3',
                'Production'
            ],
            ServiceAddress: '',
            ServiceWeights: {
                Passing: 1,
                Warning: 1
            },
            ServiceMeta: {},
            ServicePort: 443,
            ServiceEnableTagOverride: false,
            ServiceProxy: {
                MeshGateway: {}
            },
            ServiceConnect: {},
            CreateIndex: 360503,
            ModifyIndex: 360503
        }
    ];

    const targetUrl = 'https://example.com';
    const targetOptions = {
        headers: { headerName: 'headerValue' },
        rejectUnauthorized: false
    };

    let testProvider;

    // Our tests cause too many event listeners. Turn off the check.
    process.setMaxListeners(0);

    function mockGetDataFromUrl(urlResponse) {
        utilMock.getDataFromUrl = function getDataFromUrl(url, options) {
            assert.strictEqual(url, targetUrl);
            assert.deepEqual(options, targetOptions);
            return q(urlResponse);
        };
    }

    beforeEach(() => {
        testProvider = new GenericNodeProvider();
    });

    afterEach(() => {
        utilMock.getDataFromUrl = origGetDataFromUrl;
    });

    it('logger test', (done) => {
        const logger = {
            a: 1,
            b: 2
        };
        testProvider = new GenericNodeProvider({ logger });
        assert.deepEqual(testProvider.logger, logger);
        done();
    });

    describe('init test', () => {
        it('missing provider options test', (done) => {
            testProvider.init()
                .then(() => {
                    assert.ok(false, 'should have thrown missing required provider options');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('ProviderOptions.propertyPathId required'), -1);
                })
                .then(() => {
                    return testProvider.init({ propertyPathId: 'foo' });
                })
                .then(() => {
                    assert.ok(false, 'should have thrown missing required provider options');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('ProviderOptions.propertyPathIpPrivate '
                        + 'required'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('init success test', (done) => {
            testProvider.init(providerOptions, initOptions)
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

        it('provider options test', (done) => {
            testProvider.init(providerOptions)
                .then(() => {
                    assert.deepEqual(testProvider.providerOptions, providerOptions);
                    assert.deepEqual(testProvider.propertyPaths, {
                        propertyPathId: ['node', 'uuid'],
                        propertyPathIpPrivate: ['node', 'ips', '0'],
                        propertyPathIpPublic: ['node', 'ips', '1']
                    });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('property path no ip test', (done) => {
            const optsNoPublic = JSON.parse(JSON.stringify(providerOptions));
            delete optsNoPublic.propertyPathIpPublic;
            testProvider.init(optsNoPublic)
                .then(() => {
                    assert.deepEqual(testProvider.providerOptions, optsNoPublic);
                    assert.deepEqual(testProvider.propertyPaths, {
                        propertyPathId: ['node', 'uuid'],
                        propertyPathIpPrivate: ['node', 'ips', '0'],
                        propertyPathIpPublic: []
                    });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('init option test', (done) => {
            testProvider.init(providerOptions, initOptions)
                .then(() => {
                    assert.deepEqual(testProvider.initOptions, initOptions);
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });
    });

    describe('get nodes from uri test', () => {
        it('bad json string response test', (done) => {
            mockGetDataFromUrl('foo');

            testProvider.getNodesFromUri(targetUrl, targetOptions)
                .then(() => {
                    assert.ok(false, 'should have thrown bad response data');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Data must parse to a JSON array'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('bad json array response test', (done) => {
            mockGetDataFromUrl({});

            testProvider.getNodesFromUri(targetUrl, targetOptions)
                .then(() => {
                    assert.ok(false, 'should have thrown bad response data');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Data must be a JSON array'), -1);
                })
                .finally(() => {
                    done();
                });
        });

        it('no nodes test', (done) => {
            mockGetDataFromUrl(JSON.stringify([{ foo: 'bar' }]));

            testProvider.init(providerOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions)
                        .then((results) => {
                            assert.deepEqual(results, []);
                        });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('json string nodes test', (done) => {
            mockGetDataFromUrl(JSON.stringify(responseNodeData));

            testProvider.init(providerOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions)
                        .then((results) => {
                            assert.deepEqual(results, [
                                {
                                    id: 'b10b5485-d6f1-47c2-9153-831dda8e1467',
                                    ip: {
                                        public: '10.10.0.10',
                                        private: '192.168.0.140'
                                    }
                                },
                                {
                                    id: '4cd3e814-09b1-4ea6-88f5-9524d45c1eda',
                                    ip: {
                                        public: '11.11.0.11',
                                        private: '192.168.0.141'
                                    }
                                }
                            ]);
                        });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('json array nodes test', (done) => {
            mockGetDataFromUrl(responseNodeData);

            testProvider.init(providerOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions)
                        .then((results) => {
                            assert.deepEqual(results, [
                                {
                                    id: 'b10b5485-d6f1-47c2-9153-831dda8e1467',
                                    ip: {
                                        public: '10.10.0.10X',
                                        private: '192.168.0.140'
                                    }
                                },
                                {
                                    id: '4cd3e814-09b1-4ea6-88f5-9524d45c1eda',
                                    ip: {
                                        public: '11.11.0.11',
                                        private: '192.168.0.141'
                                    }
                                }
                            ]);
                        });
                })
                .catch((err) => {
                    assert.ok(false, err);
                })
                .finally(() => {
                    done();
                });
        });

        it('JMES Path json array nodes test', () => {
            mockGetDataFromUrl(responseNodeData);

            return testProvider.init(providerJmesPathOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions)
                        .then((results) => {
                            assert.deepEqual(results, [
                                {
                                    id: 'b10b5485-d6f1-47c2-9153-831dda8e1467',
                                    ip: {
                                        public: '10.10.0.10',
                                        private: '192.168.0.140'
                                    }
                                },
                                {
                                    id: '4cd3e814-09b1-4ea6-88f5-9524d45c1eda',
                                    ip: {
                                        public: '11.11.0.11',
                                        private: '192.168.0.141'
                                    }
                                }
                            ]);
                        });
                })
                .catch((err) => {
                    assert.ok(false, err);
                });
        });

        it('Bad JMES Path json array nodes test', () => {
            mockGetDataFromUrl(responseNodeData);
            return testProvider.init(providerJmesPathOptions2)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions);
                })
                .then((results) => {
                    assert.deepEqual(results, [
                    ]);
                })
                .catch((err) => {
                    assert.ok(false, err);
                });
        });

        it('JMES Path json array nodes test 2', () => {
            mockGetDataFromUrl(responseNodeData2);

            return testProvider.init(providerJmesPathOptions2)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions)
                        .then((results) => {
                            assert.deepEqual(results, [
                                {
                                    id: '192.168.128.1',
                                    ip: { private: '192.168.128.1', public: '192.168.128.1' },
                                    port: 443
                                },
                                {
                                    id: '192.168.128.2',
                                    ip: { private: '192.168.128.2', public: '192.168.128.2' },
                                    port: 443
                                },
                                {
                                    id: '192.168.128.3',
                                    ip: { private: '192.168.128.3', public: '192.168.128.3' },
                                    port: 443
                                }
                            ]);
                        });
                })
                .catch((err) => {
                    assert.ok(false, err);
                });
        });

        it('top level json test', (done) => {
            mockGetDataFromUrl(responseNodeData);

            const provOptsCopy = Object.assign(providerOptions, { propertyPathId: '' });
            testProvider.init(provOptsCopy)
                .then(() => {
                    return testProvider.getNodesFromUri('https://example.com', targetOptions)
                        .then((results) => {
                            assert.deepEqual(results, [
                                {
                                    id: {
                                        foo: 'bar',
                                        node: {
                                            uuid: 'b10b5485-d6f1-47c2-9153-831dda8e1467',
                                            ips: [
                                                '192.168.0.140',
                                                '10.10.0.10'
                                            ]
                                        }
                                    },
                                    ip: {
                                        public: '10.10.0.10',
                                        private: '192.168.0.140'
                                    }
                                },
                                {
                                    id: {
                                        hello: 'world',
                                        node: {
                                            uuid: '4cd3e814-09b1-4ea6-88f5-9524d45c1eda',
                                            ips: [
                                                '192.168.0.141',
                                                '11.11.0.11'
                                            ]
                                        }
                                    },
                                    ip: {
                                        public: '11.11.0.11',
                                        private: '192.168.0.141'
                                    }
                                }
                            ]);
                        });
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
