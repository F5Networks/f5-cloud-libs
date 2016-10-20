#!/bin/bash

# Copyright 2016 F5 Networks, Inc.
# This software may be modified and distributed under the terms
# of the MIT license.  See the LICENSE file for details.

# For DNS name servers, AWS uses the CIDR of an interface +2 on the last octet
# To use this script, pass in the name of the external interface

INTERFACE=$1
INTERFACE_MAC=`ifconfig ${INTERFACE} | egrep HWaddr | awk '{print tolower($5)}'`
VPC_CIDR_BLOCK=`curl -s http://169.254.169.254/latest/meta-data/network/interfaces/macs/${INTERFACE_MAC}/vpc-ipv4-cidr-block`
VPC_NET=${VPC_CIDR_BLOCK%/*}
NAME_SERVER=`echo ${VPC_NET} | awk -F. '{ printf "%d.%d.%d.%d", $1, $2, $3, $4+2 }'`
echo $NAME_SERVER
