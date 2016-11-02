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
