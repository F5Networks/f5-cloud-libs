#!/bin/bash

# if nothing changed, we're done
NUM_FILES_CHANGED=$(git diff --name-only | wc -l)
if [[ $NUM_FILES_CHANGED == 0 ]]; then
    echo No files changed
    exit 0
fi

pushd "$(dirname "$0")"

echo Commiting and pushing dist/verifyHash
CONTENT=$(<../dist/verifyHash)
curl -s --insecure -X PUT -F private_token="$API_TOKEN" -F file_path="dist/verifyHash" -F branch_name="$CI_BUILD_REF_NAME" -F commit_message="update hash" -F content="$CONTENT" ${CI_BASE_URL}/$CI_PROJECT_ID/repository/files

popd
