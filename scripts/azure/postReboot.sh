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

# Remove ourselves from the startup script
sed -i '/postReboot.sh/d' /config/startup
cd /config/f5-cloud-libs
f5-rest-node scripts/onboard.js --host 127.0.0.1 -u admin

# This is where we can do something like run an iApp
cat "OK" > /config/blackbox.status
