[![Build Status](https://travis-ci.org/F5Networks/f5-cloud-libs.svg?branch=master)](https://travis-ci.org/F5Networks/f5-cloud-libs)
[![Coverage Status](https://coveralls.io/repos/github/F5Networks/f5-cloud-libs/badge.svg)](https://coveralls.io/github/F5Networks/f5-cloud-libs)

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
### Version 3.2.0
* Support for S3 ARN for licensing via BIG-IQ

### Version 3.1.0
* Support for licensing via BIG-IQ
* Support for service discovery

### Version 3.0.1
* Add retry for password-url when licensing via BIG-IQ.

### Version 3.0.0
**This version is not backwards compatible. The format for options on network.js has changed.
See node scripts/network.js --help for details**

* License from BIG-IP from BIG-IQ.
* More options for network.js
    * Add arbitrary routes
    * Support mtu on vlans
    * Support port lockdown on self IPs
* Updates to signaling. --wait-for now means 'run if the signal has been sent' rather than 'run when the signal is sent'
* More robust reboot handling.

### Version 2.3.0
* Support for Azure autoscaling
* Support --password-url in network.js
* Restore from stored UCS

### Version 2.2.0
* Restore from saved UCS file if present in storage account

### Version 2.1.0
* Allows for autoscaling and clustering without providing a password in the template
* Adds hash verification for all downloaded files
* Fixes race condition when running multiple f5-cloud-libs scripts at once

### Version 2.0.0
* onboard.js option of --set-password is no longer available, use --update-user instead.
* All scripts that take --password now also support --password-url. Only 'file' URLs are supported for now.
* Added option to suppress console output (--no-console).
* Added support for verifying hash of downloaded f5-cloud-libs tarball.
* Added some parsing of sync messages to get sync to work more often.

## Scripts

### onboard.js

Does initial configuration and provisioning of a BIG-IP.
    
    Usage: onboard [options]
    
    Options:
    
      -h, --help                                                                                 output usage information
      -V, --version                                                                              output the version number
      --host <ip_address>                                                                        BIG-IP management IP to which to send commands.
      -u, --user <user>                                                                          BIG-IP admin user name.
      -p, --password <password>                                                                  BIG-IP admin user password. Use this or --password-url
      --password-url <password_url>                                                              URL (file, http(s)) to location that contains BIG-IP admin user password. Use this or --password
      --port <port>                                                                              BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                                                                                Skip reboot even if it is recommended.
      --background                                                                               Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                                                          Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                                                                        Wait for the named signal before running.
      --log-level <level>                                                                        Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                                                                        Log to file as well as console. This is the default if background process is spawned. Default is /tmp/onboard.log
      --no-console                                                                               Do not log to console. Default false (log to console).
      --ntp <ntp_server>                                                                         Set NTP server. For multiple NTP servers, use multiple --ntp entries.
      --tz <timezone>                                                                            Set timezone for NTP setting.
      --dns <DNS server>                                                                         Set DNS server. For multiple DNS severs, use multiple --dns entries.
      --ssl-port <ssl_port>                                                                      Set the SSL port for the management IP
      -l, --license <license_key>                                                                License BIG-IP with <license_key>.
      -a, --add-on <add_on_key>                                                                  License BIG-IP with <add_on_key>. For multiple keys, use multiple -a entries.
      --license-pool                                                                             License BIG-IP from a BIG-IQ license pool. Supply the following:
          --big-iq-host <ip_address or FQDN>                                                         IP address or FQDN of BIG-IQ
          --big-iq-user <user>                                                                       BIG-IQ admin user name
          --big-iq-password <password>                                                               BIG-IQ admin user password.
          --big-iq-password-uri <password_uri>                                                       URI (file, http(s), arn) to location that contains BIG-IQ admin user password. Use this or --big-iq-password.
          --license-pool-name <pool_name>                                                            Name of BIG-IQ license pool.
          --big-ip-mgmt-address <big_ip_address>                                                     IP address or FQDN of BIG-IP management port. Use this if BIG-IP reports an address not reachable from BIG-IQ.
          --big-ip-mgmt-port <big_ip_port>                                                           Port for the management address. Use this if the BIG-IP is not reachable from BIG-IQ via the port used in --port
      -n, --hostname <hostname>                                                                  Set BIG-IP hostname.
      -g, --global-setting <name:value>                                                          Set global setting <name> to <value>. For multiple settings, use multiple -g entries.
      -d, --db <name:value>                                                                      Set db variable <name> to <value>. For multiple settings, use multiple -d entries.
      --set-root-password <old:old_password,new:new_password>                                    Set the password for the root user from <old_password> to <new_password>.
      --update-user <user:user,password:password,passwordUrl:passwordUrl,role:role,shell:shell>  Update user password (or password from passwordUrl), or create user with password, role, and shell. Role and shell are only valid on create.
      -m, --module <name:level>                                                                  Provision module <name> to <level>. For multiple modules, use multiple -m entries.
      --ping [address]                                                                           Do a ping at the end of onboarding to verify that the network is up. Default address is f5.com
      --update-sigs                                                                              Update ASM signatures
    
### cluster.js

Sets up BIG-IPs in a cluster.
    
    Usage: cluster [options]
    
    Options:
    
      -h, --help                                       output usage information
      -V, --version                                    output the version number
      --host <ip_address>                              BIG-IP management IP to which to send commands.
      -u, --user <user>                                BIG-IP admin user name.
      -p, --password <password>                        BIG-IP admin user password. Use this or --password-url
      --password-url <password_url>                    URL (file, http(s)) to location that contains BIG-IP admin user password. Use this or --password
      --port <port>                                    BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                                      Skip reboot even if it is recommended.
      --background                                     Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                              Wait for the named signal before running.
      --log-level <level>                              Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                              Log to file as well as console. This is the default if background process is spawned. Default is /tmp/cluster.log
      --no-console                                     Do not log to console. Default false (log to console).
      --config-sync-ip <config_sync_ip>                IP address for config sync.
      --cloud <provider>                               Cloud provider (aws | azure | etc.). Optionally use this if passwords are stored in cloud storage. This replaces the need for --remote-user/--remote-password(-url). An implemetation of autoscaleProvider must exist at the correct location.
          --master                                     If using a cloud provider, indicates that this is the master and credentials should be stored.
          --provider-options <cloud_options>           Any options (JSON stringified) that are required for the specific cloud provider.
      --create-group                                   Create a device group with the options:
          --device-group <device_group>                    Name of the device group.
          --sync-type <sync_type>                          Type of sync this cluster is for ("sync-only" | "sync-failover").
          --device <device_name>                           A device name to add to the group. For multiple devices, use multiple --device entries.
          --auto-sync                                      Enable auto sync.
          --save-on-auto-sync                              Enable save on sync if auto sync is enabled.
          --full-load-on-sync                              Enable full load on sync.
          --asm-sync                                       Enable ASM sync.
          --network-failover                               Enable network failover.
      --join-group                                     Join a remote device group with the options:
          --remote-host <remote_ip_address>                Managemnt IP for the BIG-IP on which the group exists.
          --remote-user <remote_user                       Remote BIG-IP admin user name.
          --remote-password <remote_password>              Remote BIG-IP admin user password. Use this or --remote-password-url
          --remote-password-url <remote_password_url>      URL (file, http(s)) that contains. Use this or --remote-password
          --remote-port <remote_port>                      Remote BIG-IP port to connect to. Default is port of this BIG-IP.
          --device-group <remote_device_group_name>        Name of existing device group on remote BIG-IP to join.
          --sync                                           Tell the remote to sync to us after joining the group.
      --remove-from-cluster                            Remove a device from the cluster
          --device-group <device_group>                    Name of the device group.
          --device <device_name>                           Device name to remove.
    
### autoscale.js

Runs autoscale code to elect master and cluster
    
    Usage: autoscale [options]
    
    Options:
    
      -h, --help                          output usage information
      -V, --version                       output the version number
      --host <ip_address>                 BIG-IP management IP to which to send commands.
      -u, --user <user>                   BIG-IP admin user name.
      -p, --password <password>           BIG-IP admin user password. Use this or --password-url
      --password-url <password_url>       URL (file, http(s)) to location that contains BIG-IP admin user password. Use this or --password
      --port <port>                       BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                         Skip reboot even if it is recommended.
      --background                        Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                   Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                 Wait for the named signal before running.
      --log-level <level>                 Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                 Log to file as well as console. This is the default if background process is spawned. Default is /tmp/autoscale.log
      --no-console                        Do not log to console. Default false (log to console).
      --cloud <provider>                  Cloud provider (aws | azure | etc.)
      --provider-options <cloud_options>  Any options that are required for the specific cloud provider. Ex: param1:value1,param2:value2
      -c, --cluster-action <type>         join (join a cluster) | update (update cluster to match existing instances | unblock-sync (allow other devices to sync to us)
      --device-group <device_group>       Device group name.
      --block-sync                        If this device is master, do not allow other devices to sync to us. This prevents other devices from syncing to it until we are called again with --cluster-action unblock-sync.
    
### network.js

Sets up default gateway, VLANs and self IPs
    
    Usage: network [options]
    
    Options:
    
      -h, --help                                                                                        output usage information
      -V, --version                                                                                     output the version number
      --host <ip_address>                                                                               BIG-IP management IP to which to send commands.
      -u, --user <user>                                                                                 BIG-IP admin user name.
      -p, --password <password>                                                                         BIG-IP admin user password. Use this or --password-url
      --password-url <password_url>                                                                     URL (file, http(s)) to location that contains BIG-IP admin user password. Use this or --password
      --port <port>                                                                                     BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                                                                                       Skip reboot even if it is recommended.
      --background                                                                                      Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                                                                 Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                                                                               Wait for the named signal before running.
      --log-level <level>                                                                               Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>                                                                               Log to file as well as console. This is the default if background process is spawned. Default is /tmp/network.log
      --single-nic                                                                                      Set db variables for single NIC configuration.
      --multi-nic                                                                                       Set db variables for multi NIC configuration.
      --default-gw <gateway_address>                                                                    Set default gateway to gateway_address.
      --route <name:name, gw:address, network:network>                                                  Create arbitrary route with name for destination network via gateway address.
      --local-only                                                                                      Create LOCAL_ONLY partition for gateway and assign to traffic-group-local-only.
      --vlan <name:name, nic:nic, [mtu:mtu], [tag:tag]>                                                 Create vlan with name on nic (for example, 1.1). Optionally specify mtu and tag. For multiple vlans, use multiple --vlan entries.
      --self-ip <name:name, address:ip_address, vlan:vlan_name, [allow:service1:port1 service2:port2]>  Create self IP with name and ip_address on vlan with optional port lockdown. For multiple self IPs, use multiple --self-ip entries. Default CIDR prefix is 24 if not specified.
      --force-reboot                                                                                    Force a reboot at the end. This is necessary for some 2+ NIC configurations.
    
### runScript.js

Runs an arbitrary script.
    
    Usage: runScript [options]
    
    Options:
    
      -h, --help                     output usage information
      -V, --version                  output the version number
      --background                   Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      -f, --file <script>            File name of script to run.
      -u, --url <url>                URL from which to download script to run. This will override --file.
      --cl-args <command_line_args>  String of arguments to send to the script as command line arguments.
      --signal <signal>              Signal to send when done. Default SCRIPT_DONE.
      --wait-for <signal>            Wait for the named signal before running.
      --cwd <directory>              Current working directory for the script to run in.
      --log-level <level>            Log level (none, error, warn, info, verbose, debug, silly). Default is info.
      -o, --output <file>            Log to file as well as console. This is the default if background process is spawned. Default is /tmp/runScript.log
    
