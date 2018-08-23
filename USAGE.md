# Usage

## onboard.js

Does initial configuration and provisioning of a BIG-IP.
    
    Usage: onboard [options]
    
    Options:
    
      -V, --version                                                                                                                                                                                                                            output the version number
      --host <ip_address>                                                                                                                                                                                                                      Device management IP to which to send commands.
      -u, --user <user>                                                                                                                                                                                                                        Device admin user name. Default is to create a temporary user (this only works when running on the device).
      -p, --password <password>                                                                                                                                                                                                                Device admin user password. Use this or --password-url. One of these is required when specifying the user.
      --password-url <password_url>                                                                                                                                                                                                            URL (file, http(s)) to location that contains device admin user password. Use this or --password. One of these is required when specifying the user.
      --password-encrypted                                                                                                                                                                                                                     Indicates that the password is encrypted (either with encryptDataToFile or generatePassword)
      --port <port>                                                                                                                                                                                                                            device management SSL port to connect to. Default 443.
      --no-reboot                                                                                                                                                                                                                              Skip reboot even if it is recommended.
      --background                                                                                                                                                                                                                             Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                                                                                                                                                                                                        Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                                                                                                                                                                                                                      Wait for the named signal before running.
      --log-level <level>                                                                                                                                                                                                                      Log level (none, error, warn, info, verbose, debug, silly). Default is info. (default: info)
      -o, --output <file>                                                                                                                                                                                                                      Log to file as well as console. This is the default if background process is spawned. Default is /tmp/onboard.log
      --no-console                                                                                                                                                                                                                             Do not log to console. Default false (log to console).
      --ntp <ntp_server>                                                                                                                                                                                                                       Set NTP server. For multiple NTP servers, use multiple --ntp entries. (default: )
      --tz <timezone>                                                                                                                                                                                                                          Set timezone for NTP setting.
      --dns <DNS server>                                                                                                                                                                                                                       Set DNS server. For multiple DNS severs, use multiple --dns entries. (default: )
      --ssl-port <ssl_port>                                                                                                                                                                                                                    Set the SSL port for the management IP
      -l, --license <license_key>                                                                                                                                                                                                              License device with <license_key>.
      -a, --add-on <add_on_key>                                                                                                                                                                                                                License device with <add_on_key>. For multiple keys, use multiple -a entries. (default: )
      --license-pool                                                                                                                                                                                                                           License BIG-IP from a BIG-IQ license pool. Supply the following:
      --cloud <provider>                                                                                                                                                                                                                       Cloud provider (aws | azure | etc.). This is only required if licensing via BIG-IQ 5.4+ is being used.
          --big-iq-host <ip_address or FQDN>                                                                                                                                                                                                       IP address or FQDN of BIG-IQ
          --big-iq-user <user>                                                                                                                                                                                                                     BIG-IQ admin user name
          --big-iq-password <password>                                                                                                                                                                                                             BIG-IQ admin user password.
          --big-iq-password-uri <password_uri>                                                                                                                                                                                                     URI (file, http(s), arn) to location that contains BIG-IQ admin user password. Use this or --big-iq-password.
          --big-iq-password-encrypted                                                                                                                                                                                                              Indicates that the BIG-IQ password is encrypted.
          --license-pool-name <pool_name>                                                                                                                                                                                                          Name of BIG-IQ license pool.
          --sku-keyword-1 <sku_keyword_1>                                                                                                                                                                                                          skuKeyword1 parameter for CLPv2 licensing. Default none.
          --sku-keyword-2 <sku_keyword_2>                                                                                                                                                                                                          skuKeyword2 parameter for CLPv2 licensing. Default none.
          --unit-of-measure <unit_of_measure>                                                                                                                                                                                                      unitOfMeasure parameter for CLPv2 licensing. Default none.
          --big-ip-mgmt-address <big_ip_address>                                                                                                                                                                                                   IP address or FQDN of BIG-IP management port. Use this if BIG-IP reports an address not reachable from BIG-IQ.
          --big-ip-mgmt-port <big_ip_port>                                                                                                                                                                                                         Port for the management address. Use this if the BIG-IP is not reachable from BIG-IQ via the port used in --port
          --no-unreachable                                                                                                                                                                                                                         Do not use the unreachable API even if it is supported by BIG-IQ.
          --revoke                                                                                                                                                                                                                                 Request BIG-IQ to revoke this units license rather than granting one.
      -n, --hostname <hostname>                                                                                                                                                                                                                Set device hostname.
      -g, --global-setting <name:value>                                                                                                                                                                                                        Set global setting <name> to <value>. For multiple settings, use multiple -g entries. (default: [object Object])
      -d, --db <name:value>                                                                                                                                                                                                                    Set db variable <name> to <value>. For multiple settings, use multiple -d entries. (default: [object Object])
      --set-root-password <old:old_password,new:new_password>                                                                                                                                                                                  Set the password for the root user from <old_password> to <new_password>.
      --set-master-key                                                                                                                                                                                                                         If running on a BIG-IQ, set the master key with a random passphrase
      --create-license-pool <name:reg_key>                                                                                                                                                                                                     If running on a BIG-IQ, create a pool-style license (purchased pool, utility, volume, or FPS) with the name and reg key. (default: [object Object])
      --create-reg-key-pool <name:reg_key_list>                                                                                                                                                                                                If running on a BIG-IQ, create a reg key pool with the given name and reg keys. Reg keys should be comma separated. (default: [object Object])
      --update-user <user:user,password:password,passwordUrl:passwordUrl,role:role,shell:shell>                                                                                                                                                Update user password (or password from passwordUrl), or create user with password, role, and shell. Role and shell are only valid on create. (default: )
      -m, --module <name:level>                                                                                                                                                                                                                Provision module <name> to <level>. For multiple entries, use --modules (default: [object Object])
      --modules <name:level>                                                                                                                                                                                                                   Provision module(s) <name> to <level> (comma-separated list of module:level pairs). (default: [object Object])
      --ping [address]                                                                                                                                                                                                                         Do a ping at the end of onboarding to verify that the network is up. Default address is f5.com
      --update-sigs                                                                                                                                                                                                                            Update ASM signatures
      --metrics [customerId:unique_id, deploymentId:deployment_id, templateName:template_name, templateVersion:template_version, cloudName:<aws | azure | gce | etc.>, region:region, bigIpVersion:big_ip_version, licenseType:<byol | payg>]  Optional usage metrics to collect. Customer ID should not identify a specific customer. (default: [object Object])
      -h, --help                                                                                                                                                                                                                               output usage information
    
