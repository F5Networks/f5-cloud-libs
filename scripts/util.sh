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

# generic init utils

# Wait for process settings
STATUS_CHECK_RETRIES=60
STATUS_CHECK_INTERVAL=10

function wait_for_bigip() {
    echo "** BigIP waiting ..."
    bigstart_wait mcpd ready
    while ! tmsh show sys mcp-state field-fmt | grep -qE 'phase.+running' || pidof -x mprov.pl >/dev/null 2>&1; do sleep 1; done
    if [[ ! $(getdb Provision.CPU.asm) == 0 ]]; then perl -MF5::ASMReady -e '$|++; do {print "waiting for asm...\n"; sleep(1)} while !F5::ASMReady::is_asm_ready()'; fi
    echo "** BigIp ready."
}

# check if MCP is running
function wait_mcp_running() {
    failed=0

    while true; do
        mcp_started=$(bigstart_wb mcpd start)

        if [[ $mcp_started == released ]]; then
            # this will log an error when mcpd is not up
            tmsh -a show sys mcp-state field-fmt | grep -q running

            if [[ $? == 0 ]]; then
                echo "Successfully connected to mcpd."
                return 0
            fi
        fi

        failed=$(($failed + 1))

        if [[ $failed -ge $STATUS_CHECK_RETRIES ]]; then
            echo "Failed to connect to mcpd after $failed attempts, quitting."
            return 1
        fi

        echo "Could not connect to mcpd (attempt $failed/$STATUS_CHECK_RETRIES), retrying in $STATUS_CHECK_INTERVAL seconds."
        sleep $STATUS_CHECK_INTERVAL
    done
}

# Get the management IP address. Need to wait till it's available via ifconfig
# since tmsh will have the DHCP address before the correct management IP is ready
# Then need wait till tmsh agrees since that is updated after the nic is configured
function wait_for_management_ip() {
    RETRY_INTERVAL=10
    MAX_TRIES=60
    failed=0

    # Prior to BIG-IP v13, single NIC hosts have eth0 configured, v13 and later
    # use mgmt
    if ! ifconfig mgmt &> /dev/null; then
        NIC=eth0
    else
        NIC=mgmt
    fi

    while true; do
        MGMT_ADDR_TMSH=$(tmsh list sys management-ip | awk '/management-ip/ {print $3}' | awk -F "/" '{print $1}')
        MGMT_ADDR_ETH0=$(ifconfig $NIC | egrep "inet addr" | awk -F: '{print $2}' | awk '{print $1}')

        if [[ $MGMT_ADDR_TMSH != $MGMT_ADDR_ETH0 ]]; then
            echo "Management IP and $NIC not yet in sync."
        elif [ -n $MGMT_ADDR_TMSH ]; then
            MGMT_ADDR=$MGMT_ADDR_TMSH
            return 0
        fi

        if [[ $failed -ge $MAX_TRIES ]]; then
            echo "Failed to get management IP after $failed attempts."
            return 1
        fi

        ((failed=failed+1))
        sleep $RETRY_INTERVAL
    done
}
