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

tar -C .. --exclude=".git*" --exclude=".DS_Store" --exclude="npm-debug.log" --exclude="test" --exclude="${PWD##*/}/dist" --exclude="build" --exclude="doc" --exclude="gitHooks" -cvf dist/f5-cloud-libs.tar f5-cloud-libs
# Suppress gzips timetamp in the tarball - otherwise the digest hash changes on each
# commit even if the contents do not change. This causes an infinite loop in the build scripts
# due to packages triggering each other to uptdate hashes.
gzip -nf dist/f5-cloud-libs.tar

pushd dist
hash=`openssl dgst -sha512 f5-cloud-libs.tar.gz | cut -d ' ' -f 2`
sed $SED_ARGS "s/set hashes\(f5-cloud-libs.tar.gz\) .*/set hashes\(f5-cloud-libs.tar.gz\) $hash/" verifyHash
sed $SED_ARGS "/script-signature/d" verifyHash
rm -f verifyHash.bak
popd
