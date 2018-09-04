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

# For DNS name servers, AWS uses the CIDR of an interface +2 on the last octet
# To use this script, pass in the name of the external interface

. /config/cloud/aws/node_modules/f5-cloud-libs/scripts/util.sh

if ! wait_for_management_ip; then
    echo "Could not get management ip."
    exit 1
fi

INTERFACE=$1
# Centos 7 updated ifconfig format
OS_MAJOR_VERSION=$(get_os_major_version)
if [ $OS_MAJOR_VERSION -ge "7" ]; then
    INTERFACE_MAC=$(ifconfig ${INTERFACE} | egrep ether | awk '{print tolower($2)}')
else
    INTERFACE_MAC=`ifconfig ${INTERFACE} | egrep HWaddr | awk '{print tolower($5)}'`
fi
VPC_CIDR_BLOCK=`curl -s http://169.254.169.254/latest/meta-data/network/interfaces/macs/${INTERFACE_MAC}/vpc-ipv4-cidr-block`
VPC_NET=${VPC_CIDR_BLOCK%/*}
NAME_SERVER=`echo ${VPC_NET} | awk -F. '{ printf "%d.%d.%d.%d", $1, $2, $3, $4+2 }'`
echo $NAME_SERVER
