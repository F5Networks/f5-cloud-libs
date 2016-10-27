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
