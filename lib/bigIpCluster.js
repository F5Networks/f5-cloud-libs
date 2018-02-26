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

const assert = require('assert');
const q = require('q');
const util = require('./util');
const Logger = require('./logger');

const DEVICE_GROUP_PATH = '/tm/cm/device-group/';
const TRUST_DOMAIN_NAME = 'Root';

/**
 * Cluster constructor
 *
 * @class
 * @classdesc
 * Provides clustering functionality to a base BigIp object
 *
 * @param {Object} bigIpCore               - Base BigIp object.
 * @param {Object} [options]               - Optional parameters.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function BigIpCluster(bigIpCore, options) {
    const logger = options ? options.logger : undefined;
    let loggerOptions = options ? options.loggerOptions : undefined;

    if (logger) {
        this.logger = logger;
        util.setLogger(logger);
    } else {
        loggerOptions = loggerOptions || { logLevel: 'none' };
        loggerOptions.module = module;
        this.logger = Logger.getLogger(loggerOptions);
        util.setLoggerOptions(loggerOptions);
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
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToTrust = function addToTrust(
    deviceName,
    remoteHost,
    remoteUser,
    remotePassword,
    retryOptions
) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                // Check to see if host is in the trust domain already
                return this.isInTrustGroup(deviceName);
            })
            .then((isInGroup) => {
                if (!isInGroup) {
                    // We have to pass the password to iControl Rest just like we would to tmsh
                    // so escape the quotes, then wrap it in quotes
                    let escapedPassword = remotePassword.replace(/\\/g, '\\\\');
                    escapedPassword = escapedPassword.replace(/"/g, '\\"');
                    escapedPassword = `"${escapedPassword}"`;

                    return this.core.create(
                        '/tm/cm/add-to-trust',
                        {
                            command: 'run',
                            name: TRUST_DOMAIN_NAME,
                            caDevice: true,
                            device: remoteHost,
                            username: remoteUser,
                            password: escapedPassword,
                            deviceName
                        },
                        undefined,
                        util.NO_RETRY
                    );
                }

                return q();
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Adds a device to a device group.
 *
 * @param {String}  deviceName                     - Device name to add.
 * @param {String}  deviceGroup                    - Name of the device group to add device to.
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.addToDeviceGroup = function addToDeviceGroup(deviceName, deviceGroup, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.isInDeviceGroup(deviceName, deviceGroup);
            })
            .then((isInGroup) => {
                if (!isInGroup) {
                    return this.core.create(
                        `${DEVICE_GROUP_PATH}~Common~${deviceGroup}/devices`,
                        {
                            name: deviceName
                        },
                        undefined,
                        util.NO_RETRY
                    );
                }

                return q();
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Checks to see if a device is in a device group
 *
 * @param {String[]} deviceNames                    - Device names to check for.
 * @param {String}   deviceGroup                    - Device group to look in.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with an array of names that are in the device group
 *                    and in deviceNames, or rejected if an error occurs.
 */
