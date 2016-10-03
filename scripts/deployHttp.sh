#!/bin/bash

USAGE_SHORT="Usage: $0 --help --user <user> --password <password> --vs-addr <vs_addr> --vs-port <vs_port> --app-name <app_name> --app-fqdn <FQDN_for_app> --app-addr <app_ip> --app-port <app_port> --montor <monitor> --ssl"
read -r -d '' USAGE_LONG << EOM
    Usage: $0
        --help          Print this message and exit.
        -u|--user       User to run as.
        -p|--password   Password for the user.
        --vs-addr       IP address for the virtual. Default 0.0.0.0
        --vs-port       Port for the virtual. Default 80.
        --app-name      Name for the application.
        --app-fqdn      FQDN for application.
        --app-addr      IP address for the application.
        --app-port      Port for the application. Default 80.
        --monitor       Monitor to use for the application. Default http.
        --ssl           Use SSL termination. Default false.
EOM

# Defaults for optional argutments
USER=''
PASSWORD=''
APP_NAME=''
APP_FQDN=''
VS_ADDR='0.0.0.0'
VS_PORT='80'
APP_ADDR=''
APP_PORT='80'
MONITOR='http'
SSL='no_ssl'
HELP=false

ARGS=`getopt -o hu:p: --long user:,password:,vs-addr:,vs-port:,app-name:,app-fqdn:,app-addr:,app-port:,monitor:,help,ssl -n $0 -- "$@"`
if [ $? -ne 0 ]; then
    echo $USAGE_SHORT
    exit
fi

eval set -- "$ARGS"

# Parse the command line arguments
while true; do
    case "$1" in
        -h|--help)
            HELP=true;
            shift ;;
        -u|--user)
            USER=$2
            shift 2;;
        -p|--password)
            PASSWORD=$2
            shift 2;;
        --app-name)
            APP_NAME=$2
            shift 2;;
        --app-fqdn)
            APP_FQDN=$2
            shift 2;;
        --vs-addr)
            VS_ADDR=$2
            shift 2;;
        --vs-port)
            VS_PORT=$2
            shift 2;;
        --app-addr)
            APP_ADDR=$2
            shift 2;;
        --app-port)
            APP_PORT=$2
            shift 2;;
        --monitor)
            MONITOR=$2
            shift 2;;
        --ssl)
            SSL='ssl'
            shift ;;
        --)
            shift
            break;;
    esac
done

if [ $HELP = true ]; then
    echo "$USAGE_LONG"
    exit
fi

curl -k -s -f --retry 20 --retry-delay 10 --retry-max-time 300 -o /config/http_iapp http://cdn.f5.com/product/blackbox/staging/azure/f5.http.v1.2.0rc4.tmpl

tmsh load sys config merge file /config/http_iapp

sleep 10

curl -sku $USER:$PASSWORD -X POST -H "Content-Type: application/json" https://localhost/mgmt/tm/sys/application/service/ -d \
    "{
        \"name\": \"$APP_NAME\",
        \"partition\": \"Common\",
        \"deviceGroup\": \"/Common/Sync\",
        \"strictUpdates\": \"disabled\",
        \"template\": \"/Common/f5.http.v1.2.0rc4\",
        \"trafficGroup\": \"none\",
        \"tables\": [
            {
                \"name\": \"basic__snatpool_members\"
            },
            {
                \"name\": \"net__snatpool_members\"
            },
            {
                \"name\": \"optimizations__hosts\"
            },
            {
                \"name\": \"pool__hosts\",
                \"columnNames\": [\"name\"],
                \"rows\": [
                    {
                        \"row\": [
                            \"$APP_FQDN\"
                        ]
                    }
                ]
            },
            {
                \"name\": \"pool__members\",
                \"columnNames\": [
                    \"addr\", \"port\", \"connection_limit\"
                ],
                \"rows\": [
                    {
                        \"row\": [
                            \"$APP_ADDR\",
                            \"$APP_PORT\",
                            \"0\"
                        ]
                    }
                ]
            },
            {
                \"name\": \"server_pools__servers\"
            }
        ],
        \"variables\": [
            {
                \"name\": \"asm__language\",
                \"encrypted\": \"no\",
                \"value\": \"utf-8\"
            },
            {
                \"name\": \"asm__security_logging\",
                \"encrypted\": \"no\",
                \"value\": \"Log illegal requests\"
            },
            {
                \"name\": \"asm__use_asm\",
                \"encrypted\": \"no\",
                \"value\": \"/Common/test_ltm_policy\"
            },
            {
                \"name\": \"client__http_compression\",
                \"encrypted\": \"no\",
                \"value\": \"/#create_new#\"
            },
            {
                \"name\": \"monitor__monitor\",
                \"encrypted\": \"no\",
                \"value\": \"/Common/$MONITOR\"
            },
            {
                \"name\": \"monitor__response\",
                \"encrypted\": \"no\",
                \"value\": \"none\"
            },
            {
                \"name\": \"monitor__uri\",
                \"encrypted\": \"no\",
                \"value\": \"/\"
            },
            {
                \"name\": \"net__client_mode\",
                \"encrypted\": \"no\",
                \"value\":\"wan\"
            },
            {
                \"name\": \"net__server_mode\",
                \"encrypted\": \"no\",
                \"value\": \"lan\"
            },
            {
                \"name\": \"pool__addr\",
                \"encrypted\": \"no\",
                \"value\": \"$VS_ADDR\"
            },
            {
                \"name\": \"pool__pool_to_use\",
                \"encrypted\": \"no\",
                \"value\": \"/#create_new#\"
            },
            {
                \"name\": \"pool__port\",
                \"encrypted\": \"no\",
                \"value\": \"$VS_PORT\"
            },
            {
                \"name\": \"ssl__mode\",
                \"encrypted\": \"no\",
                \"value\": \"$SSL\"
            },
            {
                \"name\": \"ssl_encryption_questions__advanced\",
                \"encrypted\": \"no\",
                \"value\": \"no\"
            },
            {
                \"name\": \"ssl_encryption_questions__help\",
                \"encrypted\": \"no\",
                \"value\": \"hide\"
            }
        ]
    }"

exit