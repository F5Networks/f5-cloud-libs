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

const INSTANCE_STATUS_BECOMING_MASTER = 'BECOMING_MASTER';
const INSTANCE_STATUS_OK = 'OK';

class AutoscaleInstance {
    constructor() {
        this.privateIp = undefined;
        this.publicIp = undefined;
        this.mgmtIp = undefined;
        this.hostname = undefined;
        this.machineId = undefined;
        this.isMaster = false;
        this.providerVisible = true;
        this.status = INSTANCE_STATUS_OK;
        this.versionOk = true;
        this.external = false;
        this.version = undefined;
        this.lastBackup = new Date(1970, 1, 1).getTime();
    }

    static get INSTANCE_STATUS_BECOMING_MASTER() {
        return INSTANCE_STATUS_BECOMING_MASTER;
    }

    static get INSTANCE_STATUS_OK() {
        return INSTANCE_STATUS_OK;
    }

    setExternal(external) {
        this.external = typeof external === 'undefined' ? true : external;
        return this;
    }

    setHostname(hostname) {
        this.hostname = hostname;
        return this;
    }

    setMachineId(machineId) {
        this.machineId = machineId;
        return this;
    }

    setIsMaster(isMaster) {
        this.isMaster = typeof isMaster === 'undefined' ? true : isMaster;
        return this;
    }

    setLastBackup(date) {
        this.lastBackup = date || Date.now();
        return this;
    }

    setMgmtIp(mgmtIp) {
        this.mgmtIp = mgmtIp;
        return this;
    }

    setPrivateIp(privateIp) {
        this.privateIp = privateIp;
        return this;
    }

    setProviderVisible(providerVisible) {
        this.providerVisible = typeof providerVisible === 'undefined' ? true : providerVisible;
        return this;
    }

    setPublicIp(publicIp) {
        this.publicIp = publicIp;
        return this;
    }

    setStatus(status) {
        this.status = status;
        return this;
    }

    setVersion(version) {
        this.version = version;
        return this;
    }

    setVersionOk(versionOk) {
        this.versionOk = typeof versionOk === 'undefined' ? true : versionOk;
        return this;
    }
}

module.exports = AutoscaleInstance;
