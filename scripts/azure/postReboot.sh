#!/bin/bash

# Remove ourselves from the startup script
sed -i '/postReboot.sh/d' /config/startup
cd /config/f5-cloud-libs
f5-rest-node scripts/onboard.js --host 127.0.0.1 -u admin

# This is where we can do something like run an iApp
cat "OK" > /config/blackbox.status
