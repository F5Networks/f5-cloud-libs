#!/bin/bash

# Copyright 2016-2017 F5 Networks, Inc.
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

USAGE_SHORT="Usage: $0"
read -r -d '' USAGE_LONG << EOM
    Usage: $0
        -h|--help         Print this message and exit.
EOM

ARGS=`getopt -o h --long help -n $0 -- "$@"`
if [ $? -ne 0 ]; then
    echo $USAGE_SHORT
    exit
fi

eval set -- "$ARGS"

# Defaults
HELP=false

# Parse the command line arguments
while true; do
    case "$1" in
        -h|--help)
            HELP=true;
            shift ;;
        --)
            shift
            break;;
    esac
done

if [ $HELP = true ]; then
    echo "$USAGE_LONG"
    exit
fi

. ../util.sh

function wait_for_cidr_block() {
    RETRY_INTERVAL=2
    MAX_TRIES=60
    failed=0

    GATEWAY_CIDR_BLOCK=$(curl http://169.254.169.254/latest/meta-data/network/interfaces/macs/${GATEWAY_MAC}/subnet-ipv4-cidr-block)
    while [ -z "$GATEWAY_CIDR_BLOCK" ] && [[ $failed -lt $MAX_TRIES ]]; do
        sleep $RETRY_INTERVAL
        ((failed=failed+1))
        GATEWAY_CIDR_BLOCK=$(curl http://169.254.169.254/latest/meta-data/network/interfaces/macs/${GATEWAY_MAC}/subnet-ipv4-cidr-block)
    done
}

if ! wait_mcp_running; then
    echo "mcpd not ready in time."
    exit 1
fi

if ! wait_for_management_ip; then
    echo "Could not get management ip."
    exit 1
fi

echo MGMT_ADDR: "$MGMT_ADDR"

# Get the Gateway info
GATEWAY_MAC=$(ifconfig eth0 | egrep HWaddr | awk '{print tolower($5)}')
echo GATEWAY_MAC: "$GATEWAY_MAC"

wait_for_cidr_block
echo GATEWAY_CIDR_BLOCK: "$GATEWAY_CIDR_BLOCK"

GATEWAY_NET=${GATEWAY_CIDR_BLOCK%/*}
echo GATEWAY_NET: "$GATEWAY_NET"

GATEWAY_PREFIX=${GATEWAY_CIDR_BLOCK#*/}
echo GATEWAY_PREFIX: "$GATEWAY_PREFIX"

GATEWAY=`echo $GATEWAY_NET | awk -F. '{ printf "%d.%d.%d.%d", $1, $2, $3, $4+1 }'`
echo GATEWAY: "$GATEWAY"

# Create the network
echo tmsh create net vlan external interfaces add { 1.0 }
tmsh create net vlan external interfaces add { 1.0 }

echo tmsh create net self "$MGMT_ADDR"/$GATEWAY_PREFIX vlan external allow-service default
tmsh create net self "$MGMT_ADDR"/$GATEWAY_PREFIX vlan external allow-service default

echo tmsh create sys folder /LOCAL_ONLY device-group none traffic-group traffic-group-local-only
tmsh create sys folder /LOCAL_ONLY device-group none traffic-group traffic-group-local-only

echo tmsh create net route /LOCAL_ONLY/default network default gw "$GATEWAY"
tmsh create net route /LOCAL_ONLY/default network default gw "$GATEWAY"

# Added for bug#664393
GW_SET=false
while [ $GW_SET == false ] 
do
    if ! route -n|grep '^0.0.0.0.*external$' &> /dev/null; then
        echo tmsh delete net route /LOCAL_ONLY/default
        tmsh delete net route /LOCAL_ONLY/default
        echo tmsh create net route /LOCAL_ONLY/default network default gw "$GATEWAY"
        tmsh create net route /LOCAL_ONLY/default network default gw "$GATEWAY"
    else
        GW_SET=true
    fi
    echo "GW_SET = $GW_SET"
done