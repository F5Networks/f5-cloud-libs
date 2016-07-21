#!/bin/bash

# Azure does not provide a way of executing multip commands in its CustomScriptForLinux extension.
# The recommended way of running multiple commands is to put them in a script and run the script.
# This is that script.

# This script expects that both the gzipped f5-cloud-libs directory AND the
# this script on its own (f5-cloud-libs/azure/runSetup.sh) have been downloaded
# to the current directory.

# Call this script with the arguments that should be passed to setup.js

gzip xf f5-cloud-libs.tar.gz
cd f5-cloud-libs
f5-rest-node setup.js "$*"
