#!/bin/bash

CLUSTER_ARGS="$@"
LOG_FILE='/var/log/runCluster.log'
echo "Waiting..." > $LOG_FILE

# Wait for a USR1 signal then run postOnboard
runCluster() {
    echo "Got signal. Running cluster script." >> $LOG_FILE

    scripts/azure/postOnboard.sh &
    pidToSignal=$!
    f5-rest-node scripts/cluster.js $CLUSTER_ARGS --signal $pidToSignal
}

trap "runCluster" SIGUSR1

COUNT=0

# Try for 30 minutes
while [ $COUNT -lt 1800 ]; do
    COUNT=$((COUNT + 1))
    sleep 1
done

echo "Never got signal" >> $LOG_FILE