## cluster.js

Sets up BIG-IPs in a cluster.
    
    Usage: cluster [options]
    
    Options:
    
      -V, --version                                    output the version number
      --host <ip_address>                              Device management IP to which to send commands.
      -u, --user <user>                                Device admin user name. Default is to create a temporary user (this only works when running on the device).
      -p, --password <password>                        Device admin user password. Use this or --password-url. One of these is required when specifying the user.
      --password-url <password_url>                    URL (file, http(s)) to location that contains device admin user password. Use this or --password. One of these is required when specifying the user.
      --password-encrypted                             Indicates that the password is encrypted (either with encryptDataToFile or generatePassword)
      --port <port>                                    device management SSL port to connect to. Default 443.
      --no-reboot                                      Skip reboot even if it is recommended.
      --background                                     Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                              Wait for the named signal before running.
      --log-level <level>                              Log level (none, error, warn, info, verbose, debug, silly). Default is info. (default: info)
      -o, --output <file>                              Log to file as well as console. This is the default if background process is spawned. Default is /tmp/cluster.log
      --no-console                                     Do not log to console. Default false (log to console).
      --config-sync-ip <config_sync_ip>                IP address for config sync.
      --cloud <provider>                               Cloud provider (aws | azure | etc.). Optionally use this if passwords are stored in cloud storage. This replaces the need for --remote-user/--remote-password(-url). An implemetation of cloudProvider must exist at the correct location.
          --master                                     If using a cloud provider, indicates that this is the master and credentials should be stored.
          --provider-options <cloud_options>           Any options (JSON stringified) that are required for the specific cloud provider. (default: )
      --create-group                                   Create a device group with the options:
          --device-group <device_group>                    Name of the device group.
          --sync-type <sync_type>                          Type of sync this cluster is for ("sync-only" | "sync-failover").
          --device <device_name>                           A device name to add to the group. For multiple devices, use multiple --device entries. (default: )
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
      -h, --help                                       output usage information
    
## autoscale.js

