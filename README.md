# Library code and scripts for deploying BIG-IP in a cloud

This project consists of two main parts
- scripts
    - Command line scripts for configuring BIG-IP
    - These are meant to be called either directly from the command line or from cloud deployment templates
    - See usage below

- lib
    - Library code for controlling a BIG-IP
    - Called from the scripts
    - Documentation at go/f5-cloud-libs

## Scripts

### onboard.js
    Usage: onboard [options]

    Options:

      -h, --help                                               output usage information
      --host <ip_address>                                      Current BIG-IP management IP.
      -u, --user <user>                                        Current BIG-IP admin user.
      -p, --password <password>                                Current BIG-IP admin user password.
      --ntp <ntp-server>                                       Set NTP server. For multiple NTP servers, use multiple --ntp entries.
      --tz <timezone>                                          Set timezone for NTP setting.
      --dns <DNS server>                                       Set DNS server. For multiple DNS severs, use multiple --dns entries.
      -l, --license <license_key>                              License BIG-IP with <license_key>.
      -a, --add-on <add_on_key>                                License BIG-IP with <add_on_key>. For multiple keys, use multiple -a entries.
      -n, --hostname <hostname>                                Set BIG-IP hostname.
      -g, --global-setting <name:value>                        Set global setting <name> to <value>. For multiple settings, use multiple -g entries.
      -d, --db <name:value>                                    Set db variable <name> to <value>. For multiple settings, use multiple -d entries.
      --set-password <user:new_password>                       Set <user> password to <new_password>. For multiple users, use multiple --set-password entries.
      --set-root-password <old:old_password,new:new_password>  Set the password for the root user from <old_password> to <new_password>.
      -m, --module <name:level>                                Provision module <name> to <level>. For multiple modules, use multiple -m entries.
      --no-reboot                                              Skip reboot even if it is recommended.
      --background                                             Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <pid>                                           Process ID to send USR1 to when onboarding is complete (but before rebooting if we are rebooting).
      --log-level <level>                                      Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                                      Log to file as well as console. This is the default if background process is spawned. Default is /tmp/onboard.log

### cluster.js
    Usage: cluster [options]

    Options:

      -h, --help                                     output usage information
      --host <ip_address>                            Current BIG-IP management IP.
      -u, --user <user>                              Current BIG-IP admin user.
      -p, --password <password>                      Current BIG-IP admin user password.
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
          --device-group <remote_device_group_name>      Name of existing device group on remote BIG-IP to join.
          --sync                                         Tell the remote to sync to us after joining the group.
      --remove-from-cluster                          Remove a device from the cluster
          --device-group <device_group>                  Name of the device group.
          --device <device_name>                         Device name to remove.
      --background                                   Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <pid>                                 Process ID to send USR1 to when clustering is complete.
      --log-level <level>                            Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                            Log to file as well as console. This is the default if background process is spawned. Default is /tmp/cluster.log
