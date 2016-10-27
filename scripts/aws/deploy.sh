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

# Single argument should be 'dev' if you want the dev environment.

if [ -n "$1" ]; then
    ENVIRONMENT=$1
fi

if [ -n "$ENVIRONMENT" ] && [ "$ENVIRONMENT" != "dev" ]; then
    echo dev is the only option allowed. For prod environment, do not use an argument
    exit 1
fi

DIRECTORY='f5-cloud-libs'
if [ -n "$ENVIRONMENT" ]; then
    DIRECTORY=$DIRECTORY-$ENVIRONMENT
fi

echo Pushing to $DIRECTORY

pushd ../
tar --exclude=".git*" --exclude="test" --exclude="doc" --exclude="nodeunit" --exclude="jshint" -zcvf f5-cloud-libs.tar.gz f5-cloud-libs
aws s3 cp f5-cloud-libs.tar.gz s3://$DIRECTORY/f5-cloud-libs.tar.gz --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers
popd
