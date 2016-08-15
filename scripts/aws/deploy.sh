pushd ../
tar --exclude=".git" -zcvf f5-cloud-libs.tar.gz f5-cloud-libs
aws s3 cp f5-cloud-libs.tar.gz s3://f5-cloud-libs/f5-cloud-libs.tar.gz --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers
popd
