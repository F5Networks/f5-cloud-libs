#!/bin/bash
USAGE_SHORT="Usage: $0 --user <user_name> --password <password> --password-file <file_containing_password>"
read -r -d '' USAGE_LONG << EOM
    Usage: $0
        -h|--help               Print this message and exit
        --user <user_name>      User to create, or 'admin' to update admin password
        --password <password>   Password to set for user. Must specify this or --password-file
        --password-file <file>  Full path to file containing password to set for user. Must specify this or --password
        --password-encrypted    Indicates that the password is encrypted *

    * If using an encrypted password, assumes it was encrypted with encrypteDataToFile.js or generatePassword.js
EOM

ARGS=`getopt -o h --long help,user:,password:,password-file:,password-encrypted -n $0 -- "$@"`
if [ $? -ne 0 ]; then
    echo $USAGE_SHORT
    exit 1
fi

eval set -- "$ARGS"

# Commands
SED=/bin/sed
TMSH=/usr/bin/tmsh
SHRED=/usr/bin/shred

# Defaults
HELP=false
PASSWORD_ENCRYPTED=false

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
        --password-encrypted)
            PASSWORD_ENCRYPTED=true;
            shift ;;
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

. $(dirname $0)/util.sh

if [[ -n "$PASSWORD_FILE" ]]; then
    RAW_PASSWORD=$(cat "$PASSWORD_FILE")
fi

if [[ "$PASSWORD_ENCRYPTED" == true ]]; then

    BIG_IP_LOCAL_PRIVATE_KEY_FOLDER=CloudLibsLocal
    BIG_IP_LOCAL_PRIVATE_KEY_NAME=cloudLibsLocalPrivate
    BIG_IP_LOCAL_PRIVATE_KEY_SUFFIXED_NAME=cloudLibsLocalPrivate.key

    # get passphrase and decrypt for local private key
    create_temp_dir /mnt/cloudTemp 8k
    PASSPHRASE_FILE=/mnt/cloudTemp/passphrase.out

    # Search for ssl-key with .key suffix
    if [[ -n $(/usr/bin/tmsh list sys file ssl-key /${BIG_IP_LOCAL_PRIVATE_KEY_FOLDER}/${BIG_IP_LOCAL_PRIVATE_KEY_SUFFIXED_NAME}) ]]; then
        BIG_IP_LOCAL_PRIVATE_KEY_NAME="$BIG_IP_LOCAL_PRIVATE_KEY_SUFFIXED_NAME"
    fi
    
    PASSPHRASE=$(/usr/bin/tmsh list sys file ssl-key /${BIG_IP_LOCAL_PRIVATE_KEY_FOLDER}/${BIG_IP_LOCAL_PRIVATE_KEY_NAME} | /bin/grep passphrase | /bin/awk '{print $2}')
    $(dirname $0)/decryptConfValue "$PASSPHRASE" > "$PASSPHRASE_FILE"

    # get path to private key
    PRIVATE_KEY_FULL_PATH=$(get_private_key_path "$BIG_IP_LOCAL_PRIVATE_KEY_FOLDER" "$BIG_IP_LOCAL_PRIVATE_KEY_NAME")

    # decrypt password
    if [[ -n "$PRIVATE_KEY_FULL_PATH"  ]]; then
        ACTUAL_PASSWORD=$(/usr/bin/base64 -d <<< "$RAW_PASSWORD" | /usr/bin/openssl pkeyutl -decrypt -passin file:"$PASSPHRASE_FILE" -inkey "$PRIVATE_KEY_FULL_PATH" -pkeyopt rsa_padding_mode:oaep)
    else
        echo No private key found
    fi

    # clean up
    wipe_temp_dir /mnt/cloudTemp
else
    ACTUAL_PASSWORD="$RAW_PASSWORD"
fi

if [[ -n "$ACTUAL_PASSWORD" ]]; then
    PASSWORD=$(echo "$ACTUAL_PASSWORD" | $SED -e $'s:[!\'"%{};/|#\x20\\\\]:\\\\&:g')

    if [[ "$USERNAME" != admin ]]; then
        $TMSH create auth user "$USERNAME" password "$PASSWORD" shell bash partition-access replace-all-with { all-partitions { role admin } }
    fi

    $TMSH modify /auth user "$USERNAME" password "$PASSWORD"
else
    echo Could not retrieve password
    exit 1
fi
