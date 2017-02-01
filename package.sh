#!/bin/bash
if [ `uname` == 'Darwin' ]; then
    SED_ARGS="-E -i .bak"
else
    SED_ARGS="-r -i"
fi

rm -rf node_modules
npm install --production
tar -C .. --exclude=".git*" --exclude="test" --exclude="dist" --exclude="doc" -zcvf dist/f5-cloud-libs.tar.gz f5-cloud-libs
pushd dist
hash=`openssl dgst -sha512 f5-cloud-libs.tar.gz | cut -d ' ' -f 2`
sed $SED_ARGS "s/set expected_hash .*/set expected_hash $hash/" verifyHash
sed $SED_ARGS "/script-signature/d" verifyHash
rm -f verifyHash.bak
popd
