/**
 * Copyright 2016 F5 Networks, Inc.
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

(function() {

    var runner;
    var logger;

    module.exports = runner = {

        /**
         * Runs the autoscale script
         *
         * Provider is passed in only for testing. In production, provider will be instantiated
         * based on the --cloud option
         *
         * @param {String[]} argv                - The process arguments.
         * @param {Ojbect}   [testOpts]          - Options used during testing
         * @param {Object}   [testOpts.provider] - Mock for provider.
         * @param {Object}   [testOpts.bigIp]    - Mock for BigIp.
         * @param {Function} [cb]                - Optional cb to call when done
         */
        run: function(argv, testOpts, cb) {

            var DEFAULT_LOG_FILE = "/tmp/autoscale.log";
            var options = require('commander');
            var q = require('q');
            var BigIp = require('../lib/bigIp');
            var Logger = require('../lib/logger');
            var loggerOptions = {};
            var masterIid;
            var Provider;
            var provider;

            testOpts = testOpts || {};

            options.logLevel = 'info';
            options
                .option('--cloud <provider>', 'Cloud provider (aws | azure | etc.)')
                .option('-c, --cluster-action <type>', 'join (join a cluster) | update (update cluster to match existing instances')
                .option('--device-group <device_group>', 'Device group name.')
                .option('-o, --output <file>', 'Log to file as well as console. This is the default if background process is spawned. Default is ' + DEFAULT_LOG_FILE)
                .option('--log-level <level>', 'Log level (none, error, warn, info, verbose, debug, silly). Default is info.')
                .parse(argv);

            loggerOptions.console = true;
            loggerOptions.logLevel = options.logLevel;

            if (options.output) {
                loggerOptions.fileName = options.output;
            }

            logger = Logger.getLogger(loggerOptions);

            logger.info(argv[1] + " called with", argv.join(' '));

            provider = testOpts.provider;
            if (!provider) {
                Provider = require('f5-cloud-libs-' + options.cloud).provider;
                provider = new Provider({logger: logger});
            }

            provider.init()
                .then(function() {
                    logger.info('Getting info on all instances.');
                    return provider.getInstances();
                })
                .then(function (response) {
                    var instanceIds;

                    this.instances = response || {};
                    logger.debug('instances:', this.instances);

                    instanceIds = Object.keys(this.instances);
                    if (instanceIds.length === 0) {
                        throw new Error('Instance list is empty. Exitting.');
                    }
                    else if (instanceIds.indexOf(provider.getInstanceId()) === -1) {
                        throw new Error('Our instance ID is not in instance list. Exitting');
                    }

                    logger.info('Determining master instance id.');
                    masterIid = getMasterInstanceId(this.instances);

                    if (masterIid) {
                        logger.info('Possible master ID:'. masterIid);
                        return provider.isValidMaster(masterIid);
                    }
                    else {
                        logger.info("No master ID found.");
                    }
                }.bind(this))
                .then(function(response) {

                    if (response) {
                        // true response means we have a valid masterIid, just pass it on
                        logger.info('Valid master ID:', masterIid);
                        return masterIid;
                    }
                    else {
                        // false or undefined response means no masterIid or invalid masterIid
                        if (masterIid) {
                            logger.info('Invalid master ID:', masterIid);
                            provider.unsetInstanceProtection(masterIid);
                        }

                        logger.info('Electing master.');
                        return provider.electMaster();
                    }
                })
                .then(function(response) {
                    var promises = [];
                    var thisInstance;
                    var thisInstanceIid;
                    var bigIp;

                    masterIid = response;
                    thisInstanceIid = provider.getInstanceId();
                    thisInstance = this.instances[thisInstanceIid];

                    if (thisInstanceIid === masterIid) {
                        thisInstance.isMaster = true;
                    }

                    logger.info('Using master ID:', masterIid);

                    bigIp = testOpts.bigIp || new BigIp(thisInstance.mgmtIp,
                                                        thisInstance.adminUser,
                                                        thisInstance.adminPassword,
                                                        {port: thisInstance.mgmtPort, logger: logger});

                    if (options.clusterAction === 'update') {
                        // Only run if master is self
                        if (thisInstance.isMaster) {
                            logger.info('Cluster Action UPDATE');

                            return getCmSyncStatus(bigIp)
                                .then(function(response) {
                                    var hostnameMap = {};
                                    var hostnamesToRemove = [];
                                    var instanceId;
                                    var hostname;

                                    response = response || {};

                                    // response is an object of two lists (connected/disconnected) from getCmSyncStatus()
                                    var disconnected = response.disconnected;
                                    if (disconnected.length > 0) {

                                        logger.info('Possibly disconnected devices:', disconnected);
                                        // get a map of hostname -> instance id
                                        for (instanceId in this.instances) {
                                            hostname = this.instances[instanceId].hostname;
                                            if (hostname) {
                                                hostnameMap[hostname] = instanceId;
                                            }
                                        }

                                        // make sure this is not still in the instances list
                                        disconnected.forEach(function(hostname) {
                                            var instanceIdToCheck = hostnameMap[hostname];

                                            if (!instanceIdToCheck) {
                                                logger.info('Disconnected device:', hostname);
                                                hostnamesToRemove.push(hostname);
                                            }
                                        });

                                        if (hostnamesToRemove.length > 0) {
                                            logger.info('Removing devices from cluster:', hostnamesToRemove);
                                            return bigIp.cluster.removeFromCluster(hostnamesToRemove, options.deviceGroup);
                                        }
                                    }
                                    else {
                                        logger.debug('No disconnected devices detected.');
                                    }
                                }.bind(this));
                        }
                        else {
                            logger.debug('Not master. Cluster update will be done by master.');
                        }
                    }
                    else if (options.clusterAction === 'join') {
                        logger.info('Cluster Action JOIN');

                        // Store our info
                        return provider.putInstance(thisInstance)
                            .then(function(response) {
                                logger.debug(response);

                                // Configure cm configsync-ip on this BIG-IP node
                                return bigIp.cluster.configSyncIp(thisInstance.privateIp);
                            }.bind(this))
                            .then(function() {
                                var masterInstance;

                                // If we're the master, create the device group and protect ourselves from scale in
                                if (thisInstance.isMaster) {
                                    logger.info('Creating device group.');

                                    promises.push(bigIp.cluster.createDeviceGroup(options.deviceGroup, 'sync-failover', [thisInstance.hostname], {autoSync: true}),
                                                  provider.setInstanceProtection());
                                    return q.all(promises);
                                }

                                // If we're not the master, join the cluster
                                else {
                                    logger.info('Joining cluster.');
                                    masterInstance = this.instances[masterIid];
                                    return bigIp.cluster.joinCluster(options.deviceGroup, masterInstance.mgmtIp, masterInstance.adminUser, masterInstance.adminPassword);
                                }
                            }.bind(this));
                    }
                }.bind(this))
                .catch(function(err) {
                    logger.error(err.message);
                })
                .done(function() {
                    logger.info('Autoscale done.');

                    if (cb) {
                        cb();
                    }
                });
            }
    };

    /**
     * Gets the instance ID of the master
     *
     * @param {Object} instances - Instances map
     *
     * @returns {String} instanceId of master if one is found.
     */
    var getMasterInstanceId = function(instances) {
        var instanceIds = Object.keys(instances);
        var instanceId;

        if (instanceIds.length === 1) {
            return instanceIds[0];
        }

        for (instanceId in instances) {
            if (instances[instanceId].isMaster) {
                return instanceId;
            }
        }
    };

    /**
     * Gets cm sync status
     *
     * @param {BigIp} bigIp - bigIp instance
     *
     * @returns {Object} Object containing list of connected and disconnected host names
     */
    var getCmSyncStatus = function(bigIp) {
        var path = '/tm/cm/sync-status';
        var cmSyncStatus = { 'connected':[], 'disconnected':[] }; // key = connected/disconnected, value = array of iids

        var entries;
        var detail;
        var description;
        var lArray;

        return bigIp.list(path, undefined, {maxRetries: 120, retryIntervalMs: 10000})
            .then(function(response) {
                logger.debug(response);
                entries = response.entries['https://localhost/mgmt/tm/cm/sync-status/0'].nestedStats.entries['https://localhost/mgmt/tm/cm/syncStatus/0/details'].nestedStats.entries;

                for (detail in entries) {
                    description = entries[detail].nestedStats.entries.details.description;
                    lArray = description.split(": ");
                    if (lArray[1] === 'connected') {
                        cmSyncStatus.connected.push(lArray[0]);
                    } else if (lArray[1] === 'disconnected') {
                        cmSyncStatus.disconnected.push(lArray[0]);
                    }
                }
                logger.debug(cmSyncStatus);
                return(cmSyncStatus);
            });
    };

    // If we're called from the command line, run
    // This allows for test code to call us as a module
    if (!module.parent) {
        runner.run(process.argv);
    }
})();
