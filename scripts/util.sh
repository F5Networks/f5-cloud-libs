#!/bin/bash

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
