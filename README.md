[![Build Status](https://travis-ci.org/F5Networks/f5-cloud-libs.svg?branch=master)](https://travis-ci.org/F5Networks/f5-cloud-libs)

# Library code and scripts for deploying BIG-IP in a cloud

This project consists of two main parts
- scripts
    - Command line scripts for configuring BIG-IP
    - These are meant to be called either directly from the command line or from cloud deployment templates
    - See usage below

- lib
    - Library code for controlling a BIG-IP
    - Called from the scripts

## Release notes
### Version 2.0.0
* onboard.js option of --set-password is no longer available, use --update-user instead.

## Scripts

### onboard.js

Does initial configuration and provisioning of a BIG-IP.

    Usage: onboard [options]

    Options:

      -h, --help                                               output usage information
      --host <ip_address>                                      BIG-IP management IP to which to send commands.
      -u, --user <user>                                        BIG-IP admin user name.
      -p, --password <password>                                BIG-IP admin user password.
      --port <port>                                            BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                                              Skip reboot even if it is recommended.
      --background                                             Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                        Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                                      Wait for the named signal before running.
      --log-level <level>                                      Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                                      Log to file as well as console. This is the default if background process is spawned. Default is /tmp/onboard.log
      --ntp <ntp-server>                                       Set NTP server. For multiple NTP servers, use multiple --ntp entries.
      --tz <timezone>                                          Set timezone for NTP setting.
      --dns <DNS server>                                       Set DNS server. For multiple DNS severs, use multiple --dns entries.
      --ssl-port <ssl_port>                                    Set the SSL port for the management IP
      -l, --license <license_key>                              License BIG-IP with <license_key>.
      -a, --add-on <add_on_key>                                License BIG-IP with <add_on_key>. For multiple keys, use multiple -a entries.
      -n, --hostname <hostname>                                Set BIG-IP hostname.
      -g, --global-setting <name:value>                        Set global setting <name> to <value>. For multiple settings, use multiple -g entries.
      -d, --db <name:value>                                    Set db variable <name> to <value>. For multiple settings, use multiple -d entries.
      --set-password <user:new_password>                       Set <user> password to <new_password>. For multiple users, use multiple --set-password entries.
      --set-root-password <old:old_password,new:new_password>  Set the password for the root user from <old_password> to <new_password>.
      -m, --module <name:level>                                Provision module <name> to <level>. For multiple modules, use multiple -m entries.
      --ping [address]                                         Do a ping at the end of onboarding to verify that the network is up. Default address is f5.com
      --update-sigs                                            Update ASM signatures

### cluster.js

Sets up BIG-IPs in a cluster.

    Usage: cluster [options]

    Options:

      -h, --help                                     output usage information
      --host <ip_address>                            BIG-IP management IP to which to send commands.
      -u, --user <user>                              BIG-IP admin user name.
      -p, --password <password>                      BIG-IP admin user password.
      --port <port>                                  BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                                    Skip reboot even if it is recommended.
      --background                                   Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                              Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                            Wait for the named signal before running.
      --log-level <level>                            Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                            Log to file as well as console. This is the default if background process is spawned. Default is /tmp/cluster.log
      --config-sync-ip <config_sync_ip>              IP address for config sync.
      --create-group                                 Create a device group with the options:
          --device-group <device_group>                  Name of the device group.
          --sync-type <sync_type>                        Type of sync this cluster is for ("sync-only" | "sync-failover").
          --device <device_name>                         A device name to add to the group. For multiple devices, use multiple --device entries.
          --auto-sync                                    Enable auto sync.
          --save-on-auto-sync                            Enable save on sync if auto sync is enabled.
          --full-load-on-sync                            Enable full load on sync.
          --asm-sync                                     Enable ASM sync.
          --network-failover                             Enable network failover.
      --join-group                                   Join a remote device group with the options:
          --remote-host <remote_ip_address>              Managemnt IP for the BIG-IP on which the group exists.
          --remote-user <remote_user                     Remote BIG-IP admin user name.
          --remote-password <remote_password>            Remote BIG-IP admin user password.
          --remote-port <remote_port>                    Remote BIG-IP port to connect to. Default is port of this BIG-IP.
          --device-group <remote_device_group_name>      Name of existing device group on remote BIG-IP to join.
          --sync                                         Tell the remote to sync to us after joining the group.
      --remove-from-cluster                          Remove a device from the cluster
          --device-group <device_group>                  Name of the device group.
          --device <device_name>                         Device name to remove.

### network.js

Sets up default gateway, VLANs and self IPs

    Usage: network [options]

    Options:

      -h, --help                               output usage information
      --host <ip_address>                      BIG-IP management IP to which to send commands.
      -u, --user <user>                        BIG-IP admin user name.
      -p, --password <password>                BIG-IP admin user password.
      --port <port>                            BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                              Skip reboot even if it is recommended.
      --background                             Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                        Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                      Wait for the named signal before running.
      --log-level <level>                      Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                      Log to file as well as console. This is the default if background process is spawned. Default is /tmp/network.log
      --single-nic                             Set db variables for single NIC configuration.
      --multi-nic                              Set db variables for multi NIC configuration.
      --default-gw <gateway_address>           Set default gateway to gateway_address.
      --local-only                             Create LOCAL_ONLY partition for gateway and assign to traffic-group-local-only.
      --vlan <name, nic_number, [tag]>         Create vlan with name on nic_number. Optionally specify a tag. Values should be comma-separated. For multiple vlans, use multiple --vlan entries.
      --self-ip <name, ip_address, vlan_name>  Create self IP with name and ip_address on vlan. Values should be comma-separated. For multiple self IPs, use multiple --self-ip entries.    Default CIDR prefix is 24 if not specified.
      --force-reboot                           Force a reboot at the end. This is necessary for some 2+ NIC configurations.


### runScript.js

Runs an arbitrary script.

    Usage: runScript [options]

    Options:

      -h, --help                     output usage information
      --background                   Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      -f, --file <script>            File name of script to run.
      -u, --url <url>                URL from which to download script to run. This will override --file.
      --cl-args <command_line_args>  String of arguments to send to the script as command line arguments.
      --signal <signal>              Signal to send when done. Default SCRIPT_DONE.
      --wait-for <signal>            Wait for the named signal before running.
      --cwd <directory>              Current working directory for the script to run in.
      --log-level <level>            Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>            Log to file as well as console. This is the default if background process is spawned. Default is /tmp/runScript.log
