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

sed $SED_ARGS "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.?[0-9]?)?\"/\"version\": \"$1\"/" package.json
sed $SED_ARGS "s/version\('[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.?[0-9]?)?'\)/version(\'$1\')/" scripts/commonOptions.js
sed $SED_ARGS "s/version\('[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.?[0-9]?)?'\)/version(\'$1\')/" scripts/network.js
sed $SED_ARGS "s/version\('[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.?[0-9]?)?'\)/version(\'$1\')/" scripts/runScript.js
sed $SED_ARGS "s/version\('[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.?[0-9]?)?'\)/version(\'$1\')/" scripts/generatePassword.js
sed $SED_ARGS "s/version\('[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.?[0-9]?)?'\)/version(\'$1\')/" scripts/decryptDataFromFile.js
sed $SED_ARGS "s/version\('[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.?[0-9]?)?'\)/version(\'$1\')/" scripts/encryptDataToFile.js

rm -f package.json.bak
rm -f scripts/commonOptions.js.bak
rm -f scripts/network.js.bak
rm -f scripts/runScript.js.bak
rm -f scripts/generatePassword.js.bak
rm -f scripts/decryptDataFromFile.js.bak
rm -f scripts/encryptDataToFile.js.bak
