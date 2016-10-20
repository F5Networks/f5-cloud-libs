#!/bin/bash

# Copyright 2016 F5 Networks, Inc.
# This software may be modified and distributed under the terms
# of the MIT license.  See the LICENSE file for details.

# Remove ourselves from the startup script
sed -i '/postReboot.sh/d' /config/startup
cd /config/f5-cloud-libs
f5-rest-node scripts/onboard.js --host 127.0.0.1 -u admin

# This is where we can do something like run an iApp
cat "OK" > /config/blackbox.status
