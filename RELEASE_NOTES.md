# Release notes

## Release 4.29.0
* Added support for revoking BIG-IP license

## Release 4.28.2
* Updated overwrite boolean to relicense the BIG-IP if enabled, regardless of additional context. Additionally, will relicense the BIG-IP if License usage equals "Revoked License".

## Release 4.28.1
* Updated bigIp provider to check logs for successful UCS restore when REST task ID is lost

## Release 4.28.0
* Updated tryUntil to allow for a new shortRetryOnError to allow us to try less on specified error codes

## Release 4.27.1
* Updated autoscale.js and createRandomUser function to reset password on temporary account creation

## Release 4.27.0
* Updated createUser.sh script to reset password on account creation

## Release 4.26.9
* Removed Google Analytics from usage metrics providers
* Updated async libary to v2.6.4

## Release 4.26.8
* Updated path-parse libary to v1.0.7

## Release 4.26.7
* Revert 'Updated pulling MAC Address from mgmt interface endpoint instead of the host MAC Address.' from 4.25.1

## Release 4.26.6
* Replace slashes in names with tilde's when modifying objects

## Release 4.26.4
* Expose chargebackTag BIGIQ license tag.

## Release 4.26.3
* Fix bug in createOrModify when silent option is used

## Release 4.26.2
* Fix race condition between createOrModify and MCPD where MCPD first reports an object exists but it has already been deleted.

## Release 4.26.1
* Add failOnErrorMessages and failOnErrorCodes which are arrays of strings/regexes and integers, respectively. That prevent the retry logic from running. Effectively allowing for an early exit of specific failures.
* Add option to provision BIG-IP modules using a transaction

## Release 4.26.0
* Add BigIp.setHost method

## Release 4.25.1
* Updated pulling MAC Address from mgmt interface endpoint instead of the host MAC Address.

## Release 4.25.0
* Update generate password script to support generating password with special characters.
* Remove cluster credentials from storage after clustering completes
* Removed dependency vulnerabilities.

## Release 4.24.0
* Add new retry option to util script
* Update bigip init method to allow passing retry options
* Add support for using a third party auth provider when licensing from BIG-IQ
* Add option to retry for required fields when fetching via iControl REST

## Release 4.23.1
* Added additional logic to update_autoscale_ucs.py script to account for .1 vs .11 vs .111 when running replace function.
Previously, script would replace all instances of specified values, including ip values for ltm nodes which was not desired
behavior. Script now contains logic to regex mpre specific matches, ie: 10.1.1.1 versus 10.1.1.111, and only for hostname,
gw, self-ip, & dhcp-mgmt which is required when restoring instance with UCS.

## Release 4.23.0
* Use a retry on /tm/shared/licensing/registration. This sometimes give an ECONNRESET error.

## Release 4.22.0
* Add getNodesByResourceId to cloudProvider
* Update bigip module to improve UCS restore; promise is rejected to trigger workaround when system restarts happen
* Fix autoscale script to define correct path to primary key
* Update default log filename for aws verifyDeployment.js script

## Release 4.21.0
* Enhance workflow used for electing primary host in autoscale solution
    - the primary election workflow prefers running cluster config over UCS restore when electing a new master
    - the election is done using lowest private mgmt ip as well as lastBackup date, which is stored under instance metadata in Cloud Storage
* Expose tenant parameter in onboard.js script to allow include/append deployment specific metadata in tenant value stored on BIGIQ side; example:
   - default tenant value: ```hostname=<hostname>, mgmtPrivdate=<address>```
   - with deployment specific tenant value: ```"<deployment_specific_tenant_value>,hostname=<hostname>, mgmtPrivdate=<address>"```
* Add script to AWS provider to verify deployment completion based on sync status; script sends signal to AWS Cloud Formation Web Service to complete deployment
* Update Azure cloud provider to allow only primary host handle license revocation and metadata deletion
* Rename variable/parameter 'master' to 'primary'

## Release 4.20.0
* Update AWS Cloud provider to resolve issue with autoscale solution when licenses are not revoked on BIGIQ side

## Release 4.19.0
* Update autoscale script to populate lastBackup date within instance metadata when UCS generated. The lastBackup date will be shared with other hosts when they get in sync with master.
* Enable logic on autoscale.js script for preventing restoring UCS file when new master elected and new master was in sync with previous master.

## Release 4.18.0
* Improve availability check for BIGIP system
* Update format for the tenant string used for sending BIGIP host metadata to BIGIQ as part of licensing via BIGIQ system
    * Old: ```{ "mgmtAddress": "<ip_address>", "hostname": "<hostname>"}```
    * New: ```"mgmtAddress": "<ip_address>", "hostname": "<hostname>"```

## Release 4.17.1
* Resolved big-iq onboard error "Public URI path not registered"
  * Update bigIp.js to only use availability check '/shared/iapp/package-management-tasks/available' when system is a bigip.

## Release 4.17.0
* Update verifyHash with new checksum for f5-appsvcs-3.18.0