BigIpCluster.prototype.areInDeviceGroup = function areInDeviceGroup(deviceNames, deviceGroup, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.core.list(`${DEVICE_GROUP_PATH}${deviceGroup}/devices`, undefined, util.NO_RETRY);
            })
            .then((currentDevices) => {
                const devicesInGroup = [];
                currentDevices.forEach((currentDevice) => {
                    if (deviceNames.indexOf(currentDevice.name) !== -1) {
                        devicesInGroup.push(currentDevice.name);
                    }
                });

                return devicesInGroup;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Checks to see if a device is in the trust group
 *
 * @param {String[]} deviceNames                    - Device names to check for.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with an array of names that are in the trust group
 *                    and in deviceNames, or rejected if an error occurs.
 */
BigIpCluster.prototype.areInTrustGroup = function areInTrustGroup(deviceNames, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.core.list(`/tm/cm/trust-domain/${TRUST_DOMAIN_NAME}`, undefined, util.NO_RETRY);
            })
            .then((response) => {
                let i = deviceNames.length - 1;

                if (response && response.caDevices) {
                    while (i >= 0) {
                        if (response.caDevices.indexOf(`/Common/${deviceNames[i]}`) === -1) {
                            deviceNames.splice(i, 1);
                        }
                        i -= 1;
                    }
                }

                return deviceNames;
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Sets the config sync ip
 *
 * @param {String}   syncIp                         - The IP address to use for config sync.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.configSyncIp = function configSyncIp(syncIp, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.core.deviceInfo(util.NO_RETRY);
            })
            .then((response) => {
                return this.core.modify(
                    `/tm/cm/device/~Common~${response.hostname}`,
                    {
                        configsyncIp: syncIp
                    }
                );
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Creates a device group
 *
 * @param {String}          deviceGroup                    - Name for device group.
 * @param {String}          type                           - Type of device group. Must be
 *                                                           'sync-only' || 'sync-failover'.
 * @param {String|String[]} [deviceNames]                  - Device name or array of names to
 *                                                           add to the group.
 * @param {Object}          [options]                      - Object containg device group options.
 * @param {Boolean}         [options.autoSync]             - Whether or not to autoSync. Default false.
 * @param {Boolean}         [options.saveOnAutoSync]       - If autoSync is eanbled, whether or not to save on
                                                             autoSync. Default false.
 * @param {Boolean}         [options.networkFailover]      - Whether or not to use network fail-over.
 *                                                           Default false.
 * @param {Boolean}         [options.fullLoadOnSync]       - Whether or not to do a full sync. Default false.
 * @param {Boolean}         [options.asmSync]              - Whether or not do to ASM sync. Default false.
 * @param {Object}          [retryOptions]                 - Options for retrying the request.
 * @param {Integer}         [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                           0 to not retry. Default 60.
 * @param {Integer}         [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.createDeviceGroup = function createDeviceGroup(
    deviceGroup,
    type,
    deviceNames,
    options,
    retryOptions
) {
    let names;

    if (!deviceGroup) {
        return q.reject(new Error('deviceGroup is required'));
    }

    if (type !== 'sync-only' && type !== 'sync-failover') {
        return q.reject(new Error('type must be sync-only or sync-failover'));
    }

    if (!Array.isArray(deviceNames)) {
        names = [deviceNames];
    } else {
        names = deviceNames.slice();
    }

    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                // Check to see if the device group already exists
                return this.hasDeviceGroup(deviceGroup);
            })
            .then((response) => {
                if (response === false) {
                    const groupSettings = {
                        name: deviceGroup,
                        devices: names || [],
                        type
                    };

                    const groupOptions = {};
                    if (options) {
                        Object.keys(options).forEach((option) => {
                            groupOptions[option] = options[option];
                        });
                    }

                    groupSettings.autoSync = groupOptions.autoSync ? 'enabled' : 'disabled';
                    groupSettings.fullLoadOnSync = !!groupOptions.fullLoadOnSync;
                    groupSettings.asmSync = groupOptions.asmSync ? 'enabled' : 'disabled';

                    if (groupSettings.autoSync === 'enabled') {
                        groupSettings.saveOnAutoSync = !!groupOptions.saveOnAutoSync;
                    }

                    if (type === 'sync-failover') {
                        groupSettings.networkFailover = groupOptions.networkFailover ? 'enabled' : 'disabled';
                    }

                    return this.core.create(DEVICE_GROUP_PATH, groupSettings, undefined, util.NO_RETRY);
                }

                // If the device group exists, check that the requested devices are in it
                return this.areInDeviceGroup(names, deviceGroup, retryOptions)
                    .then((devicesInGroup) => {
                        const promises = [];

                        names.forEach((deviceName) => {
                            if (devicesInGroup.indexOf(deviceName) === -1) {
                                promises.push({
                                    promise: this.addToDeviceGroup,
                                    arguments: [deviceName, deviceGroup]
                                });
                            }
                        });

                        return util.callInSerial(this, promises);
                    });
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Deletes a device group
 *
 * @param {String}   deviceGroup                    - Name of device group.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.deleteDeviceGroup = function deleteDeviceGroup(deviceGroup) {
    if (!deviceGroup) {
        return q.reject(new Error('deviceGroup is required'));
    }

    return this.hasDeviceGroup(deviceGroup)
        .then((response) => {
            if (response === true) {
                return this.removeAllFromDeviceGroup(deviceGroup)
                    .then(() => {
                        return this.core.delete(DEVICE_GROUP_PATH + deviceGroup);
                    });
            }
            return q();
        });
};

/**
 * Checks for existence of a device group
 *
 * @param {String}          deviceGroup                    - Name for device group.
 * @param {Object}          [retryOptions]                 - Options for retrying the request.
 * @param {Integer}         [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                           0 to not retry. Default 60.
 * @param {Integer}         [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with true/false based on device group existence
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.hasDeviceGroup = function hasDeviceGroup(deviceGroup, retryOptions) {
    if (!deviceGroup) {
        return q.reject(new Error('deviceGroup is required'));
    }

    const retry = retryOptions || util.SHORT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                // Check to see if the device group already exists
                return this.core.list(DEVICE_GROUP_PATH);
            })
            .then((response) => {
                const containsGroup = (deviceGroups) => {
                    for (let i = 0; i < deviceGroups.length; i++) {
                        if (deviceGroups[i].name === deviceGroup) {
                            return true;
                        }
                    }
                    return false;
                };

                let hasGroup = false;

                if (response && containsGroup(response)) {
                    hasGroup = true;
                }

                return q(hasGroup);
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Gets cm sync status
 *
 * @returns {Promise} Promise which is resolved with a list of connected and
 *                    disconnected host names
 */
BigIpCluster.prototype.getCmSyncStatus = function getCmSyncStatus() {
    const cmSyncStatus = {
        connected: [],
        disconnected: []
    };

    let entries;
    let description;
    let descriptionTokens;

    return this.core.list('/tm/cm/sync-status', undefined, { maxRetries: 120, retryIntervalMs: 10000 })
        .then((response) => {
            this.logger.debug(response);
            entries = response
                .entries['https://localhost/mgmt/tm/cm/sync-status/0']
                .nestedStats.entries['https://localhost/mgmt/tm/cm/syncStatus/0/details'];

            if (entries) {
                Object.keys(entries.nestedStats.entries).forEach((detail) => {
                    description = entries.nestedStats.entries[detail].nestedStats.entries.details.description;
                    descriptionTokens = description.split(': ');
                    if (descriptionTokens[1] && descriptionTokens[1].toLowerCase() === 'connected') {
                        cmSyncStatus.connected.push(descriptionTokens[0]);
                    } else if (
                        descriptionTokens[1] && descriptionTokens[1].toLowerCase() === 'disconnected'
                    ) {
                        cmSyncStatus.disconnected.push(descriptionTokens[0]);
                    }
                });
            } else {
                this.logger.silly('No entries in sync status');
            }

            this.logger.debug(cmSyncStatus);
            return cmSyncStatus;
        });
};

/**
 * Checks to see if a device is device group
 *
 * @param {String}   deviceName                     - Device name to check for.
 * @param {String}   deviceGroup                    - Device group to check in.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with true or false
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.isInDeviceGroup = function isInDeviceGroup(deviceName, deviceGroup, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.hasDeviceGroup(deviceGroup);
            })
            .then((response) => {
                if (response === false) {
                    return false;
                }
                return this.core.list(`${DEVICE_GROUP_PATH}${deviceGroup}/devices`, undefined, util.NO_RETRY);
            })
            .then((response) => {
                const containsHost = function (devices) {
                    for (let i = 0; i < devices.length; i++) {
                        if (devices[i].name.indexOf(deviceName) !== -1) {
                            return true;
                        }
                    }
                    return false;
                };

                if (response === false) {
                    return false;
                }
                return containsHost(response);
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Checks to see if a device is in the trust group
 *
 * @param {String}   deviceName                     - Device name to check for.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved with true or false
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.isInTrustGroup = function isInTrustGroup(deviceName, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.core.list(`/tm/cm/trust-domain/${TRUST_DOMAIN_NAME}`, undefined, util.NO_RETRY);
            })
            .then((response) => {
                if (response && response.caDevices) {
                    return response.caDevices.indexOf(`/Common/${deviceName}`) !== -1;
                }
                return false;
            });
    };

    return util.tryUntil(this, retry, func);
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
 * @param {String}  deviceGroup                 - Name of device group to join.
 * @param {String}  remoteHost                  - Managemnt IP for the remote BIG-IP.
 * @param {String}  remoteUser                  - Remote BIG-IP admin user name.
 * @param {String}  remotePassword              - Remote BIG-IP admin user password.
 * @param {Boolean} isLocal                     - Whether the device group is defined locally or if
 *                                                we are joining one on a remote host.
 * @param {Object}  [options]                   - Optional arguments.
 * @param {Number}  [options.remotePort]        - Remote BIG-IP port to connect to. Default the
 *                                                port of this BIG-IP instance.
 * @param {Boolean} [options.sync]              - Whether or not to perform a sync. Default true.
 * @param {Number}  [options.syncDelay]         - Delay in ms to wait after sending sync command
 *                                                before proceeding. Default 30000.
 * @param {Number}  [options.syncCompDelay]     - Delay in ms to wait between checking sync complete.
 *                                                Default 10000.
 * @param {Boolean} [options.passwordIsUrl]     - Indicates that password is a URL for the password.
 * @param {Boolean} [options.passwordEncrypted] - Indicates that the password is encrypted (with the
 *                                                local cloud public key)
 * @param {String}  [options.remoteHostname]    - If adding to a local group (isLocal === true) the
 *                                                cm hostname of the remote host.
 * @param {Boolean} [options.noWait]            - Don't wait for configSyncIp, just fail if it's not
 *                                                ready right away. This is used for providers that have
 *                                                messaging - they will try again periodically
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs. If promise is resolved, it is
 *                    is resolved with true if syncing occurred.
 */
BigIpCluster.prototype.joinCluster = function joinCluster(
    deviceGroup,
    remoteHost,
    remoteUser,
    remotePassword,
    isLocal,
    options
) {
    const normalizedOptions = {};

    let clusteringBigIp;
    let remoteBigIp;
    let hostname;
    let managementIp;
    let version;

    const checkClusterReadiness = function checkClusterReadiness(deviceGroupToCheck) {
        const func = function () {
            let promises;
            let localHostname;
            let remoteHostname;

            return this.core.ready()
                .then(() => {
                    return this.core.deviceInfo();
                })
                .then((response) => {
                    localHostname = response.hostname;
                    return remoteBigIp.deviceInfo();
                })
                .then((response) => {
                    remoteHostname = response.hostname;

                    this.logger.silly('localHostname', localHostname, 'remoteHostname', remoteHostname);

                    promises = [
                        this.core.list(`/tm/cm/device/~Common~${localHostname}`, undefined, util.NO_RETRY),
                        remoteBigIp.list(`/tm/cm/device/~Common~${remoteHostname}`, undefined, util.NO_RETRY)
                    ];

                    // if the group is not local, make sure it exists on the remote
                    if (!isLocal) {
                        promises.push(remoteBigIp.list(
                            DEVICE_GROUP_PATH + deviceGroupToCheck,
                            undefined,
                            util.NO_RETRY
                        ));
                    }

                    return q.all(promises);
                })
                .then((responses) => {
                    // if the last promise (checking for device group) fails,
                    // q.all will reject - no need to check its response
                    if (!responses[0].configsyncIp || responses[0].configsyncIp === 'none') {
                        return q.reject(new Error('No local config sync IP.'));
                    }

                    if (!responses[1].configsyncIp || responses[1].configsyncIp === 'none') {
                        return q.reject(new Error('No remote config sync IP.'));
                    }

                    return q();
                });
        };

        const retry = normalizedOptions.noWait ? util.NO_RETRY : { maxRetries: 240, retryIntervalMs: 10000 };
        return util.tryUntil(this, retry, func);
    }.bind(this);

    const processJoin = function processJoin() {
        return remoteBigIp.init(
            remoteHost,
            remoteUser,
            remotePassword,
            {
                port: normalizedOptions.remotePort,
                passwordIsUrl: normalizedOptions.passwordIsUrl,
                passwordEncrypted: normalizedOptions.passwordEncrypted
            }
        )
            .then(() => {
                this.logger.info('Checking remote host for cluster readiness.');
                return checkClusterReadiness(deviceGroup);
            })
            .then((response) => {
                this.logger.debug(response);

                if (!isLocal) {
                    this.logger.info('Getting local hostname for trust.');
                    return this.core.list('/tm/cm/device');
                }

                return q();
            })
            .then((response) => {
                this.logger.debug(response);

                if (!isLocal) {
                    // On some versions, we get an object
                    const normalizedResponse = response[0] ? response[0] : response;
                    hostname = normalizedResponse.hostname;
                    this.logger.info('Getting local management address.');
                    return this.core.deviceInfo();
                }
                hostname = normalizedOptions.remoteHostname;
                return q();
            })
            .then((response) => {
                this.logger.debug(response);

                let user;
                let password;

                if (!isLocal) {
                    managementIp = response.managementAddress;
                    user = this.core.user;
                    password = this.core.password;
                } else {
                    managementIp = remoteHost;
                    user = remoteUser;
                    password = remotePassword;
                }

                this.logger.info('Adding to', isLocal ? 'local' : 'remote', 'trust.');
                return clusteringBigIp.addToTrust(hostname, managementIp, user, password);
            })
            .then((response) => {
                this.logger.debug(response);

                this.logger.info('Adding to', isLocal ? 'local' : 'remote', 'device group.');
                return clusteringBigIp.addToDeviceGroup(hostname, deviceGroup);
            })
            .then((response) => {
                this.logger.debug(response);

                if (normalizedOptions.sync) {
                    // If the group datasync-global-dg is present (which it likely is if ASM is provisioned)
                    // we need to force a sync of it as well. Otherwise we will not be able to determine
                    // the overall sync status because there is no way to get the sync status
                    // of a single device group
                    this.logger.info('Checking for datasync-global-dg.');
                    return this.core.list(DEVICE_GROUP_PATH);
                }

                return q();
            })
            .then((response) => {
                const dataSyncResponse = response;

                // Sometimes sync just fails silently, so we retry all of the sync commands until both
                // local and remote devices report that they are in sync
                const syncAndCheck = function syncAndCheck(datasyncGlobalDgResponse) {
                    const deferred = q.defer();
                    const syncPromise = q.defer();

                    const SYNC_COMPLETE_RETRY = {
                        maxRetries: 3,
                        retryIntervalMs: normalizedOptions.syncCompDelay
                    };

                    this.logger.info('Telling', isLocal ? 'local' : 'remote', 'to sync.');

                    // We need to wait some time (30 sec?) between issuing sync commands or else sync
                    // never completes.
                    clusteringBigIp.sync('to-group', deviceGroup, false, util.NO_RETRY)
                        .then(() => {
                            setTimeout(() => {
                                syncPromise.resolve();
                            }, normalizedOptions.syncDelay);
                        })
                        .done();

                    syncPromise.promise
                        .then(() => {
                            for (let i = 0; i < datasyncGlobalDgResponse.length; i++) {
                                if (datasyncGlobalDgResponse[i].name === 'datasync-global-dg') {
                                    // Prior to 12.1, set the sync leader
                                    if (util.versionCompare(version, '12.1.0') < 0) {
                                        this.logger.info('Setting sync leader.');
                                        return this.core.modify(
                                            `${DEVICE_GROUP_PATH}datasync-global-dg/devices/${hostname}`,
                                            { 'set-sync-leader': true },
                                            undefined,
                                            util.NO_RETRY
                                        );
                                    }
                                    // On 12.1 and later, do a full sync
                                    this.logger.info(
                                        'Telling',
                                        isLocal ? 'local' : 'remote',
                                        'to sync datasync-global-dg request.'
                                    );
                                    return clusteringBigIp.sync(
                                        'to-group',
                                        'datasync-global-dg',
                                        true,
                                        util.NO_RETRY
                                    );
                                }
                            }
                            return q();
                        })
                        .then(() => {
                            this.logger.info('Waiting for sync to complete.');
                            return clusteringBigIp.syncComplete(SYNC_COMPLETE_RETRY);
                        })
                        .then(() => {
                            this.logger.info('Sync complete.');
                            deferred.resolve();
                        })
                        .catch((err) => {
                            this.logger.info('Sync not yet complete.');
                            this.logger.verbose('Sync Error', err);

                            if (err && err.recommendedAction) {
                                // In some cases, sync complete tells us to sync a different group
                                if (err.recommendedAction.sync) {
                                    const recommendedGroup = err.recommendedAction.sync;
                                    this.logger.info(`Recommended action to sync group ${recommendedGroup}`);
                                    clusteringBigIp.sync('to-group', recommendedGroup, true, util.NO_RETRY)
                                        .then(() => {
                                            return clusteringBigIp.syncComplete(SYNC_COMPLETE_RETRY);
                                        })
                                        .then(() => {
                                            deferred.resolve();
                                        })
                                        .catch(() => {
                                            deferred.reject();
                                        });
                                }
                            } else {
                                deferred.reject();
                            }
                        })
                        .done();

                    return deferred.promise;
                }.bind(this);

                this.logger.debug(response);

                if (normalizedOptions.sync) {
                    return this.core.deviceInfo()
                        .then((deviceInfo) => {
                            // we need this later when we sync the datasync-global-dg group
                            version = deviceInfo.version;
                            return util.tryUntil(
                                this,
                                { maxRetries: 10, retryIntervalMs: normalizedOptions.syncDelay },
                                syncAndCheck,
                                [dataSyncResponse]
                            );
                        })
                        .then(() => {
                            return true;
                        });
                }

                return q();
            });
    }.bind(this);

    if (options) {
        Object.keys(options).forEach((option) => {
            normalizedOptions[option] = options[option];
        });
    }

    normalizedOptions.remotePort = normalizedOptions.remotePort || this.core.port;
    normalizedOptions.syncDelay = normalizedOptions.syncDelay || 30000;
    normalizedOptions.syncCompDelay = normalizedOptions.syncCompDelay || 10000;
    normalizedOptions.noWait =
        typeof normalizedOptions.noWait === 'undefined' ? false : normalizedOptions.noWait;

    if (typeof normalizedOptions.sync === 'undefined') {
        normalizedOptions.sync = true;
    }

    assert(typeof deviceGroup === 'string', 'deviceGroup is required for joinCluster');
    assert(typeof remoteHost === 'string', 'remoteHost is required for joinCluster');
    assert(typeof remoteUser === 'string', 'remoteUser is required for joinCluster');
    assert(typeof remotePassword === 'string', 'remotePassword is required for joinCluster');

    const BigIp = require('./bigIp'); // eslint-disable-line global-require
    remoteBigIp = new BigIp({ loggerOptions: this.loggerOptions });
    clusteringBigIp = isLocal ? this : remoteBigIp.cluster;

    // If we're adding to a local device group, make sure the device is not already in it
    if (isLocal) {
        return this.isInDeviceGroup(options.remoteHostname, deviceGroup)
            .then((isInGroup) => {
                if (isInGroup) {
                    this.logger.debug(options.remoteHostname, 'is already in the cluster.');
                    return q(false);
                }
                return processJoin();
            });
    }

    return processJoin();
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
BigIpCluster.prototype.removeFromCluster = function removeFromCluster(deviceNames) {
    let names;
    if (!Array.isArray(deviceNames)) {
        names = [deviceNames];
    } else {
        names = deviceNames.slice();
    }

    return this.core.ready()
        .then(() => {
            this.logger.info('Getting device groups');
            return this.core.list(DEVICE_GROUP_PATH);
        })
        .then((response) => {
            const promises = [];
            response.forEach((deviceGroup) => {
                promises.push(this.removeFromDeviceGroup(names, deviceGroup.name));
            });
            return q.all(promises);
        })
        .then((response) => {
            this.logger.debug(response);

            this.logger.info('Removing from trust.');
            return this.removeFromTrust(names);
        });
};

/**
 * Removes a device from a device group
 *
 * @param {String|String[]} deviceNames                    - Name or array of names of devices to remove.
 * @param {String}          deviceGroup                    - Name of device group.
 * @param {Object}          [retryOptions]                 - Options for retrying the request.
 * @param {Integer}         [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                           0 to not retry. Default 60.
 * @param {Integer}         [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromDeviceGroup = function removeFromDeviceGroup(
    deviceNames,
    deviceGroup,
    retryOptions
) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    let names;

    if (deviceGroup === 'device_trust_group') {
        this.logger.silly('Ignoring', deviceGroup, 'which is read only');
        return q();
    }

    if (!Array.isArray(deviceNames)) {
        names = [deviceNames];
    } else {
        names = deviceNames.slice();
    }

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.core.list(`${DEVICE_GROUP_PATH}${deviceGroup}/devices`, undefined, util.NO_RETRY);
            })
            .then((currentDevices) => {
                const devicesToKeep = [];
                currentDevices.forEach((currentDevice) => {
                    if (names.indexOf(currentDevice.name) === -1) {
                        devicesToKeep.push(currentDevice.name);
                    }
                });
                if (devicesToKeep.length !== currentDevices.length) {
                    return this.core.modify(
                        DEVICE_GROUP_PATH + deviceGroup,
                        { devices: devicesToKeep }
                    );
                }
                return q();
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Removes all devices from a device group
 *
 * @param {String}   deviceGroup                    - Name of device group.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeAllFromDeviceGroup = function removeAllFromDeviceGroup(
    deviceGroup,
    retryOptions
) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    if (deviceGroup === 'device_trust_group') {
        this.logger.silly('Ignoring', deviceGroup, 'which is read only');
        return q();
    }

    const func = function () {
        return this.core.modify(
            DEVICE_GROUP_PATH + deviceGroup,
            { devices: [] }
        );
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Removes a device from the device trust
 *
 * @param {String|String[]} deviceNames            - Name or array of names of devices to remove
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.removeFromTrust = function removeFromTrust(deviceNames, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;
    let names;

    if (!Array.isArray(deviceNames)) {
        names = [deviceNames];
    } else {
        names = deviceNames.slice();
    }

    const func = function () {
        return this.core.ready()
            .then(() => {
                // Check to see if host is in the trust domain already
                return this.areInTrustGroup(names);
            })
            .then((devicesInGroup) => {
                const promises = [];

                devicesInGroup.forEach((deviceName) => {
                    promises.push(this.core.create(
                        '/tm/cm/remove-from-trust',
                        {
                            command: 'run',
                            name: 'Root',
                            caDevice: true,
                            deviceName
                        },
                        undefined,
                        util.NO_RETRY
                    ));
                });

                if (promises.length !== 0) {
                    return q.all(promises);
                }

                return q();
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Resets the device trust
 *
 * @param {Object}  [retryOptions]                 - Options for retrying the request.
 * @param {Integer} [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                   0 to not retry. Default 60.
 * @param {Integer} [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.resetTrust = function resetTrust(retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    return this.core.ready()
        .then(() => {
            // Get the BIG-IP version
            return this.core.deviceInfo();
        })
        .then((response) => {
            const version = response.version;
            let resetPath = '/tm/cm/trust-domain';
            if (util.versionCompare(version, '13.0.0') < 0) {
                resetPath += '/Root';
            }
            return this.core.delete(resetPath, undefined, undefined, util.NO_RETRY);
        })
        .then(() => {
            return this.core.ready(retry);
        });
};

/**
 * Syncs to/from device group
 *
 * @param {String}   direction                      - 'to-group' || 'from-group'
 * @param {String}   deviceGroup                    - Name of the device group to sync.
 * @param {Boolean}  [forceFullLoadPush]            - Whether or not to use the force-full-load-push option.
 *                                                    Default false.
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved when the request is complete
 *                    or rejected if an error occurs.
 */
BigIpCluster.prototype.sync = function sync(direction, deviceGroup, forceFullLoadPush, retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        return this.core.ready()
            .then(() => {
                return this.core.create(
                    '/tm/cm',
                    {
                        command: 'run',
                        utilCmdArgs: [
                            'config-sync',
                            forceFullLoadPush ? 'force-full-load-push' : '',
                            direction,
                            deviceGroup].join(' ')
                    },
                    undefined,
                    util.NO_RETRY
                );
            });
    };

    return util.tryUntil(this, retry, func);
};

/**
 * Checks sync status to see if it is complete
 *
 * @param {Object}   [retryOptions]                 - Options for retrying the request.
 * @param {Integer}  [retryOptions.maxRetries]      - Number of times to retry if first try fails.
 *                                                    0 to not retry. Default 60.
 * @param {Integer}  [retryOptions.retryIntervalMs] - Milliseconds between retries. Default 10000.
 *
 * @returns {Promise} A promise which is resolved if sync is complete,
 *                    or rejected on error or recommended action.
 */
BigIpCluster.prototype.syncComplete = function syncComplete(retryOptions) {
    const retry = retryOptions || util.DEFAULT_RETRY;

    const func = function () {
        const deferred = q.defer();
        this.core.ready()
            .then(() => {
                return this.core.list('/tm/cm/sync-status', undefined, util.NO_RETRY);
            })
            .then((response) => {
                const mainStats =
                    response.entries['https://localhost/mgmt/tm/cm/sync-status/0'].nestedStats.entries;
                const toGroupTag = 'to group ';
                let detailedStats;
                let detailKeys;
                let description;
                let rejectReason;
                let toGroupIndex;

                if (mainStats.color.description === 'green') {
                    deferred.resolve();
                } else {
                    // Look for a recommended action
                    detailedStats =
                        mainStats['https://localhost/mgmt/tm/cm/syncStatus/0/details'].nestedStats.entries;
                    detailKeys = Object.keys(detailedStats);
                    for (let i = 0; i < detailKeys.length; i++) {
                        description = detailedStats[detailKeys[i]].nestedStats.entries.details.description;
                        if (description.indexOf('Recommended action') !== -1) {
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
            .catch((err) => {
                deferred.reject(err);
            })
            .done();

        return deferred.promise;
    };

    return util.tryUntil(this, retry, func);
};

module.exports = BigIpCluster;
