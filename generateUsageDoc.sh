#!/bin/bash

# This script generates the USAGE.md file

USAGE_FILE=USAGE.md

writeHelp () {
    IFS=''
    node "$1" --help | while read LINE; do
        if [[ -z $LINE ]]; then
            LINE="  "
        fi
        echo "  ""$LINE" >> $USAGE_FILE
    done
}

# onboard
cat > $USAGE_FILE << EOL
# Usage

## onboard.js

Does initial configuration and provisioning of a BIG-IP.
EOL

writeHelp scripts/onboard.js

# cluster
cat >> $USAGE_FILE << EOL
## cluster.js

Sets up BIG-IPs in a cluster.
EOL

writeHelp scripts/cluster.js

# autoscale
cat >> $USAGE_FILE << EOL
## autoscale.js

Runs autoscale code to elect master and cluster
EOL

writeHelp scripts/autoscale.js

# network
cat >> $USAGE_FILE << EOL
## network.js

Sets up default gateway, VLANs and self IPs
EOL

writeHelp scripts/network.js

#runScript
cat >> $USAGE_FILE << EOL
## runScript.js

Runs an arbitrary script.
EOL

writeHelp scripts/runScript.js

# standalone licensing
cat >> $USAGE_FILE << EOL
## Standalone licensing

### Install
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# run util bash -c "mkdir -p /config/licensing; cd /config/licensing; npm --loglevel=error install @f5devcentral/f5-cloud-libs"

### License from BIG-IQ
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# license path <install_path> password <big_ip_admin_password> big-iq-host <big_iq_ip_address> big-iq-user <big_iq_admin_user> big-iq-password <big_iq_admin_password> license-pool-name <license_pool>

### Issue revoke request to BIG-IQ
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# license path <install_path> password <big_ip_admin_password> big-iq-host <big_iq_ip_address> big-iq-user <big_iq_admin_user> big-iq-password <big_iq_admin_password> license-pool-name <license_pool> revoke

### Other licensing options
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# license help
EOL
