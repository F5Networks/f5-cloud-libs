PROJECT_ID="$1"
REPO="$2"
BRANCH="$3"
FILE="$4"

RELEASE=^release-.*
HOTFIX=^hf-.*

if [ `uname` == 'Darwin' ]; then
    SED_ARGS="-E -i .bak"
else
    SED_ARGS="-r -i"
fi

# grab the file name from the last part of the relative file path
FILE_NAME=${FILE##*/}
echo FILE_NAME "$FILE_NAME"
DOWNLOAD_LOCATION=/tmp/"$FILE_NAME"

if [[ "$BRANCH" =~ $RELEASE || "$BRANCH" =~ $HOTFIX ]]; then
    echo Using build artifact
    URL="https://gitswarm.example.com/api/v3/projects/${PROJECT_ID}/builds/artifacts/$BRANCH/download?job=package"
    echo URL "$URL"
    curl -s --insecure -o "$DOWNLOAD_LOCATION" -H "PRIVATE-TOKEN: $API_TOKEN" "$URL"
else
    echo Using dist directory
    URL=${CM_BASE_URL}/${REPO}/raw/${BRANCH}/${FILE}
    echo URL "$URL"
    curl -s --insecure -o "$DOWNLOAD_LOCATION" "$URL"
fi

pushd "$(dirname "$0")"

OLD_HASH=$(grep "$FILE_NAME" ../dist/verifyHash | awk '{print $3}')
NEW_HASH=$(openssl dgst -sha512 "$DOWNLOAD_LOCATION" | cut -d ' ' -f 2)
echo OLD_HASH "$OLD_HASH"
echo NEW_HASH "$NEW_HASH"

if [[ -z "$NEW_HASH" ]]; then
    echo 'No hash generated'
    exit 1
fi

if [[ "$OLD_HASH" == "$NEW_HASH" ]]; then
    echo 'No change in hash'
    exit 0
fi

echo Updating dist/verifyHash

# update the hash
sed $SED_ARGS "s/set hashes\($FILE_NAME\) .*/set hashes\($FILE_NAME\) $NEW_HASH/" ../dist/verifyHash

# strip off the signature
sed $SED_ARGS "/script-signature/d" ../dist/verifyHash

#cleanup
rm -f DOWNLOAD_LOCATION
rm -f verifyHash.bak

popd
