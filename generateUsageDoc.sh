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

cat > $USAGE_FILE << EOL
# Usage

## onboard.js

Does initial configuration and provisioning of a BIG-IP.
EOL

writeHelp scripts/onboard.js

cat >> $USAGE_FILE << EOL
## cluster.js

Sets up BIG-IPs in a cluster.
EOL

writeHelp scripts/cluster.js

cat >> $USAGE_FILE << EOL
## autoscale.js

Runs autoscale code to elect master and cluster
EOL

writeHelp scripts/autoscale.js

cat >> $USAGE_FILE << EOL
## network.js

Sets up default gateway, VLANs and self IPs
EOL

writeHelp scripts/network.js

cat >> $USAGE_FILE << EOL
## runScript.js

Runs an arbitrary script.
EOL

writeHelp scripts/runScript.js
