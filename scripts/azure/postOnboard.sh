#!/bin/bash

# Copyright 2016 F5 Networks, Inc.
# This software may be modified and distributed under the terms
# of the MIT license.  See the LICENSE file for details.

LOG_FILE='/var/log/postOnboard.log'
echo "Waiting..." > $LOG_FILE

# Wait for a USR1 signal (as sent by onboard.js) then see
# if we need to reboot
checkForReboot() {
    echo "Got signal" >> $LOG_FILE
    grep "Reboot required" /var/log/onboard.log
    if [ $? -eq 0 ]; then
        chmod +w /config/startup
        echo "/config/f5-cloud-libs/scripts/azure/postReboot.sh" >> /config/startup
        echo "Rebooting..." >>$LOG_FILE
        reboot
    else
        # This is where we can do something like run an iApp
        echo "OK" > /config/onboard.status
        echo "All done" >> $LOG_FILE
        exit
    fi
}

trap "checkForReboot" SIGUSR1

COUNT=0

# Try for 30 minutes
while [ $COUNT -lt 1800 ]; do
    COUNT=$((COUNT + 1))
    sleep 1
done

echo "Never got signal" >> $LOG_FILE
