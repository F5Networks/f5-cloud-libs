#!/bin/bash

# This script generates the README.md file

README_FILE=README.md

writeHelp () {
    IFS=''
    node "$1" --help | while read LINE; do
        if [[ -z $LINE ]]; then
            LINE="  "
        fi
        echo "  ""$LINE" >> $README_FILE
    done
}

cat > $README_FILE << EOL
[![Build Status](https://travis-ci.org/F5Networks/f5-cloud-libs.svg?branch=master)](https://travis-ci.org/F5Networks/f5-cloud-libs)
[![Coverage Status](https://coveralls.io/repos/github/F5Networks/f5-cloud-libs/badge.svg)](https://coveralls.io/github/F5Networks/f5-cloud-libs)

# Library code and scripts for deploying BIG-IP in a cloud

This project consists of two main parts
- scripts
    - Command line scripts for configuring BIG-IP
    - These are meant to be called either directly from the command line or from cloud deployment templates
    - See usage below

- lib
    - Library code for controlling a BIG-IP
    - Called from the scripts

## Release notes
### Version 3.4.0
* Autoscale improvements
    * Handle replacing master
    * Revoke license if licensed from BIG-IQ

### Version 3.3.0
* License BIG-IP from BIG-IQ 5.2 and 5.3

### Version 3.2.0
* Support for S3 ARN for licensing via BIG-IQ

### Version 3.1.0
* Support for licensing via BIG-IQ
* Support for service discovery

### Version 3.0.1
* Add retry for password-url when licensing via BIG-IQ.

### Version 3.0.0
**This version is not backwards compatible. The format for options on network.js has changed.
See node scripts/network.js --help for details**

* License BIG-IP from BIG-IQ 5.0 and 5.1
* More options for network.js
    * Add arbitrary routes
    * Support mtu on vlans
    * Support port lockdown on self IPs
* Updates to signaling. --wait-for now means 'run if the signal has been sent' rather than 'run when the signal is sent'
* More robust reboot handling.

### Version 2.3.0
* Support for Azure autoscaling
* Support --password-url in network.js
* Restore from stored UCS

### Version 2.2.0
* Restore from saved UCS file if present in storage account

### Version 2.1.0
* Allows for autoscaling and clustering without providing a password in the template
* Adds hash verification for all downloaded files
* Fixes race condition when running multiple f5-cloud-libs scripts at once

### Version 2.0.0
* onboard.js option of --set-password is no longer available, use --update-user instead.
* All scripts that take --password now also support --password-url. Only 'file' URLs are supported for now.
* Added option to suppress console output (--no-console).
* Added support for verifying hash of downloaded f5-cloud-libs tarball.
* Added some parsing of sync messages to get sync to work more often.

## Scripts

### onboard.js

Does initial configuration and provisioning of a BIG-IP.
EOL

writeHelp scripts/onboard.js

cat >> $README_FILE << EOL
### cluster.js

Sets up BIG-IPs in a cluster.
EOL

writeHelp scripts/cluster.js

cat >> $README_FILE << EOL
### autoscale.js

Runs autoscale code to elect master and cluster
EOL

writeHelp scripts/autoscale.js

cat >> $README_FILE << EOL
### network.js

Sets up default gateway, VLANs and self IPs
EOL

writeHelp scripts/network.js

cat >> $README_FILE << EOL
### runScript.js

Runs an arbitrary script.
EOL

writeHelp scripts/runScript.js