## Release 4.16.0
* Update verifyHash with new checksum for f5-cloud-libs-azure
* Modified Azure scripts to minimize amount of API calls
* Autoscale scripts now make use of Azure bulk API feature

## Release 4.15.1
* Use baseMac rather than hostMac for determining MAC address when licensing from BIG-IQ

## Release 4.15.0
* Fix updateAutoScaleUcs script to address problem with restoring UCS file on new BIGIP device
* Introduce optimization for sync cluster termination; devices won't be deleted from ASM specific data sync groups
* Expose parameter in AWS Clour provider to allow pass number of message consumed in signle autoscale run
* Fix to pervent failure during UCS temp directory creation

## Release 4.14.0
* Update httpUtil to include logging HTTP body for error message handling
* Add option to skip active check after provisioning

## Release 4.13.3
* Update verifyHash with new checksum for f5-cloud-libs-azure
* Update Azure provider failover script to populate enableAcceleratedNetworking property on Networking Interface

## Release 4.12.0
* Added BIG-IP hostname and mgmt address into BIG-IQ 'tenant' field when requesting license from BIG-IQ.
* Added autoscale timeout for autoscale script execution.
* Added logic to pass BIG-IP private address to BIG-IQ when BIG-IP is provisioned in Azure cloud.
* Fixed "passphrase decryption failure" problem which occurs when new master joins autoscale cluster.

## Release 4.11.0
* Enable retry logic for TMSH command execution to mitigate problem when TMSH command fails due to MCP un-availability
* Add validation for generated UCS file to prever corrupted UCS file problem
* Update condition for triggering master re-election for autoscale solution; this should prevent the problem when master host is stuck at BECOMING_MASTER state

## Release 4.10.3
* Add additional endpoint checks in the BIG-IP ready check, including /mgmt/tm/sys/ready
* Add retry for ILX package installation
* Add retry for a /mgmt/tm/sys/config save event
* Add retry for tmsh command execution, resolves issue during encrypt/decrypt operations
* Update retry logic for module installation

## Release 4.10.2
* Add retry for BIG-IQ version info

## Release 4.10.1
* Handle trunks in createOrModify

## Version 4.10.0
* Use more recent BIG-IQ licensing APIs for reg key pools

## Version 4.9.2
* Fix to correctly handle the 'CREATED' BIG-IP async Task Status

## Version 4.9.1
* Fix to handle response containing more than 1 device from /cm/device
* Fix to set required BIG-IP modules for Azure Autoscale solutions

## Version 4.9.0
* Support for ignoring device trust sync complete failures due to disconnected device
* Fix to handle updating hostname when multiple devices exist on BIG-IP
* Fix to handle updating the httpsPort when adding BIG-IP to license pool on BIG-IQ
* Support for updating device group settings when group already exists
* Fix to successfully mount tmpfs during temporary password generation
* Support matching IP configurations with Self IPs in Azure Failover
* Support providing a list of BIG-IP modules to Azure autoscale solutions

## Version 4.8.3
* Updated verifyHash file to include f5.aws_advanced_ha.v1.4.0rc5.tmpl

## Version 4.8.2
* Allow NPM install to run on Windows
* getDataFromUrl accepts arbitrary HTTP(S) options
* f5-cloud-libs-consul supports specifying path to a CA Certificate Bundle

## Version 4.8.1
* Update cloud-libs password generation to pass new Password Policy
* Fix for network.js not completing on certain Azure instance sizes with certain licenses
* Fix for completing BIG-IQ setup during onboarding

## Version 4.8.0
* Added BIG-IQ LM Cluster Public IP Failover script
* Added the f5-cloud-libs-consul Cloud Provider
* Added support for wildcard propertyPaths in genericNodeProvider
* Fix to allow F5 product to be specified when calling joinCluster
* Fix dependency in f5-cloud-libs-gce to support Node 4

## Version 4.7.0
* Added check if f5-cloud-libs is running in a container
* Added timestamp to f5-cloud-libs analytics
* Fix to ensure primary Subscription is used during Azure Failover if subscription list fails in Azure Gov Cloud
* Fix in Google Provider to ensure UCS backups are cleaned up locally, and in Google Cloud Storage

## Version 4.6.1
* Added Service Discovery support for Azure Gov Cloud
* Support for directly providing a BIG-IP Auth Token during authentication
* Fix to handle errors when installing an already installed iLX package
* Fix to handle errors when updating default self-allow ports
* Fix to ensure multiple cluster-update processes do not run concurrently on the same BIG-IP
* Fix to ensure Azure autoscale configuration is not overwritten during an autoscale event

## Version 4.6.0
* Add new genericNodeProvider for Service Discovery of services cataloged in a generic JSON document
* Support for clustering BIG-IQ in Google
* Add interface as a valid destination when creating BIG-IP routes
* Fix an issue where Service Discovery could not run on BIG-IP v12.1
* Support for falling back to HTTP Basic Auth when licensing a BIG-IP from a BIG-IQ
* Support installation of iLX packages during f5-cloud-libs onboarding
    * f5-cloud-libs verifyHash can now verify the latest LTS release of AS3
