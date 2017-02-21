#!/bin/bash
USAGE_SHORT="Usage: $0 --user <user_name> --password <password> --password-file <file_containing_password>"
read -r -d '' USAGE_LONG << EOM
    Usage: $0
        -h|--help         Print this message and exit
        --user            User to create, or 'admin' to update admin password
        --password        Password to set for user. Must specify this or --password-file
        --password-file   File containing password to set for user. Must specify this or --password
EOM

ARGS=`getopt -o h --long help,user:,password:,password-file: -n $0 -- "$@"`
if [ $? -ne 0 ]; then
    echo $USAGE_SHORT
    exit 1
fi

eval set -- "$ARGS"

# Defaults
HELP=false

# Parse the command line arguments
while true; do
    case "$1" in
        -h|--help)
            HELP=true;
            shift ;;
        --user)
            USERNAME="$2";
            shift 2 ;;
        --password)
            RAW_PASSWORD="$2";
            shift 2 ;;
        --password-file)
            PASSWORD_FILE="$2";
            shift 2 ;;
        --)
            shift
            break ;;
    esac
done

if [[ $HELP == true ]]; then
    echo "$USAGE_LONG"
    exit
fi

if  [[ -z "$USERNAME" ]] || [[ -z "$RAW_PASSWORD" && -z "$PASSWORD_FILE" ]]; then
    echo "$USAGE_LONG"
    exit 1
fi

if [[ $(uname) == 'Darwin' ]]; then
    SED=/usr/bin/sed
else
    SED=/bin/sed
fi

if [[ -n $PASSWORD_FILE ]]; then
    RAW_PASSWORD=$(cat "$PASSWORD_FILE")
fi

PASSWORD=$(echo "$RAW_PASSWORD" | $SED -e $'s:[!\'"%{};/|#\x20\\\\]:\\\\&:g')

if [[ "$USERNAME" == admin ]]; then
    /usr/bin/tmsh modify /auth user "$USERNAME" password "$PASSWORD"
else
    tmsh create auth user "$USERNAME" password "$PASSWORD" shell bash partition-access replace-all-with { all-partitions { role admin } }
fi
