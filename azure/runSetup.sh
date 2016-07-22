#!/bin/bash

# Azure does not provide a way of executing multiple commands in its
# CustomScriptForLinux extension. The recommended way of running multiple
# commands is to put them in a script and run the script.
# This is that script.

# This script expects that both the gzipped f5-cloud-libs directory AND this
# script on its own (f5-cloud-libs/azure/runSetup.sh) have been downloaded
# to the current directory.

# When pulling from github, the gzipped f5-clod-libs will be of the form
# f5-cloud-libs-<branch>, so branch should be the first argument to this script.
# The rest of the arguments are passed to setup.js as is.

# Example:
# runSetup.sh develop --host 127.0.0.1 --user admin --license ...

# If we get node-icontrol and f5-cloud-libs in npm, then this part won't be necessary...
npm install commander
npm install q
pushd node_modules > /dev/null
curl -o node-icontrol.tar.gz --location https://github.com/seattlevine/node-icontrol/archive/develop.tar.gz
tar -xzf node-icontrol.tar.gz
mv node-icontrol-develop icontrol
popd > /dev/null

tar -xzf $1.tar.gz
cd f5-cloud-libs-$1
shift
f5-rest-node setup.js "$*"
