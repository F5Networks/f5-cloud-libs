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

# absolute path to utilities
MKDIR=/bin/mkdir
MOUNT=/bin/mount
RMDIR=/bin/rmdir
UMOUNT=/bin/umount
NODE=/usr/bin/f5-rest-node
SHA512SUM=/usr/bin/sha512sum
BASE64=/usr/bin/base64
CRACKLIB=/usr/sbin/cracklib-check

# need to get absolute location when being sourced
SCRIPTS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# creates a directory for in-memory files
# usage: create_temp_dir name size
function create_temp_dir() {
    $MKDIR "$1"
    $MOUNT -t tmpfs -o size="$2",mode=1700 tmpfs "$1"
}

# usage: remove_temp_dir name
function remove_temp_dir() {
    $UMOUNT "$1"
    $RMDIR "$1"
}

# usage: wipe_temp_dir name
function wipe_temp_dir() {
    FILES=$(ls -1 "$1")

    for f in $FILES; do
        shred --remove "${1}/${f}"
    done

    remove_temp_dir "$1"
}

function get_software_version() {
    echo $(tmsh show sys version | grep Version | sed -n 2p | awk '{print $2}')
}

function get_os_major_version() {
    echo $(rpm -q --queryformat '%{VERSION}' centos-release)
}

# usage: get_private_key_path folder_containing_private_key name_of_key
function get_private_key_path() {
    PRIVATE_KEY_DIR=/config/filestore/files_d/${1}_d/certificate_key_d/
    FILES=$(ls -1t "$PRIVATE_KEY_DIR")

    KEY_FILE_PREFIX=":${1}:${2}";

    for f in $FILES; do
        if [[ "$f" == ${KEY_FILE_PREFIX}* ]]; then
            echo ${PRIVATE_KEY_DIR}${f}
            break
        fi
    done
}

function get_private_key_suffix() {
    VERSION=$(get_software_version)
    MAJOR_VERSION=$(echo $VERSION | cut -d'.' -f1)
    if [[ $MAJOR_VERSION -ge 14 ]]; then
        echo -n
    else
        echo -n .key
    fi
}

# usage: encrypt_secret secret out_file scramble symmetric return
# returns: optionally returns the secret that was encrypted
function encrypt_secret() {
    # input
    secret="$1"
    out_file="$2"
    scramble="$3"
    symmetric="$4"
    ret="$5"

    tmp_file='/mnt/cloudTmp/.tmp'
    tmp_dir=$(dirname $tmp_file)
    no_console=""
    counter=0

    create_temp_dir $tmp_dir
    if [ -n "$scramble" ]; then
        secret=$(echo ${secret} | $SHA512SUM | cut -d ' ' -f 1 | $BASE64 -w0)
        test_secret=$(echo ${secret} | $CRACKLIB | cut -d ' ' -f2)
        while [ "${test_secret}" != "OK" ]; do
            counter=$((counter + 1))
            secret=$(echo ${secret}${counter} | $SHA512SUM | cut -d ' ' -f 1 | $BASE64 -w0)
            test_secret=$(echo ${secret} | $CRACKLIB | cut -d ' ' -f2)
            if [ ${counter} == 30 ]; then
                echo "30 attempts tried but failed to generate a safe password"
                return 1
            fi
        done
    fi

    echo -n $secret > $tmp_file

    # call encrypt data to file
    if [ -n "$symmetric" ]; then
        symmetric="--symmetric"
    fi
    if [ -n "$ret" ]; then
        no_console="--no-console"
    fi
    $NODE $SCRIPTS_DIR/encryptDataToFile.js --data-file $tmp_file --out-file $out_file $symmetric $no_console
    wipe_temp_dir $tmp_dir

    # return secret (certain tasks may require this)
    if [ -n "$ret" ]; then
        echo -n $secret
    fi
}

# usage: format_args unit-of-measure:yearly,sku-keyword-1:1G,sku-keyword-2:BT
# returns: --unit-of-measure yearly --sku-keyword-1 1G --sku-keyword-2 BT
function format_args() {
    INPUT="$1"
	CMD=""

    for i in ${INPUT//,/ }; do
		parsed=(${i//:/ })
		# if empty or optional, exit
		if [ -z ${parsed[1]} ] || [[ ${parsed[1]^^} == "OPTIONAL" ]]; then
			return
		else
			CMD+="--${parsed[0]} ${parsed[1]} "
		fi
    done
    # return formatted argument
	echo $CMD
}

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
        # Centos 7 updated ifconfig format
        OS_MAJOR_VERSION=$(get_os_major_version)
        if [ $OS_MAJOR_VERSION -ge "7" ]; then
            MGMT_ADDR_ETH0=$(ifconfig $NIC | egrep "inet" | egrep -v "inet6" | awk 'BEGIN { FS = " "}; { print $2}')
        else
            MGMT_ADDR_ETH0=$(ifconfig $NIC | egrep "inet addr" | awk -F: '{print $2}' | awk '{print $1}')
        fi

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

