sed -i '/postReboot.sh/d' /config/startup
cd /config/f5-cloud-libs
f5-rest-node onboard.js --host 127.0.0.1 -u admin --foreground

# This is where we can do something like run an iApp
cat "OK" > /config/blackbox.status
