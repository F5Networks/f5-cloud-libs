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
            assert.deepStrictEqual(options, targetOptions);
            return q(urlResponse);
        };
    }

    beforeEach(() => {
        testProvider = new GenericNodeProvider();
    });

    afterEach(() => {
        utilMock.getDataFromUrl = origGetDataFromUrl;
    });

    it('logger test', () => {
        const logger = {
            a: 1,
            b: 2
        };
        testProvider = new GenericNodeProvider({ logger });
        assert.deepStrictEqual(testProvider.logger, logger);
    });

    describe('init test', () => {
        it('missing provider options test', () => {
            return testProvider.init()
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
                });
        });

        it('init success test', () => {
            return testProvider.init(providerOptions, initOptions)
                .then(() => {
                    assert.ok(true);
                });
        });

        it('provider options test', () => {
            return testProvider.init(providerOptions)
                .then(() => {
                    assert.deepStrictEqual(testProvider.providerOptions, providerOptions);
                    assert.deepStrictEqual(testProvider.propertyPaths, {
                        propertyPathId: ['node', 'uuid'],
                        propertyPathIpPrivate: ['node', 'ips', '0'],
                        propertyPathIpPublic: ['node', 'ips', '1']
                    });
                });
        });

        it('property path no ip test', () => {
            const optsNoPublic = JSON.parse(JSON.stringify(providerOptions));
            delete optsNoPublic.propertyPathIpPublic;
            return testProvider.init(optsNoPublic)
                .then(() => {
                    assert.deepStrictEqual(testProvider.providerOptions, optsNoPublic);
                    assert.deepStrictEqual(testProvider.propertyPaths, {
                        propertyPathId: ['node', 'uuid'],
                        propertyPathIpPrivate: ['node', 'ips', '0'],
                        propertyPathIpPublic: []
                    });
                });
        });

        it('init option test', () => {
            return testProvider.init(providerOptions, initOptions)
                .then(() => {
                    assert.deepStrictEqual(testProvider.initOptions, initOptions);
                });
        });
    });

    describe('get nodes from uri test', () => {
        it('bad json string response test', () => {
            mockGetDataFromUrl('foo');

            return testProvider.getNodesFromUri(targetUrl, targetOptions)
                .then(() => {
                    assert.ok(false, 'should have thrown bad response data');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Data must parse to a JSON array'), -1);
                });
        });

        it('bad json array response test', () => {
            mockGetDataFromUrl({});

            return testProvider.getNodesFromUri(targetUrl, targetOptions)
                .then(() => {
                    assert.ok(false, 'should have thrown bad response data');
                })
                .catch((err) => {
                    assert.notStrictEqual(err.message.indexOf('Data must be a JSON array'), -1);
                });
        });

        it('no nodes test', () => {
            mockGetDataFromUrl(JSON.stringify([{ foo: 'bar' }]));

            return testProvider.init(providerOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions);
                })
                .then((results) => {
                    assert.deepStrictEqual(results, []);
                });
        });

        it('json string nodes test', () => {
            mockGetDataFromUrl(JSON.stringify(responseNodeData));

            return testProvider.init(providerOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions);
                })
                .then((results) => {
                    assert.deepStrictEqual(results, [
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
        });

        it('json array nodes test', () => {
            mockGetDataFromUrl(responseNodeData);

            return testProvider.init(providerOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions);
                })
                .then((results) => {
                    assert.deepStrictEqual(results, [
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
        });

        it('JMES Path json array nodes test', () => {
            mockGetDataFromUrl(responseNodeData);

            return testProvider.init(providerJmesPathOptions)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions);
                })
                .then((results) => {
                    assert.deepStrictEqual(results, [
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
        });

        it('Bad JMES Path json array nodes test', () => {
            mockGetDataFromUrl(responseNodeData);
            return testProvider.init(providerJmesPathOptions2)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions);
                })
                .then((results) => {
                    assert.deepStrictEqual(results, []);
                });
        });

        it('JMES Path json array nodes test 2', () => {
            mockGetDataFromUrl(responseNodeData2);

            return testProvider.init(providerJmesPathOptions2)
                .then(() => {
                    return testProvider.getNodesFromUri(targetUrl, targetOptions);
                })
                .then((results) => {
                    assert.deepStrictEqual(results, [
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
        });

        it('top level json test', () => {
            mockGetDataFromUrl(responseNodeData);

            const provOptsCopy = Object.assign(providerOptions, { propertyPathId: '' });
            return testProvider.init(provOptsCopy)
                .then(() => {
                    return testProvider.getNodesFromUri('https://example.com', targetOptions);
                })
                .then((results) => {
                    assert.deepStrictEqual(results, [
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
        });
    });
});
