#!/bin/bash
if [ `uname` == 'Darwin' ]; then
    SED_ARGS="-E -i .bak"
else
    SED_ARGS="-r -i"
fi

if [[ $1 == '--no-deps' ]]; then
    rm -rf node_modules
    npm install --production
fi

tar -C .. --exclude=".git*" --exclude="test" --exclude="${PWD##*/}/dist" --exclude="doc" -zcvf dist/f5-cloud-libs.tar.gz f5-cloud-libs
pushd dist
hash=`openssl dgst -sha512 f5-cloud-libs.tar.gz | cut -d ' ' -f 2`
sed $SED_ARGS "s/set hashes\(f5-cloud-libs.tar.gz\) .*/set hashes\(f5-cloud-libs.tar.gz\) $hash/" verifyHash
sed $SED_ARGS "/script-signature/d" verifyHash
rm -f verifyHash.bak
popd
