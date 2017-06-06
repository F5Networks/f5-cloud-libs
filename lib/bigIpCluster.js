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

var q = require('q');
var util = require('./util');
var Logger = require('./logger');

var DEVICE_GROUP_PATH = '/tm/cm/device-group/';
var TRUST_DOMAIN_NAME = 'Root';

/**
 * Provides clustering functionality to a base BigIp object
 * @class
 * @classdesc
 * Provides clustering operations for a BIG-IP.
 *
 * @param {Object} bigIpCore               - Base BigIp object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger. See {@link module:logger.getLogger} for details.
 */
function BigIpCluster(bigIpCore, options) {
    options = options || {};
    if (options.logger) {
        this.logger = options.logger;
        util.setLogger(options.logger);
    }
    else {
        options.loggerOptions = options.loggerOptions || {logLevel: 'none'};
        options.loggerOptions.module = module;
        this.logger = Logger.getLogger(options.loggerOptions);
        util.setLoggerOptions(options.loggerOptions);
    }

    this.core = bigIpCore;
}

/**
 * Adds a device to the trust group.
 *
 * @param {String}  deviceName                     - Device name to add.
 * @param {String}  remoteHost                     - IP address of remote host to add
 * @param {String}  remoteUser                     - Admin user name on remote host
 * @param {String}  remotePassword                 - Admin user password on remote host
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToTrust = function(deviceName, remoteHost, remoteUser, remotePassword, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                // Check to see if host is in the trust domain already
                return this.isInTrustGroup(deviceName);
            }.bind(this))
            .then(function(isInGroup) {
                if (!isInGroup) {
                    // We have to passt the password to iControl Rest just like we would to tmsh
                    // so escape the quotes, then wrap it in quotes
                    remotePassword = remotePassword.replace(/\\/g, '\\\\');
                    remotePassword = remotePassword.replace(/"/g, '\\"');
                    remotePassword = '"' + remotePassword + '"';

                    return this.core.create(
                       '/tm/cm/add-to-trust',
                       {
                            command: 'run',
                            name: TRUST_DOMAIN_NAME,
                            caDevice: true,
                            device: remoteHost,
                            deviceName: deviceName,
                            username: remoteUser,
                            password: remotePassword
                       },
                       undefined,
                       util.NO_RETRY);
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Adds a device to a device group.
 *
 * @param {String}  deviceName                     - Device name to add.
 * @param {String}  deviceGroup                    - Name of the device group to add device to.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToDeviceGroup = function(deviceName, deviceGroup, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.isInDeviceGroup(deviceName, deviceGroup);
            }.bind(this))
            .then(function(isInGroup) {
                if (!isInGroup) {
                    return this.core.create(
                        DEVICE_GROUP_PATH + '~Common~' + deviceGroup + '/devices',
                        {
                            name: deviceName
                        },
                        undefined,
                        util.NO_RETRY
                    );
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Checks to see if a device is in a device group
 *
 * @param {String[]} deviceNames                    - Device names to check for.
 * @param {String}   deviceGroup                    - Device group to look in.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with an array of names that are in the device group
 *                    and in deviceNames, or rejected if an error occurs.
 */
BigIpCluster.prototype.areInDeviceGroup = function(deviceNames, deviceGroup, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.list(DEVICE_GROUP_PATH + deviceGroup + '/devices', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(currentDevices) {
                var devicesInGroup = [];
                currentDevices.forEach(function(currentDevice) {
                    if (deviceNames.indexOf(currentDevice.name) !== -1) {
                        devicesInGroup.push(currentDevice.name);
                    }
                });

                return devicesInGroup;
            }.bind(this));
        };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Checks to see if a device is in the trust group
 *
 * @param {String[]} deviceNames                    - Device names to check for.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with an array of names that are in the trust group
 *                    and in deviceNames, or rejected if an error occurs.
 */