* Update BIG-IQ licensing failure logging to include failure messages from BIG-IQ
* Support for installing private keys with consistent key names across BIG-IP and f5-cloud-libs versions
* Add auto-detection of BIG-IQ license provider by license pool type
* Support multiple Azure subscriptions in Azure failover
    * Includes support for User Defined Routes in multiple Azure subscriptions
* Support BIG-IQ failover in AWS
* Fix for Google provider to determine instance region
* Fix for enabling f5-cloud-libs log file rotation

## Version 4.5.1
* Fix for running f5-cloud-libs on BIG-IP 12.1
* Fix for autoscale BIG-IP 13.1 in f5-cloud-libs-gce

## Version 4.5.0
* Support for clustering BIG-IQ in AWS and Azure
* Fix for tagging instance in single instance AWS Auto Scale Group
* Support for retrieving SSL certificates in nested AWS S3 folders
* Support for specifying Discovery Address when onboarding a BIQ-IQ
* Support for updating objects in partitions other than Common
* Fix 1nicSetup.sh to retrieve Gateway CIDR from dhcp lease
* Add --force-reboot option in onboard.js and network.js
* Fix path in getNameServer.sh script
* Autoscale.js ensures ConfigSync IP address is set when cluster is updated

## Version 4.4.0
* Support for enabling ASM sync in DeviceGroup if ASM module is provisioned
* Add option for signaling CloudFormation when a BIG-IP or BIG-IQ has been onboarded
* Scripts now signal if they were unsuccessful, log their exceptions, and exit if another script encounters an exception
    * Added --error-file option to specify filename to log script exceptions
* Scripts handle defaults for optional parameters. For example --metrics is legal with no metrics provided.
* Support for BIG-IP 14.1 (differences in ifconfig)

## Version 4.3.0
* Support for onboarding a BIG-IQ
* Support for symmetric encryption of credentials (to handle large credentials)
* scripts/getNodes.js script
    * Replaces f5-cloud-workers cloudNodesWorker
    * Support for retrieving pool members in a cloud different from where BIG-IP is running
* Add --no-unreachable option to onboard.js to prevent use of the unreachable API when licensing from BIG-IQ 5.4+

## Version 4.2.0
* Support for setting management route via network.js
* Support for reading from rest storage
* Fix for vlan name in 1 nic configurations

## Version 4.1.0
* Support for revoke of CLPv2 license for autoscaling solutions that license from BIG-IQ 5.3+
* Support for licensing an unreachable device from BIG-IQ 5.4+
    * --cloud parameter is required when calling onboard.js when licensing via BIG-IQ 5.4+
* Support revoke for standalone licensing script
* More reliable provisioning of ASM and AFM

## Version 4.0.0
**This version is not backwards compatible. The install location of `f5-cloud-libs`
and `f5-cloud-libs-<cloud>` has changed to support installation from npm**

* Scripts now exit with status code 1 on failure
* Support autoscaling with BYOL and utility billing instances in one cluster
* Support autoscaling with DNS updates
* Support for automatic backups in autoscaling solutions
* Update scripts and lib code to the [Airbnb JavaScript style guide](https://github.com/airbnb/javascript)
* Provide independent licensing script callable from tmsh
* Add options for CLPv2 when licensing via BIG-IQ

## Version 3.6.0
* Add --shell option to scripts/runScript.js

## Version 3.5.0
* Autoscale improvements
    * More device group options in autoscale.js
    * Use save-on-auto-sync when creating device group
    * Fix password syncing in master election

## Version 3.4.0
* Autoscale improvements
    * Handle replacing master
    * Revoke license if licensed from BIG-IQ

## Version 3.3.0
* License BIG-IP from BIG-IQ 5.2 and 5.3

## Version 3.2.0
* Support for S3 ARN for licensing via BIG-IQ

## Version 3.1.0
* Support for licensing via BIG-IQ
* Support for service discovery

## Version 3.0.1
* Add retry for password-url when licensing via BIG-IQ.

## Version 3.0.0
**This version is not backwards compatible. The format for options on network.js has changed.
See node scripts/network.js --help for details**

* License BIG-IP from BIG-IQ 5.0 and 5.1
* More options for network.js
    * Add arbitrary routes
    * Support mtu on vlans
    * Support port lockdown on self IPs
* Updates to signaling. --wait-for now means 'run if the signal has been sent' rather than 'run when the signal is sent'
* More robust reboot handling.

## Version 2.3.0
* Support for Azure autoscaling
* Support --password-url in network.js
* Restore from stored UCS

## Version 2.2.0
* Restore from saved UCS file if present in storage account

## Version 2.1.0
* Allows for autoscaling and clustering without providing a password in the template
* Add hash verification for all downloaded files
* Fix race condition when running multiple f5-cloud-libs scripts at once

## Version 2.0.0
* onboard.js option of --set-password is no longer available, use --update-user instead.
* All scripts that take --password now also support --password-url. Only 'file' URLs are supported for now.
* Add option to suppress console output (--no-console).
* Add support for verifying hash of downloaded f5-cloud-libs tarball.
* Add some parsing of sync messages to get sync to work more often.
