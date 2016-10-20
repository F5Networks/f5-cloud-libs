#!/bin/bash

# Copyright 2016 F5 Networks, Inc.
# This software may be modified and distributed under the terms
# of the MIT license.  See the LICENSE file for details.

# Single argument should be 'dev' or 'archive'. Default is 'archive'.

ENVIRONMENT=archive
if [ -n "$1" ]; then
    ENVIRONMENT=$1
fi

echo GOT ENVIRONMENT $ENVIRONMENT
pushd ../
tar --exclude=".git*" --exclude="test" --exclude="doc" --exclude="nodeunit" --exclude="jshint" -zcvf f5-cloud-libs.tar.gz f5-cloud-libs
azure storage blob upload --quiet f5-cloud-libs.tar.gz $ENVIRONMENT f5-cloud-libs.tar.gz
azure storage blob upload --quiet f5-cloud-libs/scripts/azure/runScripts.js $ENVIRONMENT runScripts.js
azure storage blob upload --quiet f5-cloud-libs/scripts/deployHttp.sh $ENVIRONMENT deployHttp.sh
popd
