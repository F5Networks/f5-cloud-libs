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

const q = require('q');
const options = require('commander');
const BigIp = require('../lib/bigIp');
const Logger = require('../lib/logger');
const ipc = require('../lib/ipc');
const signals = require('../lib/signals');
const util = require('../lib/util');

(function run() {
    const runner = {

        /**
         * Runs the network setup script
         *
         * @param {String[]} argv - The process arguments
         * @param {Object}   testOpts - Options used during testing
         * @param {Object}   testOpts.bigIp - BigIp object to use for testing
         * @param {Function} cb - Optional cb to call when done
         */
        run(argv, testOpts, cb) {
            const DEFAULT_LOG_FILE = '/tmp/network.log';
            const ARGS_FILE_ID = `network_${Date.now()}`;
            const KEYS_TO_MASK = ['-p', '--password', '--set-password', '--set-root-password'];
            const REQUIRED_OPTIONS = ['host', 'user'];
            const DEFAULT_CIDR = '/24';

            const optionsForTest = {};
            const vlans = [];
            const selfIps = [];
            const routes = [];
            const loggerOptions = {};

            let loggableArgs;
            let logger;
            let logFileName;
            let bigIp;

            Object.assign(optionsForTest, testOpts);


            try {
                /* eslint-disable max-len */

                // Can't use getCommonOptions here because of the special reboot handling
                options
                    .version('4.0.1')
                    .option(
                        '--host <ip_address>',
                        'BIG-IP management IP to which to send commands.'
                    )
                    .option(
                        '-u, --user <user>',
                        'BIG-IP admin user name.'
                    )
                    .option(
                        '-p, --password <password>',
                        'BIG-IP admin user password. Use this or --password-url'
                    )
                    .option(
                        '--password-url <password_url>',
                        'URL (file, http(s)) to location that contains BIG-IP admin user password. Use this or --password'
                    )
                    .option(
                        '--password-encrypted',
                        'Indicates that the password is encrypted (either with encryptDataToFile or generatePassword)'
                    )
                    .option(
                        '--port <port>',
                        'BIG-IP management SSL port to connect to. Default 443.',
                        parseInt
                    )
                    .option(
                        '--no-reboot',
                        'Skip reboot even if it is recommended.'
                    )
                    .option(
                        '--background',
                        'Spawn a background process to do the work. If you are running in cloud init, you probably want this option.'
                    )
                    .option(
                        '--signal <signal>',
                        'Signal to send when done. Default ONBOARD_DONE.'
                    )
                    .option(
                        '--wait-for <signal>',
                        'Wait for the named signal before running.'
                    )
                    .option(
                        '--log-level <level>',
                        'Log level (none, error, warn, info, verbose, debug, silly). Default is info.', 'info'
                    )
                    .option(
                        '-o, --output <file>',
                        `Log to file as well as console. This is the default if background process is spawned. Default is ${DEFAULT_LOG_FILE}`
                    )
                    .option(
                        '--no-console',
                        'Do not log to console. Default false (log to console).'
                    )
                    .option(
                        '--single-nic',
                        'Set db variables for single NIC configuration.'
                    )
                    .option(
                        '--multi-nic',
                        'Set db variables for multi NIC configuration.'
                    )
                    .option(
                        '--default-gw <gateway_address>',
                        'Set default gateway to gateway_address.'
                    )
                    .option(
                        '--route <name:name, gw:address, network:network>',
                        'Create arbitrary route with name for destination network via gateway address.',
                        util.mapArray,
                        routes
                    )
                    .option(
                        '--local-only',
                        'Create LOCAL_ONLY partition for gateway and assign to traffic-group-local-only.'
                    )
                    .option(
                        '--vlan <name:name, nic:nic, [mtu:mtu], [tag:tag]>',
                        'Create vlan with name on nic (for example, 1.1). Optionally specify mtu and tag. For multiple vlans, use multiple --vlan entries.',
                        util.mapArray,
                        vlans
                    )
                    .option(
                        '--self-ip <name:name, address:ip_address, vlan:vlan_name, [allow:service1:port1 service2:port2]>',
                        'Create self IP with name and ip_address on vlan with optional port lockdown. For multiple self IPs, use multiple --self-ip entries. Default CIDR prefix is 24 if not specified.',
                        util.mapArray,
                        selfIps
                    )
                    .option(
                        '--force-reboot',
                        'Force a reboot at the end. This is necessary for some 2+ NIC configurations.'
                    )
                    .parse(argv);
                /* eslint-enable max-len */

                loggerOptions.console = options.console;
                loggerOptions.logLevel = options.logLevel;
                loggerOptions.module = module;

                if (options.output) {
                    loggerOptions.fileName = options.output;
                }

                logger = Logger.getLogger(loggerOptions);
                ipc.setLoggerOptions(loggerOptions);
                util.setLoggerOptions(loggerOptions);

                for (let i = 0; i < REQUIRED_OPTIONS.length; i++) {
                    if (!options[REQUIRED_OPTIONS[i]]) {
                        util.logAndExit(
                            `${REQUIRED_OPTIONS[i]} is a required command line option.`,
                            'error',
                            1
                        );
                    }
                }

                if (!options.password && !options.passwordUrl) {
                    util.logAndExit('One of --password or --password-url is required.', 'error', 1);
                }

                // When running in cloud init, we need to exit so that cloud init can complete and
                // allow the BIG-IP services to start
                if (options.background) {
                    logFileName = options.output || DEFAULT_LOG_FILE;
                    logger.info('Spawning child process to do the work. Output will be in', logFileName);
                    util.runInBackgroundAndExit(process, logFileName);
                }

                // Log the input, but don't log passwords
                loggableArgs = argv.slice();
                for (let i = 0; i < loggableArgs.length; i++) {
                    if (KEYS_TO_MASK.indexOf(loggableArgs[i]) !== -1) {
                        loggableArgs[i + 1] = '*******';
                    }
                }
                logger.info(`${loggableArgs[1]} called with`, loggableArgs.join(' '));

                if (options.singleNic && options.multiNic) {
                    util.logAndExit('Only one of single-nic or multi-nic can be specified.', 'error', 1);
                }

                // Save args in restart script in case we need to reboot to recover from an error
                util.saveArgs(argv, ARGS_FILE_ID)
                    .then(() => {
                        if (options.waitFor) {
                            logger.info('Waiting for', options.waitFor);
                            return ipc.once(options.waitFor);
                        }
                        return q();
                    })
                    .then(() => {
                        // Whatever we're waiting for is done, so don't wait for
                        // that again in case of a reboot
                        return util.saveArgs(argv, ARGS_FILE_ID, ['--wait-for']);
                    })
                    .then(() => {
                        logger.info('Network setup starting.');
                        ipc.send(signals.NETWORK_RUNNING);

                        // Create the bigIp client object
                        if (optionsForTest.bigIp) {
                            logger.warn('Using test BIG-IP.');
                            bigIp = optionsForTest.bigIp;
                            return q();
                        }

                        bigIp = new BigIp({ logger });

                        logger.info('Initializing BIG-IP.');
                        return bigIp.init(
                            options.host,
                            options.user,
                            options.password || options.passwordUrl,
                            {
                                port: options.port,
                                passwordIsUrl: typeof options.passwordUrl !== 'undefined',
                                passwordEncrypted: options.passwordEncrypted
                            }
                        );
                    })
                    .then(() => {
                        logger.info('Waiting for BIG-IP to be ready.');
                        return bigIp.ready();
                    })
                    .then(() => {
                        logger.info('BIG-IP is ready.');

                        if (options.singleNic || options.multiNic) {
                            logger.info('Setting single/multi NIC options.');
                            return bigIp.modify(
                                '/tm/sys/db/provision.1nic',
                                {
                                    value: options.singleNic ? 'enable' : 'forced_enable'
                                }
                            )
                                .then((response) => {
                                    logger.debug(response);

                                    return bigIp.modify(
                                        '/tm/sys/db/provision.1nicautoconfig',
                                        {
                                            value: 'disable'
                                        }
                                    );
                                })
                                .then((response) => {
                                    logger.debug(response);

                                    logger.info('Restarting services.');
                                    return bigIp.create(
                                        '/tm/util/bash',
                                        {
                                            command: 'run',
                                            utilCmdArgs: "-c 'bigstart restart'"
                                        },
                                        {
                                            noWait: true
                                        }
                                    );
                                })
                                .then((response) => {
                                    logger.debug(response);

                                    logger.info('Waiting for BIG-IP to be ready after bigstart restart.');
                                    return bigIp.ready();
                                });
                        }

                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        const promises = [];
                        let vlanBody;

                        if (vlans.length > 0) {
                            vlans.forEach((vlan) => {
                                if (!vlan.name || !vlan.nic) {
                                    q.reject(new Error('Invalid vlan parameters. name and nic are required'));
                                } else {
                                    vlanBody = {
                                        name: vlan.name,
                                        interfaces: [
                                            {
                                                name: vlan.nic,
                                                tagged: !!vlan.tag
                                            }
                                        ]
                                    };

                                    if (vlan.mtu) {
                                        vlanBody.mtu = vlan.mtu;
                                    }

                                    if (vlan.tag) {
                                        vlanBody.tag = vlan.tag;
                                    }

                                    promises.push(
                                        {
                                            promise: bigIp.create,
                                            arguments: [
                                                '/tm/net/vlan',
                                                vlanBody
                                            ],
                                            // eslint-disable-next-line max-len
                                            message: `Creating vlan ${vlan.name} on interface ${vlan.nic} ${(vlan.mtu ? ` mtu ${vlan.mtu}` : '')} ${(vlan.tag ? ` with tag ${vlan.tag}` : ' untagged')}`
                                        }
                                    );
                                }
                            });

                            return util.callInSerial(bigIp, promises);
                        }

                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        const promises = [];
                        let selfIpBody;
                        let portLockdown;

                        for (let i = 0; i < selfIps.length; i++) {
                            const selfIp = selfIps[i];

                            if (!selfIp.name || !selfIp.address || !selfIp.vlan) {
                                const message = 'Bad self-ip params. name, address, vlan are required';
                                return q.reject(new Error(message));
                            }

                            let address = selfIp.address;

                            if (address.indexOf('/') === -1) {
                                address += DEFAULT_CIDR;
                            }

                            // general terms (default, all, none) have to be single words
                            // per port terms go in an array
                            portLockdown = 'default';
                            if (selfIp.allow) {
                                portLockdown = selfIp.allow.split(/\s+/);
                                if (
                                    portLockdown.length === 1 &&
                                    portLockdown[0].indexOf(':') === -1
                                ) {
                                    portLockdown = portLockdown[0];
                                }
                            }

                            selfIpBody = {
                                address,
                                name: selfIp.name,
                                vlan: `/Common/${selfIp.vlan}`,
                                allowService: portLockdown
                            };

                            promises.push(
                                {
                                    promise: bigIp.create,
                                    arguments: [
                                        '/tm/net/self',
                                        selfIpBody
                                    ],
                                    // eslint-disable-next-line max-len
                                    message: `Creating self IP ${selfIp.name} with address ${address} on vlan ${selfIp.vlan} allowing ${(selfIp.allow ? selfIp.allow : 'default')}`
                                }
                            );
                        }

                        return promises.length > 0 ? util.callInSerial(bigIp, promises) : q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        if (options.localOnly) {
                            logger.info('Creating LOCAL_ONLY partition.');
                            return bigIp.create(
                                '/tm/sys/folder',
                                {
                                    name: 'LOCAL_ONLY',
                                    partition: '/',
                                    deviceGroup: 'none',
                                    trafficGroup: 'traffic-group-local-only'
                                }
                            );
                        }

                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        let routeBody;

                        if (options.defaultGw) {
                            logger.info(`Setting default gateway ${options.defaultGw}`);

                            routeBody = {
                                name: 'default',
                                gw: options.defaultGw
                            };

                            if (options.localOnly) {
                                routeBody.partition = 'LOCAL_ONLY';
                                routeBody.network = 'default';
                            }

                            return bigIp.create(
                                '/tm/net/route',
                                routeBody
                            );
                        }

                        return q();
                    })
                    .then((response) => {
                        logger.debug(response);

                        const promises = [];
                        let routeBody;

                        for (let i = 0; i < routes.length; i++) {
                            const route = routes[i];
                            if (!route.name || !route.gw || !route.network) {
                                const message = 'Bad route params. Name, gateway, network required';
                                return q.reject(new Error(message));
                            }

                            let network = route.network;
                            if (network.indexOf('/') === -1) {
                                network += DEFAULT_CIDR;
                            }

                            routeBody = {
                                network,
                                name: route.name,
                                gw: route.gw
                            };

                            promises.push(
                                {
                                    promise: bigIp.create,
                                    arguments: [
                                        '/tm/net/route',
                                        routeBody
                                    ],
                                    message: `Creating route ${route.name} with gateway ${route.gw}`
                                }
                            );
                        }

                        return promises.length > 0 ? util.callInSerial(bigIp, promises) : q();
                    })
                    .then((response) => {
                        logger.debug(response);
                        logger.info('Saving config.');
                        return bigIp.save();
                    })
                    .then((response) => {
                        logger.debug(response);

                        if (options.forceReboot) {
                            // After reboot, we just want to send our done signal,
                            // in case any other scripts are waiting on us. So, modify
                            // the saved args for that.
                            const ARGS_TO_STRIP = [
                                '--wait-for',
                                '--single-nic',
                                '--multi-nic',
                                '--default-gw',
                                '--local-only',
                                '--vlan',
                                '--self-ip',
                                '--force-reboot'];
                            return util.saveArgs(argv, ARGS_FILE_ID, ARGS_TO_STRIP)
                                .then(() => {
                                    logger.info('Rebooting and exiting. Will continue after reboot.');
                                    return util.reboot(bigIp);
                                });
                        }

                        return q();
                    })
                    .catch((err) => {
                        let message;

                        if (!err) {
                            message = 'unknown reason';
                        } else {
                            message = err.message;
                        }

                        util.logAndExit(`Network setup failed: ${message}`, 'error', 1);
                        return q();
                    })
                    .done((response) => {
                        logger.debug(response);

                        if (!options.forceReboot) {
                            util.deleteArgs(ARGS_FILE_ID);

                            logger.info('BIG-IP network setup complete.');
                            ipc.send(options.signal || signals.NETWORK_DONE);

                            if (cb) {
                                cb();
                            }

                            util.logAndExit('Network setup finished.');
                        } else if (cb) {
                            cb();
                        }
                    });

                // If we reboot, exit - otherwise cloud providers won't know we're done.
                // But, if we're the one doing the reboot, we'll exit on our own through
                // the normal path.
                if (!options.forceReboot) {
                    ipc.once('REBOOT')
                        .then(() => {
                            // Make sure the last log message is flushed before exiting.
                            util.logAndExit('REBOOT signaled. Exiting.');
                        });
                }
            } catch (err) {
                if (logger) {
                    logger.error('Network setup error:', err);
                }

                if (cb) {
                    cb();
                }
            }
        }
    };

    module.exports = runner;

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
}());