Runs autoscale code to elect master and cluster
    
    Usage: autoscale [options]
    
    Options:
    
      -V, --version                                      output the version number
      --host <ip_address>                                Device management IP to which to send commands.
      -u, --user <user>                                  Device admin user name. Default is to create a temporary user (this only works when running on the device).
      -p, --password <password>                          Device admin user password. Use this or --password-url. One of these is required when specifying the user.
      --password-url <password_url>                      URL (file, http(s)) to location that contains device admin user password. Use this or --password. One of these is required when specifying the user.
      --password-encrypted                               Indicates that the password is encrypted (either with encryptDataToFile or generatePassword)
      --port <port>                                      device management SSL port to connect to. Default 443.
      --no-reboot                                        Skip reboot even if it is recommended.
      --background                                       Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                  Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                                Wait for the named signal before running.
      --log-level <level>                                Log level (none, error, warn, info, verbose, debug, silly). Default is info. (default: info)
      -o, --output <file>                                Log to file as well as console. This is the default if background process is spawned. Default is /tmp/autoscale.log
      --no-console                                       Do not log to console. Default false (log to console).
      --cloud <cloud_provider>                           Cloud provider (aws | azure | etc.)
      --provider-options <cloud_options>                 Options specific to cloud_provider. Ex: param1:value1,param2:value2 (default: [object Object])
      -c, --cluster-action <type>                        join (join a cluster) | update (update cluster to match existing instances | unblock-sync (allow other devices to sync to us) | backup-ucs (save a ucs to cloud storage)
      --device-group <device_group>                      Device group name.
          --full-load-on-sync                                Enable full load on sync. Default false.
          --asm-sync                                         Enable ASM sync. Default sets ASM sync if ASM is provisioned.
          --network-failover                                 Enable network failover. Default false.
          --no-auto-sync                                     Enable auto sync. Default false (auto sync).
          --no-save-on-auto-sync                             Enable save on sync if auto sync is enabled. Default false (save on auto sync).
      --block-sync                                       If this device is master, do not allow other devices to sync to us. This prevents other devices from syncing to it until we are called again with --cluster-action unblock-sync.
      --static                                           Indicates that this instance is not autoscaled. Default false (instance is autoscaled)
      --external-tag <tag>                               If there are instances in the autoscale cluster that are not autoscaled, the cloud tag applied to those instances. Format 'key:<tag_key>,value:<tag_value>' (default: [object Object])
      --license-pool                                     BIG-IP was licensed from a BIG-IQ license pool. This is so licenses can be revoked when BIG-IPs are scaled in. Supply the following:
          --big-iq-host <ip_address or FQDN>                 IP address or FQDN of BIG-IQ
          --big-iq-user <user>                               BIG-IQ admin user name
          --big-iq-password <password>                       BIG-IQ admin user password.
          --big-iq-password-uri <password_uri>               URI (file, http(s), arn) to location that contains BIG-IQ admin user password. Use this or --big-iq-password.
          --big-iq-password-encrypted                        Indicates that the BIG-IQ password is encrypted.
          --license-pool-name <pool_name>                    Name of BIG-IQ license pool.
          --big-ip-mgmt-address <big_ip_address>             IP address or FQDN of BIG-IP management port. Use this if BIG-IP reports an address not reachable from BIG-IQ.
          --big-ip-mgmt-port <big_ip_port>                   Port for the management address. Use this if the BIG-IP is not reachable from BIG-IQ via the port used in --port
          --no-unreachable                                   Do not use the unreachable API even if it is supported by BIG-IQ.
      --dns <dns_provider>                                   Update the specified DNS provider when autoscaling occurs (gtm is the only current provider)
          --dns-ip-type <address_type>                       Type of ip address to use (public | private).
          --dns-app-port <port>                              Port on which application is listening on for health check
          --dns-provider-options <dns_provider_options>      Options specific to dns_provider. Ex: param1:value1,param2:value2 (default: [object Object])
      --max-ucs-files <max_ucs_files_to_save>            When running cluster action backup-ucs, maximum number of backup files to keep. (default: 7)
      -h, --help                                         output usage information
    
## network.js

Sets up default gateway, VLANs and self IPs
    
    Usage: network [options]
    
    Options:
    
      -V, --version                                                                                                                        output the version number
      --host <ip_address>                                                                                                                  BIG-IP management IP to which to send commands.
      -u, --user <user>                                                                                                                    BIG-IP admin user name. Default is to create a temporary user (this only works when running on the device).
      -p, --password <password>                                                                                                            BIG-IP admin user password. Use this or --password-url. One of these is required when specifying the user.
      --password-url <password_url>                                                                                                        URL (file, http(s)) to location that contains BIG-IP admin user password. Use this or --password. One of these is required when specifying the user.
      --password-encrypted                                                                                                                 Indicates that the password is encrypted (either with encryptDataToFile or generatePassword)
      --port <port>                                                                                                                        BIG-IP management SSL port to connect to. Default 443.
      --no-reboot                                                                                                                          Skip reboot even if it is recommended.
      --background                                                                                                                         Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      --signal <signal>                                                                                                                    Signal to send when done. Default ONBOARD_DONE.
      --wait-for <signal>                                                                                                                  Wait for the named signal before running.
      --log-level <level>                                                                                                                  Log level (none, error, warn, info, verbose, debug, silly). Default is info. (default: info)
      -o, --output <file>                                                                                                                  Log to file as well as console. This is the default if background process is spawned. Default is /tmp/network.log
      --no-console                                                                                                                         Do not log to console. Default false (log to console).
      --single-nic                                                                                                                         Set db variables for single NIC configuration.
      --multi-nic                                                                                                                          Set db variables for multi NIC configuration.
      --default-gw <gateway_address>                                                                                                       Set default gateway to gateway_address.
      --route <name:name, gw:address, network:network>                                                                                     Create arbitrary route with name for destination network via gateway address. (default: )
      --mgmt-route <name:name, gw:address, network:network>                                                                                Create management route with name for destination network via gateway address. (default: )
      --local-only                                                                                                                         Create LOCAL_ONLY partition for gateway and assign to traffic-group-local-only.
      --vlan <name:name, nic:nic, [mtu:mtu], [tag:tag]>                                                                                    Create vlan with name on nic (for example, 1.1). Optionally specify mtu and tag. For multiple vlans, use multiple --vlan entries. (default: )
      --self-ip <name:name, address:ip_address, vlan:vlan_name, [allow:service1:port1 service2:port2], [trafficGroup:traffic_group_name]>  Create self IP with name and ip_address on vlan with optional port lockdown. For multiple self IPs, use multiple --self-ip entries. Default CIDR prefix is 24 if not specified. (default: )
      --force-reboot                                                                                                                       Force a reboot at the end. This is necessary for some 2+ NIC configurations.
      -h, --help                                                                                                                           output usage information
    
## runScript.js

Runs an arbitrary script.
    
    Usage: runScript [options]
    
    Options:
    
      -V, --version                  output the version number
      --background                   Spawn a background process to do the work. If you are running in cloud init, you probably want this option.
      -f, --file <script>            File name of script to run.
      -u, --url <url>                URL from which to download script to run. This will override --file.
      --cl-args <command_line_args>  String of arguments to send to the script as command line arguments.
      --shell <full_path_to_shell>   Specify the shell to run the command in. Default is to run command as a separate process (not through a shell).
      --signal <signal>              Signal to send when done. Default SCRIPT_DONE.
      --wait-for <signal>            Wait for the named signal before running.
      --cwd <directory>              Current working directory for the script to run in.
      --log-level <level>            Log level (none, error, warn, info, verbose, debug, silly). Default is info. (default: info)
      -o, --output <file>            Log to file as well as console. This is the default if background process is spawned. Default is /tmp/runScript.log
      --no-console                   Do not log to console. Default false (log to console).
      -h, --help                     output usage information
    
## Standalone licensing

### Install
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# run util bash -c "mkdir -p /config/licensing; cd /config/licensing; npm --loglevel=error install @f5devcentral/f5-cloud-libs"

### License from BIG-IQ
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# license path <install_path> password <big_ip_admin_password> big-iq-host <big_iq_ip_address> big-iq-user <big_iq_admin_user> big-iq-password <big_iq_admin_password> license-pool-name <license_pool>

### Issue revoke request to BIG-IQ
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# license path <install_path> password <big_ip_admin_password> big-iq-host <big_iq_ip_address> big-iq-user <big_iq_admin_user> big-iq-password <big_iq_admin_password> license-pool-name <license_pool> revoke

### Other licensing options
    admin@(bigip1)(cfg-sync Standalone)(NO LICENSE)(/Common)(tmos)# license help
