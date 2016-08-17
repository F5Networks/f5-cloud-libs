#!/bin/bash

# Azure does not provide a way of executing multiple commands in its
# CustomScriptForLinux extension. The recommended way of running multiple
# commands is to put them in a script and run the script.
# This is that script.

# The arguments to this script are passed to onboard.js and cluster.js

# Example:
# runOnboard.sh --onboard "--host 127.0.0.1 --user admin --license ..." --cluster "--join-group myGroup --sync ..."

# If our mods to node-icontrol are pushed to npm, we can push
# f5-cloud-libs to npm as well and use npm here instead

ARGS=`getopt -o o:c: --long onboard:,cluster: -n $0 -- "$@"`
eval set -- "$ARGS"

# Defaults for optional argutments
onboardArgs=''
clusterArgs=''

# Parse the command line arguments
while true; do
    case "$1" in
        -o|--onboard)
            onboardArgs=$2
            shift 2;;
        -c|--cluster)
            clusterArgs=$2
            shift 2;;
        --)
            shift
            break;;
    esac
done

cd /config
curl -sk -o f5-cloud-libs.tar.gz https://f5cloudlibs.blob.core.windows.net/archive/f5-cloud-libs.tar.gz
tar -xzf f5-cloud-libs.tar.gz
rm f5-cloud-libs.tar.gz
rm -f /var/log/onboard.log
cd f5-cloud-libs
scripts/azure/runCluster.sh $clusterArgs &
pidToSignal=$!
f5-rest-node scripts/onboard.js $onboardArgs --no-reboot --signal $pidToSignal
