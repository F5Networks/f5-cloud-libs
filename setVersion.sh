#!/bin/bash

if [ -z $1 ]; then
    echo 'Usage: setVersion.sh <version>'
    exit
fi

if [ `uname` == 'Darwin' ]; then
    SED_ARGS="-E -i .bak"
else
    SED_ARGS="-r -i"
fi

sed $SED_ARGS "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$1\"/" package.json
sed $SED_ARGS "s/version\('[0-9]+\.[0-9]+\.[0-9]+'\)/version(\'$1\')/" scripts/commonOptions.js

rm -f package.json.bak
rm -f scripts/commonOptions.js.bak