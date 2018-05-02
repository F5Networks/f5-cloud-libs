# Release notes

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