BigIpCluster.prototype.areInTrustGroup = function(deviceNames, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.list('/tm/cm/trust-domain/' + TRUST_DOMAIN_NAME, undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var i = deviceNames.length - 1;

                if (response && response.caDevices) {
                    while (i >= 0) {
                        if (response.caDevices.indexOf('/Common/' + deviceNames[i]) === -1) {
                            deviceNames.splice(i, 1);
                        }
                        --i;
                    }
                }

                return deviceNames;
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Sets the config sync ip
 *
 * @param {String}   configSyncIp                   - The IP address to use for config sync.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.configSyncIp = function(configSyncIp, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.deviceInfo(util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                return this.core.modify(
                    '/tm/cm/device/~Common~' + response.hostname,
                    {
                        configsyncIp: configSyncIp
                    }
                );
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Creates a device group
 *
 * @param {String}          deviceGroup                    - Name for device group.
 * @param {String}          type                           - Type of device group. Must be 'sync-only' || 'sync-failover'.
 * @param {String|String[]} [deviceNames]                  - Device name or array of names to add to the group.
 * @param {Object}          [options]                      - Object containg device group options.
 * @param {Boolean}         [options.autoSync]             - Whether or not to autoSync. Default false.
 * @param {Boolean}         [options.saveOnAutoSync]       - If autoSync is eanbled, whether or not to save on
                                                             autoSync. Default false.
 * @param {Boolean}         [options.networkFailover]      - Whether or not to use network fail-over. Default false.
 * @param {Boolean}         [options.fullLoadOnSync]       - Whether or not to do a full sync. Default false.
 * @param {Boolean}         [options.asmSync]              - Whether or not do to ASM sync. Default false.
 * @param {Object}          [retryOptions]                 - Options for retrying the request.
 * @param {Integer}         [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}         [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.createDeviceGroup = function(deviceGroup, type, deviceNames, options, retryOptions) {

    if (!deviceGroup) {
        return q.reject(new Error("deviceGroup is required"));
    }

    if (type !== 'sync-only' && type !== 'sync-failover') {
        return q.reject(new Error("type must be 'sync-only' or 'sync-failover'"));
    }

    if (!Array.isArray(deviceNames)) {
        deviceNames = [deviceNames];
    }

    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                // Check to see if the device group already exists
                return this.core.list(DEVICE_GROUP_PATH);
            }.bind(this))
            .then(function(response) {
                var groupSettings;

                var containsGroup = function(deviceGroups) {
                    var i;

                    for (i = 0; i < deviceGroups.length; ++i) {
                        if (deviceGroups[i].name === deviceGroup) {
                            return true;
                        }
                    }
                };

                if (response) {
                    if (!containsGroup(response)) {
                        groupSettings = {
                            name: deviceGroup,
                            type: type,
                            devices: deviceNames || []
                        };

                        options = options || {};

                        groupSettings.autoSync = options.autoSync ? 'enabled' : 'disabled';
                        groupSettings.fullLoadOnSync = options.fullLoadOnSync ? true : false;
                        groupSettings.asmSync = options.asmSync ? 'enabled' : 'disabled';

                        if (groupSettings.autoSync === 'enabled') {
                            groupSettings.saveOnAutoSync = options.saveOnAutoSync ? true : false;
                        }

                        if (type === 'sync-failover') {
                            groupSettings.networkFailover = options.networkFailover ? 'enabled' : 'disabled';
                        }

                        return this.core.create(DEVICE_GROUP_PATH, groupSettings, undefined, util.NO_RETRY);
                    }
                    else {
                        // If the device group exists, check that the requested devices are in it
                        return this.areInDeviceGroup(deviceNames, deviceGroup, retryOptions)
                            .then(function(devicesInGroup) {
                                var promises = [];

                                deviceNames.forEach(function(deviceName) {
                                    if (devicesInGroup.indexOf(deviceName) === -1) {
                                        promises.push(
                                            {
                                                promise: this.addToDeviceGroup,
                                                arguments: [deviceName, deviceGroup]
                                            }
                                        );
                                    }
                                }.bind(this));

                                return util.callInSerial(this, promises);
                            }.bind(this));
                    }
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Checks to see if a device is device group
 *
 * @param {String}   deviceName                     - Device name to check for.
 * @param {String}   deviceGroup                    - Device group to check in.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with true or false
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.isInDeviceGroup = function(deviceName, deviceGroup, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.list(DEVICE_GROUP_PATH + deviceGroup + '/devices', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var containsHost = function(devices) {
                    var i;
                    for (i = 0; i < devices.length; ++i) {
                        if (devices[i].name.indexOf(deviceName) !== -1) {
                            return true;
                        }
                    }
                };

                return containsHost(response);
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Checks to see if a device is in the trust group
 *
 * @param {String}   deviceName                     - Device name to check for.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with true or false
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.isInTrustGroup = function(deviceName, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.list('/tm/cm/trust-domain/' + TRUST_DOMAIN_NAME, undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                if (response && response.caDevices) {
                    return response.caDevices.indexOf('/Common/' + deviceName) !== -1;
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Joins a cluster and optionally syncs.
 *
 * This is a just a higher level function that calls other funcitons in this
 * and other bigIp* files:
 *     - Add to trust on remote host
 *     - Add to remote device group
 *     - Sync remote device group
 *     - Check for datasync-global-dg and sync that as well if it is present
 *       (this is necessary so that we know when syncing is complete)
 * The device group must already exist on the remote host.
 *
 * @param {String}  deviceGroup             - Name of device group to join.
 * @param {String}  remoteHost              - Managemnt IP for the remote BIG-IP on which the group exists.
 * @param {String}  remoteUser              - Remote BIG-IP admin user name.
 * @param {String}  remotePassword          - Remote BIG-IP admin user password.
 * @param {Object}  [options]               - Optional arguments.
 * @param {Number}  [options.remotePort]    - Remote BIG-IP port to connect to. Default the port of this BIG-IP instance.
 * @param {Boolean} [options.sync]          - Whether or not to perform a sync. Default true.
 * @param {Number}  [options.syncDelay]     - Delay in ms to wait after sending sync command before proceeding. Default 30000.
 * @param {Number}  [options.syncCompDelay] - Delay in ms to wait between checking sync complete. Default 10000.
 * @param {Boolean} [options.passwordIsUrl] - Indicates that password is a URL for the password.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.joinCluster = function(deviceGroup, remoteHost, remoteUser, remotePassword, options) {
    var BigIp = require('./bigIp');
    var remoteBigIp;
    var hostname;
    var managementIp;
    var version;

    var checkClusterReadiness = function(deviceGroup) {
        var func = function() {

            var promises;

            // remoteBigIp is passed as 'this'
            return this.ready()
                .then(function() {
                    return this.deviceInfo();
                }.bind(this))
                .then(function(response) {
                    var hostname = response.hostname;

                    promises = [
                        {
                            promise: this.list,
                            arguments: [
                                '/tm/cm/device-group/' + deviceGroup,
                                undefined,
                                util.NO_RETRY
                            ]
                        },
                        {
                            promise: this.list,
                            arguments: [
                                '/tm/cm/device/~Common~' + hostname,
                                undefined,
                                util.NO_RETRY
                            ]
                        }
                    ];

                    return util.callInSerial(this, promises);
                }.bind(this))
                .then(function(responses) {
                    if (responses.length !== promises.length) {
                        return q.reject(new Error("Not all responses received."));
                    }

                    if (!responses[1].configsyncIp || responses[1].configsyncIp === 'none') {
                        return q.reject(new Error("No config sync IP."));
                    }
                }.bind(this));
            };

        return util.tryUntil(remoteBigIp, {maxRetries: 240, retryIntervalMs: 10000}, func);
    };

    options = options || {};
    options.remotePort = options.remotePort || this.core.port;
    options.syncDelay = options.syncDelay || 30000;
    options.syncCompDelay = options.syncCompDelay || 10000;

    if (typeof options.sync === 'undefined') {
        options.sync = true;
    }

    if (!deviceGroup || !remoteHost || !remoteUser || !remotePassword) {
        return q.reject(new Error('When joining a device group, device-group, remote-host, remote-user, and remote-password are required.'));
    }

    remoteBigIp = new BigIp({logger: this.logger});

    return remoteBigIp.init(
        remoteHost,
        remoteUser,
        remotePassword,
        {
            port: options.remotePort,
            passwordIsUrl: options.passwordIsUrl
        }
    )
    .then(function() {
        this.logger.info("Checking remote host for cluster readiness.");
        return checkClusterReadiness(deviceGroup);
    }.bind(this))
    .then(function(response) {
        this.logger.debug(response);

        this.logger.info("Getting local hostname for trust.");
        return this.core.list('/tm/cm/device');
    }.bind(this))
    .then(function(response) {
        this.logger.debug(response);

        // On some versions, this is an array - on others it is not.
        if (Array.isArray(response)) {
            response = response[0];
        }
        hostname = response.hostname;
        this.logger.info("Getting local management address.");
        return this.core.deviceInfo();
    }.bind(this))
    .then(function(response) {
        this.logger.debug(response);

        managementIp = response.managementAddress;
        this.logger.info("Adding to remote trust.");
        return remoteBigIp.cluster.addToTrust(hostname, managementIp, this.core.user, this.core.password);
    }.bind(this))
    .then(function(response) {
        this.logger.debug(response);

        this.logger.info("Adding to remote device group.");
        return remoteBigIp.cluster.addToDeviceGroup(hostname, deviceGroup);
    }.bind(this))
    .then(function(response) {
        this.logger.debug(response);

        if (options.sync) {
            // If the group datasync-global-dg is present (which it likely is if ASM is provisioned)
            // we need to force a sync of it as well. Otherwise we will not be able to determine
            // the overall sync status because there is no way to get the sync status
            // of a single device group
            this.logger.info("Checking for datasync-global-dg.");
            return this.core.list('/tm/cm/device-group');
        }
    }.bind(this))
    .then(function(response) {

        var dataSyncResponse = response;

        // Sometimes sync just fails silently, so we retry all of the sync commands until both
        // local and remote devices report that they are in sync
        var syncAndCheck = function(datasyncGlobalDgResponse) {
            var deferred = q.defer();
            var remoteSyncPromise = q.defer();

            var SYNC_COMPLETE_RETRY = {
                maxRetries: 3,
                retryIntervalMs: options.syncCompDelay
            };

            this.logger.info("Telling remote to sync.");

            // We need to wait some time (30 sec?) between issuing sync commands or else sync
            // never completes.
            remoteBigIp.cluster.sync('to-group', deviceGroup, false, util.NO_RETRY)
                .then(function() {
                    setTimeout(function() {
                        remoteSyncPromise.resolve();
                    }, options.syncDelay);
                })
                .done();

            remoteSyncPromise.promise
                .then(function() {
                    var i;
                    for (i = 0; i < datasyncGlobalDgResponse.length; ++i) {
                        if (datasyncGlobalDgResponse[i].name === 'datasync-global-dg') {
                            // Prior to 12.1, set the sync leader
                            if (util.versionCompare(version, '12.1.0') < 0) {
                                this.logger.info("Setting sync leader.");
                                return this.core.modify(
                                    '/tm/cm/device-group/datasync-global-dg/devices/' + hostname,
                                    {
                                        "set-sync-leader": true
                                    },
                                    undefined,
                                    util.NO_RETRY
                                );
                            }

                            // On 12.1 and later, do a full sync
                            else {
                                this.logger.info("Telling remote to sync datasync-global-dg request.");
                                return remoteBigIp.cluster.sync('to-group', 'datasync-global-dg', true, util.NO_RETRY);
                            }
                        }
                    }
                }.bind(this))
                .then(function() {
                    var syncCompleteChecks = [];
                    this.logger.info("Waiting for sync to complete.");
                    syncCompleteChecks.push(this.syncComplete(SYNC_COMPLETE_RETRY), remoteBigIp.cluster.syncComplete(SYNC_COMPLETE_RETRY));
                    return q.all(syncCompleteChecks);
                }.bind(this))
                .then(function() {
                    this.logger.info("Sync complete.");
                    deferred.resolve();
                }.bind(this))
                .catch(function(err) {
                    this.logger.info("Sync not yet complete.");
                    this.logger.verbose("Sync Error", err);

                    if (err && err.recommendedAction) {
                        // In some cases, sync complete tells us to sync a different group
                        if (err.recommendedAction.sync) {
                            this.logger.info("Following recommended action. Syncing group " + err.recommendedAction.sync);
                            remoteBigIp.cluster.sync('to-group', err.recommendedAction.sync, true, util.NO_RETRY)
                                .then(function() {
                                    return this.syncComplete(SYNC_COMPLETE_RETRY);
                                })
                                .then(function() {
                                    deferred.resolve();
                                })
                                .catch(function() {
                                    deferred.reject();
                                });
                        }
                    }
                    else {
                        deferred.reject();
                    }
                }.bind(this))
                .done();

            return deferred.promise;
        };

        this.logger.debug(response);

        if (options.sync) {
            return this.core.deviceInfo()
                .then(function(response) {
                    version = response.version; // we need this later when we sync the datasync-global-dg group
                    return util.tryUntil(this, {maxRetries: 10, retryIntervalMs: options.syncDelay}, syncAndCheck, [dataSyncResponse]);
                }.bind(this));
        }
    }.bind(this));
};

/**
 * Removes a device from cluster
 *
 * This is a just a higher level function that calls other funcitons in this
 * and other bigIp* files:
 *     - Remove from device group
 *     - Remove from trust
 *
 * @param {String|String[]} deviceNames    - Name or array of names of devices to remove
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromCluster = function(deviceNames) {

    if (!Array.isArray(deviceNames)) {
        deviceNames = [deviceNames];
    }

    return this.core.ready()
        .then(function() {
            this.logger.info("Getting device groups");
            return this.core.list('/tm/cm/device-group');
        }.bind(this))
        .then(function(response) {
            var promises = [];
            response.forEach(function(deviceGroup) {
                // Skip device_trust_group as it is read-only
                if (deviceGroup.name !== 'device_trust_group') {
                    promises.push(this.removeFromDeviceGroup(deviceNames, deviceGroup.name));
                }
            }.bind(this));
            return q.all(promises);
        }.bind(this))
        .then(function(response) {
            this.logger.debug(response);

            this.logger.info("Removing from trust.");
            return this.removeFromTrust(deviceNames);
        }.bind(this));
};

/**
 * Removes a device from a device group
 *
 * @param {String|String[]} deviceNames                    - Name or array of names of devices to remove
 * @param {Object}          [retryOptions]                 - Options for retrying the request.
 * @param {Integer}         [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}         [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromDeviceGroup = function(deviceNames, deviceGroup, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    if (!Array.isArray(deviceNames)) {
        deviceNames = [deviceNames];
    }

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.list(DEVICE_GROUP_PATH + deviceGroup + '/devices', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(currentDevices) {
                var devicesToKeep = [];
                currentDevices.forEach(function(currentDevice) {
                    if (deviceNames.indexOf(currentDevice.name) === -1) {
                        devicesToKeep.push(currentDevice.name);
                    }
                });
                if (devicesToKeep.length !== currentDevices.length) {
                    return this.core.modify(
                        DEVICE_GROUP_PATH + deviceGroup,
                        {
                           devices: devicesToKeep
                        }
                    );
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Removes a device from the device trust
 *
 * @param {String|String[]} deviceNames            - Name or array of names of devices to remove
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromTrust = function(deviceNames, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    if (!Array.isArray(deviceNames)) {
        deviceNames = [deviceNames];
    }

    var func = function() {
        return this.core.ready()
            .then(function() {
                // Check to see if host is in the trust domain already
                return this.areInTrustGroup(deviceNames);
            }.bind(this))
            .then(function(devicesInGroup) {
                var promises = [];

                devicesInGroup.forEach(function(deviceName) {
                    promises.push(
                        this.core.create(
                        '/tm/cm/remove-from-trust',
                        {
                            command: 'run',
                            name: 'Root',
                            caDevice: true,
                            deviceName: deviceName
                        },
                        undefined,
                        util.NO_RETRY));
                }.bind(this));

                if (promises.length !== 0) {
                    return q.all(promises);
                }
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Syncs to/from device group
 *
 * @param {String}   direction                      - 'to-group' || 'from-group'
 * @param {String}   deviceGroup                    - Name of the device group to sync.
 * @param {Boolean}  [forceFullLoadPush]            - Whether or not to use the force-full-load-push option. Default false.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.sync = function(direction, deviceGroup, forceFullLoadPush, retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.create(
                       '/tm/cm',
                       {
                           command: "run",
                           utilCmdArgs: ["config-sync", forceFullLoadPush ? 'force-full-load-push' : '', direction, deviceGroup].join(" ")
                       },
                       undefined,
                       util.NO_RETRY
                );
            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Checks sync status to see if it is complete
 *
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved if sync is complete,
 *                    or rejected on error or recommended action.
 */
BigIpCluster.prototype.syncComplete = function(retryOptions) {
    retryOptions = retryOptions || util.DEFAULT_RETRY;

    var func = function() {
        var deferred = q.defer();
        this.core.ready()
            .then(function() {
                return this.core.list('/tm/cm/sync-status', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                var mainStats = response.entries["https://localhost/mgmt/tm/cm/sync-status/0"].nestedStats.entries;
                var toGroupTag = "to group ";
                var detailedStats;
                var detailKeys;
                var description;
                var rejectReason;
                var toGroupIndex;
                var i;

                if (mainStats.color.description === 'green') {
                    deferred.resolve();
                }
                else {
                    // Look for a recommended action
                    detailedStats = mainStats["https://localhost/mgmt/tm/cm/syncStatus/0/details"].nestedStats.entries;
                    detailKeys = Object.keys(detailedStats);
                    for (i = 0; i < detailKeys.length; ++i) {
                        description = detailedStats[detailKeys[i]].nestedStats.entries.details.description;
                        if (description.indexOf("Recommended action") !== -1) {
                            // If found, look for the group to sync.
                            toGroupIndex = description.indexOf(toGroupTag);
                            if (toGroupIndex !== -1) {
                                rejectReason = {
                                    recommendedAction: {
                                        sync: description.substring(toGroupIndex + toGroupTag.length)
                                    }
                                };
                            }
                            break;
                        }
                    }

                    deferred.reject(rejectReason);
                }
            })
            .catch(function(err) {
                deferred.reject(err);
            })
            .done();

        return deferred.promise;
    };

    return util.tryUntil(this, retryOptions, func);
};

module.exports = BigIpCluster;
