// dependencies
var async = require('async');
var gm = require('gm')
            .subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');
var fs = require("fs");
const readChunk = require('read-chunk');
const fileType = require('file-type');

var AWS = require('aws-sdk');
const SQS = new AWS.SQS({ apiVersion: '2012-11-05' });

// constants
var MAX_WIDTH  = 100;
var MAX_HEIGHT = 100;

// get reference to S3 client 
var s3 = new AWS.S3();

// Your queue URL stored in the queueUrl environment variable
const QUEUE_URL = process.env.queueUrl;

exports.handler = function(event, context, callback) {
//    console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
    
    var srcBucket, srcKey, dstBucket, destKey = ''; 
    var maxHeight, maxWidth = '';
    var receiptHandle;
    // Check if we dealing with api gateway
    if (event.resource !== undefined) {
        var response = JSON.parse(event.body);
        srcBucket = response.bucket;
        srcKey = decodeURIComponent(response.key.replace(/\+/g, " "));
    }
    // Check lambda called directly
    else if (event.Records !== undefined) {
        // Read options from the event.
        srcBucket = event.Records[0].s3.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    }
    // Check if its a polling event
    else if(event.MessageId !== undefined) {
        var response = JSON.parse(event.Body);

         srcBucket = response.srcBucket;
         srcKey = response.srcKey;
         dstBucket = response.dstBucket;
         destKey = response.destKey;
         maxHeight = response.height;
         maxWidth = response.width;
         receiptHandle = event.ReceiptHandle;
    }
    else {
        callback("Unknown request type.");
        return;
    }

    processFile(srcBucket, srcKey, dstBucket, destKey, maxHeight, maxWidth, receiptHandle);
    
    function processFile(srcBucket, srcKey, dstBucket, destKey, maxHeight, maxWidth, receiptHandle) {
        // console.log(srcBucket +', '+ srcKey +', '+ dstBucket+', '+ destKey+', '+ maxHeight+', '+ maxWidth);
        var splitSrcKey = srcKey.split('/');
        var fileName = splitSrcKey[splitSrcKey.length - 1];
        // If destination bucket is empty, default to source bucket
        if (dstBucket === '') {
            dstBucket = srcBucket;
        }
        // If height key is empty, use the default
        if (maxHeight === '') {
            maxHeight = MAX_HEIGHT;
        }
        // If width key is empty, use the default
        if (maxWidth === '') {
            maxWidth = MAX_WIDTH;
        }
        // If destination key is empty, use the srcFile
        if (destKey === '') {
            destKey = 'resized' + maxHeight + 'x' + maxWidth + '/' + srcKey;
        }

        if (srcKey === '' || srcKey === undefined) {
            callback("No source key defined.");
            return;
        }
        if (destKey === '' || destKey === undefined) {
            callback("No destination key defined.");
            return;
        }
        
        async.waterfall([
            download,
            checkType,
            transform,
            upload,
            deleteMessage
        ], function (err) {
                if (err) {
                    console.error(
                        'Unable to resize ' + srcBucket + '/' + srcKey +
                        ' and upload to ' + srcBucket + '/' + destKey +
                        ' due to an error: ' + err
                    );
                } else {
                    console.log(
                        'Successfully resized ' + srcBucket + '/' + srcKey +
                        ' and uploaded to ' + srcBucket + '/' + destKey
                    );
                }
                
                if (event.resource !== undefined) {
                    callback(null, {
                        statusCode: 200,
                        body: "Success"
                    });
                }
                else {
                    callback(null, "Success");
                }
        });
        // Download the image from S3 into a buffer.
        function download(callback) {
//            console.log('download');
            s3.getObject({
                    Bucket: srcBucket,
                    Key: srcKey
                },callback);
        }
        // Check the file type.
        function checkType(response, callback) {
//            console.log('checkType');
            fs.writeFile("/tmp/" + fileName, response.Body, function (err) {
                if (err) {
                    callback(err);
                } else {
                    const buffer = readChunk.sync("/tmp/" + fileName, 0, 4100); 
                    var fileInfo = fileType(buffer);
                    var imageType = fileInfo.ext;

                    if (imageType !== "jpg" && imageType !== "png") {
                        callback('Unsupported image type: ${imageType}');
                    } 
                    else {
                        callback(null, response, imageType);
                    }
                }
            });
        }
        // Transform the image buffer in memory.
        function transform(response, imageType, callback) {
//            console.log('transform');
            gm(response.Body).size(function(err, size) {
                if (err) {
                    callback(err);
                }
                // Infer the scaling factor to avoid stretching the image unnaturally.
                var scalingFactor = Math.min(
                    maxWidth / size.width,
                    maxHeight / size.height
                );
                var width  = scalingFactor * size.width;
                var height = scalingFactor * size.height;

                this.resize(width, height)
                    .toBuffer(imageType, function(err, buffer) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, response.ContentType, buffer);
                        }
                    });
            });
        }
        // Stream the transformed image to a different S3 bucket.
        function upload(contentType, data, callback) {
//            console.log('upload');
            s3.putObject({
                    Bucket: dstBucket,
                    Key: destKey,
                    Body: data,
                    ContentType: contentType,
                    ACL: 'public-read'
                },callback);
        }
        // Delete the sqs message from the queue if one exists
        function deleteMessage() {
//            console.log('delete');
            if (receiptHandle !== '') {
                const params = {
                    QueueUrl: QUEUE_URL,
                    ReceiptHandle: receiptHandle
                };
                SQS.deleteMessage(params, (err) => callback(err));
                callback(null);
            }
            else {
                callback(null);
            }
        }
    }
};

