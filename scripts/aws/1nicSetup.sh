#!/bin/bash

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
MGMT_IP=''
GATEWAY_IP=''
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

/usr/bin/setdb provision.1nicautoconfig disable

wait_mcp_running
if [ $? -ne 0 ]; then
    echo "mcpd not ready in time."
    exit 1
fi

# Get the management IP address. Need to wait till it's available via ifconfig
# since tmsh will have the DHCP address before the correct management IP is ready
function wait_for_management_ip() {
    RETRY_INTERVAL=10
    MAX_TRIES=60
    failed=0

    while true; do
        MGMT_ADDR=`ifconfig eth0 | egrep "inet addr" | awk -F: '{print $2}' | awk '{print $1}'`
        if [[ $mgmt_ip == *"error"* ]]; then
            echo "eth0 not found yet."
            failed=$(($failed + 1))
        elif [ -n $MGMT_ADDR ]; then
            return 0
        fi

        if [[ $failed -ge $MAX_TRIES ]]; then
            echo "Failed to get management IP after $failed attempts."
            return 1
        fi

        sleep $RETRY_INTERVAL
    done
}

wait_for_management_ip
if [ $? -ne 0 ]; then
    echo "Cound not get management ip."
    exit 1
fi

echo MGMT_ADDR: "$MGMT_ADDR"

# Get the Gateway info
GATEWAY_MAC=`ifconfig eth0 | egrep HWaddr | awk '{print tolower($5)}'`
echo GATEWAY_MAC: "$GATEWAY_MAC"

GATEWAY_CIDR_BLOCK=`curl http://169.254.169.254/latest/meta-data/network/interfaces/macs/${GATEWAY_MAC}/subnet-ipv4-cidr-block`
echo GATEWAY_CIDR_BLOCK: "$GATEWAY_CIDR_BLOCK"

GATEWAY_NET=${GATEWAY_CIDR_BLOCK%/*}
echo GATEWAY_NET: "$GATEWAY_NET"

GATEWAY=`echo $GATEWAY_NET | awk -F. '{ printf "%d.%d.%d.%d", $1, $2, $3, $4+1 }'`
echo GATEWAY: "$GATEWAY"

# Create the network
echo tmsh create net vlan external interfaces add { 1.0 }
tmsh create net vlan external interfaces add { 1.0 }

echo tmsh create net self "$MGMT_ADDR"/24 vlan external allow-service default
tmsh create net self "$MGMT_ADDR"/24 vlan external allow-service default

echo tmsh create sys folder /LOCAL_ONLY device-group none traffic-group traffic-group-local-only
tmsh create sys folder /LOCAL_ONLY device-group none traffic-group traffic-group-local-only

echo tmsh create net route /LOCAL_ONLY/default network default gw "$GATEWAY"
tmsh create net route /LOCAL_ONLY/default network default gw "$GATEWAY"
