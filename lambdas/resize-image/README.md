# resize-image
--------------

The tutorial can be found here https://docs.aws.amazon.com/lambda/latest/dg/with-s3-example.html.

It's simply a modified version of the script found in the tutorial above here https://docs.aws.amazon.com/lambda/latest/dg/with-s3-example-deployment-pkg.html. 

Changes
-------

1. It allows you to slap on an API Gateway endpoint.

TODO
----
Allow the passing of image width/height
Pass through ACL

To run
------

# Install npm packages
npm install

Locally I used AWS SAM. You can ten use Postman to send requests.

Install:
sudo npm install -g aws-sam-local --unsafe-perm

Start api:
sudo sam local start-api

Invoke function:
sudo sam local invoke "ResizeImage" -e test-api-bucket.json

Upload using CLI:
# Create zip of folder contents
zip -r ../resize-image.zip *

# Create
aws lambda create-function --region eu-west-1 --function-name ResizeImage --zip-file fileb://resize-image.zip --role arn:aws:iam::971170084134:role/lambda-resize-image-role --handler ResizeImage.handler --runtime runtime --profile default --timeout 30 --memory-size 1024 --runtime nodejs6.10

# Update 
aws lambda update-function-code --function-name ResizeImage --zip-file fileb:///var/www/aws-scripts/lambdas/resize-image.zip --region eu-west-1
