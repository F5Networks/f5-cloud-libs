pushd ../
tar --exclude=".git" -zcvf f5-cloud-libs.tar.gz f5-cloud-libs
azure storage blob upload --quiet f5-cloud-libs.tar.gz archive f5-cloud-libs.tar.gz
azure storage blob upload --quiet f5-cloud-libs/azure/runOnboard.sh archive runOnboard.sh
popd
