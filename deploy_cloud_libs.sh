#!/usr/bin/env bash

echo "Cleanup delivery location..."
aws s3 rm s3://ak-metadata-package-poc/f5-cloud-libs/ --recursive

node --version
npm --version

echo "Deploy f5-cloud-libs..."
npm uninstall
npm install
npm run package
aws s3 sync /Users/kashcheev/Documents/github/f5-cloud-libs/dist/ s3://ak-metadata-package-poc/f5-cloud-libs/

echo "Deploy f5-cloud-libs-aws..."
cd /Users/kashcheev/Documents/github/f5-cloud-libs-aws/
npm uninstall
npm install
npm run package
aws s3 sync /Users/kashcheev/Documents/github/f5-cloud-libs-aws/dist/ s3://ak-metadata-package-poc/f5-cloud-libs/

echo "Deploy f5-cloud-libs-azure..."
cd /Users/kashcheev/Documents/github/f5-cloud-libs-azure
npm uninstall
npm install
npm run package
aws s3 sync /Users/kashcheev/Documents/github/f5-cloud-libs-azure/dist/ s3://ak-metadata-package-poc/f5-cloud-libs/

echo "Deployment completed."
