/**
 * Copyright 2020 F5 Networks, Inc.
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
 *
 *
 * Note: This is a light wrapper around "npm audit" to support features such as:
 * - Whitelisting specific vulnerabilities (typically until fix is released in downstream package)
 * - Providing options in package.json inside "auditProcessor" property
 *
 * Usage: node auditProcessor.js --help
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yargs = require('yargs'); // eslint-disable-line import/no-extraneous-dependencies

const PACKAGE_JSON = path.join(process.cwd(), 'package.json');
const AUDIT_REPORT = path.join(process.cwd(), '.auditReport.json');
const DEFAULT_EXIT_CODE = 0;


class AuditProcessor {
    constructor() {
        this.report = {};
        this.vulnerabilities = [];
        this.exitCode = DEFAULT_EXIT_CODE;
    }

    log(msg) { // eslint-disable-line class-methods-use-this
        console.log(msg); // eslint-disable-line no-console
    }

    /**
     * Load report - Loads "npm audit --json" output
     *
     * @returns {Void}
     */
    loadReport() {
        if (!fs.existsSync(AUDIT_REPORT)) {
            throw new Error('Please run "npm audit" first.');
        }
        this.report = JSON.parse(fs.readFileSync(AUDIT_REPORT, 'utf-8'));
    }

    /**
     * Process report
     *
     * @param {Object} options            - function options
     * @param {Array} [options.whitelist] - array containing zero or more ID's to ignore
     *
     * @returns {Void}
     */
    processReport(options) {
        options = options || {}; // eslint-disable-line no-param-reassign
        const whitelist = options.whitelist || [];

        // parse out vulnerabilities
        this.report.actions.forEach((action) => {
            action.resolves.forEach((item) => {
                this.vulnerabilities.push({
                    module: action.module,
                    path: item.path,
                    vulnerability: {
                        id: item.id,
                        url: this.report.advisories[item.id].url,
                        recommendation: this.report.advisories[item.id].recommendation
                    }
                });
            });
        });
        // determine if any vulnerabilities should be ignored
        if (whitelist.length) {
            this.vulnerabilities = this.vulnerabilities.filter(vuln =>
                !whitelist.includes(vuln.vulnerability.id)); // eslint-disable-line arrow-body-style
        }
    }

    /**
     * Notify - Determine exit code, what should be logged
     *
     * @returns {Void}
     */
    notify() {
        // check for vulnerabilities and act accordingly
        if (this.vulnerabilities.length) {
            this.log(this.vulnerabilities);
            this.log(`IMPORTANT: ${this.vulnerabilities.length} vulnerabilities exist, please resolve them!`);
            process.exit(1);
        }
        // good to go
        this.log('No dependency vulnerabilities exist!');
        process.exit(this.exitCode);
    }
}

function main() {
    const argv = yargs
        .version('1.0.0')
        .command('whitelist', 'Whitelist specific vulnerabilities by ID')
        .example('$0 --whitelist 1234,1235', 'Whitelist vulnerabilities 1234 and 1235')
        .help('help')
        .argv;

    const optionsFromConfig = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8')).auditProcessor;
    const parsedArgs = {
        whitelist: argv.whitelist || optionsFromConfig.whitelist || ''
    };

    const auditProcessor = new AuditProcessor();
    auditProcessor.loadReport();
    auditProcessor.processReport({
        whitelist: parsedArgs.whitelist.toString()
            .split(',')
            .map(item => parseInt(item, 10)) // eslint-disable-line arrow-body-style
    });
    auditProcessor.notify();
}

main();
