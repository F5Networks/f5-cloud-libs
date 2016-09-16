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

var q = require('q');
var util = require('./util');

var DEVICE_GROUP_PATH = '/tm/cm/device-group/';
var TRUST_DOMAIN_NAME = 'Root';

/**
 * Provides clustering functionality to a base BigIp object
 * @class
 *
 * @param {Object} bigIpCore  - Base BigIp object.
 * @param {Object} [testOpts] - Options used during testing.
 */
function BigIpCluster(bigIpCore, testOpts) {
    this.core = bigIpCore;
    this.testOpts = testOpts || {};
}

var writeOutput = function(message, options) {
    if (options) {
        if (options.verbose || !options.silent) {
            message += '\n';
            if (options.logFile) {
                options.logFile.write(message);
            }
            else {
                process.stdout.write(message);
            }
        }
    }
};

var writeResponse = function(response, options) {
    if (response && options && options.verbose) {
        writeOutput((typeof response === 'object' ? JSON.stringify(response, null, 4) : "  " + response), options);
    }
};

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
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                // Check to see if host is in the trust domain already
                return this.isInTrustGroup(deviceName);
            }.bind(this))
            .then(function(isInGroup) {
                if (!isInGroup) {
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
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

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
 * Creates a device group
 *
 * @param {String}   name                           - Name for device group.
 * @param {String}   type                           - Type of device group. Must be 'sync-only' || 'sync-failover'.
 * @param {String[]} [devices]                      - Array of device names to add to the group.
 * @param {Object}   [options]                      - Object containg device group options.
 * @param {Boolean}  [options.autoSync]             - Whether or not to autoSync. Default false.
 * @param {Boolean}  [options.saveOnAutoSync]       - If autoSync is eanbled, whether or not to save on
                                                      autoSync. Default false.
 * @param {Boolean}  [options.networkFailover]      - Whether or not to use network fail-over. Default false.
 * @param {Boolean}  [options.fullLoadOnSync]       - Whether or not to do a full sync. Default false.
 * @param {Boolean}  [options.asmSync]              - Whether or not do to ASM sync. Default false.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.createDeviceGroup = function(name, type, devices, options, retryOptions) {

    if (!name) {
        return q.reject(new Error("name is required"));
    }

    if (type !== 'sync-only' && type !== 'sync-failover') {
        return q.reject(new Error("type must be 'sync-only' or 'sync-failover'"));
    }

    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

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
                        if (deviceGroups[i].name === name) {
                            return true;
                        }
                    }
                };

                if (response) {
                    if (!containsGroup(response)) {
                        groupSettings = {
                            name: name,
                            type: type,
                            devices: devices || []
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
                }
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
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

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
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

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
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

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
 *
 * @param {String}  deviceGroup    - Name of device group to join.
 * @param {String}  remoteHost     - Managemnt IP for the remote BIG-IP on which the group exists.
 * @param {String}  remoteUser     - Remote BIG-IP admin user name.
 * @param {String}  remotePassword - Remote BIG-IP admin user password.
 * @param {Boolean} [sync]         - Whether or not to perform a sync. Default true.
 * @param {String}  [options]      - Options for logging.
 * @param {Boolean} [options.verbose]
 * @param {Boolean} [options.silent]
 * @param {Boolean} [options.logFile]
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.joinCluster = function(deviceGroup, remoteHost, remoteUser, remotePassword, sync, options) {
    var BigIp = require('./bigIp');
    var remoteBigIp;
    var hostname;
    var version;

    options = options || {};
    if (typeof sync === 'undefined') {
        sync = true;
    }

    if (!deviceGroup || !remoteHost || !remoteUser || !remotePassword) {
        throw new Error('When joinging a device group, device-group, remote-host, remote-user, and remote-password are required.');
    }

    remoteBigIp = new BigIp(remoteHost, remoteUser, remotePassword);

    writeOutput("Checking device group on remote host.", options);

    return remoteBigIp.list('/tm/cm/device-group/' + deviceGroup, undefined, {maxRetries: 120, retryIntervalMs: 10000})
        .then(function(response) {
            writeResponse(response, options);
            writeOutput("Getting local hostname for trust.", options);
            return this.core.deviceInfo();
        }.bind(this))
        .then(function(response) {
            writeResponse(response, options);
            writeOutput("Adding to remote trust.", options);
            hostname = response.hostname;
            version = response.version; // we need this later when we sync the datasync-global-dg group
            return remoteBigIp.cluster.addToTrust(hostname, this.core.host, this.core.user, this.core.password);
        }.bind(this))
        .then(function(response) {
            writeResponse(response, options);
            writeOutput("Adding to remote device group.", options);
            return remoteBigIp.cluster.addToDeviceGroup(hostname, deviceGroup);
        }.bind(this))
        .then(function(response) {
            writeResponse(response, options);

            if (sync) {
                // If the group datasync-global-dg is present (which it likely is if ASM is provisioned)
                // we need to force a sync of it as well. Otherwise we will not be able to determine
                // the overall sync status because there is no way to get the sync status
                // of a single device group
                writeOutput("Checking for datasync-global-dg.", options);
                return this.core.list('/tm/cm/device-group');
            }
        }.bind(this))
        .then(function(response) {

            // Sometimes sync just fails silently, so we retry all of the sync commands until both
            // local and remote devices report that they are in sync
            var syncAndCheck = function(datasyncGlobalDgResponse) {
                var deferred = q.defer();
                var remoteSyncPromise = q.defer();

                var SYNC_COMPLETE_RETRY = {
                    maxRetries: 3,
                    retryIntervalMs: 10000
                };

                writeOutput("Telling remote to sync.", options);

                // We need to wait some time (30 sec?) between issuing sync commands or else sync
                // never completes.
                remoteBigIp.cluster.sync('to-group', deviceGroup, false, util.NO_RETRY)
                    .then(function() {
                        setTimeout(function() {
                            remoteSyncPromise.resolve();
                        }, 30000);
                    })
                    .done();

                remoteSyncPromise.promise
                    .then(function() {
                        var i;
                        for (i = 0; i < datasyncGlobalDgResponse.length; ++i) {
                            if (datasyncGlobalDgResponse[i].name === 'datasync-global-dg') {
                                // Prior to 12.1, set the sync leader
                                if (util.versionCompare(version, '12.1.0') < 0) {
                                    writeOutput("Setting sync leader.", options);
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
                                    writeOutput("Telling remote to sync datasync-global-dg request.", options);
                                    return remoteBigIp.cluster.sync('to-group', 'datasync-global-dg', true, util.NO_RETRY);
                                }
                            }
                        }
                    }.bind(this))
                    .then(function() {
                        var syncCompleteChecks = [];
                        writeOutput("Waiting for sync to complete.", options);
                        syncCompleteChecks.push(this.syncComplete(SYNC_COMPLETE_RETRY), remoteBigIp.cluster.syncComplete(SYNC_COMPLETE_RETRY));
                        return q.all(syncCompleteChecks);
                    }.bind(this))
                    .then(function() {
                        writeOutput("Sync complete.", options);
                        deferred.resolve();
                    }.bind(this))
                    .catch(function() {
                        writeOutput("Sync not yet complete.", options);
                        deferred.reject();
                    })
                    .done();

                return deferred.promise;
            };

            writeResponse(response, options);

            if (sync) {
                return util.tryUntil(this, {maxRetries: 10, retryIntervalMs: 30000}, syncAndCheck, [response]);
            }
        }.bind(this));
};

/**
 * Removes a device from a device group
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromDeviceGroup = function(deviceName, deviceGroup, retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                return this.core.list(DEVICE_GROUP_PATH + deviceGroup + '/devices', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(devices) {
                var removeFromDeviceList = function(devices) {
                    var i;
                    for (i = 0; i < devices.length; ++i) {
                        if (devices[i].name.indexOf(deviceName) !== -1) {
                            devices.splice(i, 1);
                            return true;
                        }
                    }
                };

                if (removeFromDeviceList(devices)) {
                    return this.core.modify(
                        DEVICE_GROUP_PATH + deviceGroup,
                        {
                            devices: devices
                        }
                    );
                }

            }.bind(this));
    };

    return util.tryUntil(this, retryOptions, func);
};

/**
 * Removes a device from cluster
 *
 * This is a just a higher level function that calls other funcitons in this
 * and other bigIp* files:
 *     - Remove from device group
 *     - Remove from trust
 *
 * @param {String}  deviceGroup    - Name of device group to join.
 * @param {String}  [options]      - Options for logging.
 * @param {Boolean} [options.verbose]
 * @param {Boolean} [options.silent]
 * @param {Boolean} [options.logFile]
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromCluster = function(deviceName, deviceGroup, options) {

    return this.core.ready()
        .then(function() {
            writeOutput("Removing from device group.", options);
            return this.removeFromDeviceGroup(deviceName, deviceGroup);
        }.bind(this))
        .then(function(response) {
            writeResponse(response, options);

            writeOutput("Removing from trust.", options);
            return this.removeFromTrust(deviceName);
        }.bind(this));
};

/**
 * Removes a device from the device trust
 *
 * @param {String}  deviceName                     - Device name to remove.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails. 0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromTrust = function(deviceName, retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        return this.core.ready()
            .then(function() {
                // Check to see if host is in the trust domain already
                return this.isInTrustGroup(deviceName);
            }.bind(this))
            .then(function(isInGroup) {
                if (isInGroup) {
                    return this.core.create(
                       '/tm/cm/remove-from-trust',
                       {
                            command: 'run',
                            deviceName: deviceName
                       },
                       undefined,
                       util.NO_RETRY);
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
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

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
 *                    or rejected if not or on error.
 */
BigIpCluster.prototype.syncComplete = function(retryOptions) {
    retryOptions = retryOptions || this.core.DEFAULT_RETRY_OPTIONS;

    var func = function() {
        var deferred = q.defer();
        this.core.ready()
            .then(function() {
                return this.core.list('/tm/cm/sync-status', undefined, util.NO_RETRY);
            }.bind(this))
            .then(function(response) {
                if (response.entries["https://localhost/mgmt/tm/cm/sync-status/0"].nestedStats.entries.color.description === 'green') {
                    deferred.resolve();
                }
                else {
                    deferred.reject();
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
