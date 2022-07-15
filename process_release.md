# f5-cloud-libs release process

* Run `npm version <new_version_number>` to update the version strings.
    * The version string shows up in several places, using the `npm version` script updates them all.
* Use an MR to merge this to `develop`.
* Use an MR to merge `develop` to `master`.
* Using the UI, create a tag `v<new_version>` (for example `v1.28.0`) based off the master branch.
* Publish to npm by running `npm publish --access public`.
* Pull the updated `master` branch.
* Push the updated `master` branch to GitHub.
