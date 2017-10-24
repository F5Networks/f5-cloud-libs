REPO="$1"
BRANCH="$2"
FILE="$3"

URL=${CM_BASE_URL}/${REPO}/raw/${BRANCH}/${FILE}
echo URL "$URL"

pushd "$(dirname "$0")"

if [ `uname` == 'Darwin' ]; then
    SED_ARGS="-E -i .bak"
else
    SED_ARGS="-r -i"
fi

# grab the file name from the last part of the relative file path
FILE_NAME=${FILE##*/}
echo FILE_NAME "$FILE_NAME"

# download the file and calculate hash
DOWNLOAD_LOCATION=/tmp/"$FILE_NAME"
curl -s --insecure -o "$DOWNLOAD_LOCATION" "$URL"

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
