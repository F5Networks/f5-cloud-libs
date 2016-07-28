#!/bin/bash

# Azure does not provide a way of executing multiple commands in its
# CustomScriptForLinux extension. The recommended way of running multiple
# commands is to put them in a script and run the script.
# This is that script.

# The arguments to this script are passed to setup.js as is.

# Example:
# runSetup.sh --host 127.0.0.1 --user admin --license ...

# If our mods to node-icontrol are pushed to npm, we can push
# f5-cloud-libs to npm as well and use npm here instead
curl -s -o f5-cloud-libs.tar.gz https://f5cloudlibs.blob.core.windows.net/archive/f5-cloud-libs.tar.gz

tar -xzf f5-cloud-libs.tar.gz
cd f5-cloud-libs
f5-rest-node setup.js "$@"