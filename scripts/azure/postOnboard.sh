#!/bin/bash

# Copyright 2016 F5 Networks, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
