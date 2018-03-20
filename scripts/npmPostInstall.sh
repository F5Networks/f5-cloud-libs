#!/bin/bash
echo Running npm post install script.
if [[ -x /usr/bin/tmsh && -e /config/bigip.conf ]]; then
    echo Running on a BIG-IP, installing licensing script.
    if [[ -e ./scripts/license_script.conf ]]; then
        echo Loading license script.
        if ! /usr/bin/tmsh load sys config merge file ./scripts/license_script.conf; then
            echo Load sys config failed.
            exit 1
        fi

        if ! /usr/bin/tmsh list cli alias shared license; then
            echo Creating license alias.
            /usr/bin/tmsh create cli alias shared license { command "run cli script license path $(pwd)" }
        fi
    else
        echo No licensing script found.
        exit 1
    fi
else
    echo Not running on a BIG-IP. No post install.
fi
