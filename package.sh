#!/bin/bash

TAR_EXCLUDES="--exclude=${PWD##*/}/dist --exclude=${PWD##*/}/build --exclude=${PWD##*/}/test \
--exclude=${PWD##*/}/coverage --exclude=${PWD##*/}/coverage --exclude=.git* --exclude=.vscode  --exclude=.tarignore"
if [ `uname` == 'Darwin' ]; then
    SED_ARGS="-E -i .bak"
    EXTRA_TAR_ARGS=$TAR_EXCLUDES
else
    SED_ARGS="-r -i"
    EXTRA_TAR_ARGS="--owner=root --group=root ${TAR_EXCLUDES}"
fi

if [[ $1 == '--no-deps' ]]; then
    rm -rf node_modules
    npx npm-force-resolutions
    npm install --production
fi

# set perms for non-directories in the current directory
ls -p | grep -v / | xargs chmod 644
chmod 744 *.sh

# set other perms
chmod 755 .
chmod 755 scripts
chmod 755 lib
chmod -R 744 scripts/*
chmod -R 644 scripts/*.js
chmod -R 644 lib/*

tar -C .. $EXTRA_TAR_ARGS -cf dist/f5-cloud-libs.tar f5-cloud-libs

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

