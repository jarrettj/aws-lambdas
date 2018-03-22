'use strict';
// dependencies
var async = require('async');

const AWS = require('aws-sdk');

const SQS = new AWS.SQS({ apiVersion: '2012-11-05' });
const Lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });

// Your queue URL stored in the queueUrl environment variable
const START_QUEUE_URL = process.env.startQueueUrl;
const QUALIFIER = process.env.qualifier;
const VISIBILITY_TIMEOUT = process.env.visibilityTimeout;
const MAX_NUNMBER_OF_MESSAGES = process.env.maxNumberOfMessages; // Number of messages to get at once
const QUEUE_READERS = process.env.queueReaders; // Number of times to call queue

// Gets messages from SQS
function getSQSMessages(item, callback)
{
    const params = {
            QueueUrl: START_QUEUE_URL,
            MaxNumberOfMessages: MAX_NUNMBER_OF_MESSAGES,
            VisibilityTimeout: VISIBILITY_TIMEOUT
        };
        console.log(params)
    SQS.receiveMessage(params, (err, data) => {
        if (err) {
            return callback(err);
        }
        
        if (data.Messages === undefined) {
            return callback(null, []);
        }
        else {
            return callback(null, data.Messages);
        }
    });
}

// Hit of a request to the resize image lambda
function invokePoller(functionName, message) {
    // Override function name and call standalone lambda resize function
    functionName = 'ResizeImage';
    const params = {
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: new Buffer(JSON.stringify(message))
    };
    if (QUALIFIER !== '') {
        params['Qualifier'] = QUALIFIER;
    }
    
    return new Promise((resolve, reject) => {
        Lambda.invoke(params, (err) => (err ? reject(err) : resolve()));
        // Debudding purposes to see error
        // Lambda.invoke(params, function(err, data) {
        //   if (err) { 
        //       console.log(err, err.stack); // an error occurred
        //       reject(err);
        //   }
        //   else {
        //       console.log('successful response');
        //       console.log(data);           // successful response
        //         resolve();
        //   }
        //  });
    });
}

//function poll(functionName, callback) {
//    var calls = new Array(2);
//    async.concat(calls, getSQSMessages, function(err, responses) {
//        // files is now a list of filenames that exist in the 3 directories
//        console.log(responses);
//        console.log(err)
//        callback(null, "Success");
//    });
//}
//
exports.handler = (event, context, callback) => {
    if (QUEUE_READERS > 100) {
        callback('The maximum concurrent calls is 100.');
    }
    // Retrieve all messages then invoke resize function
    async.waterfall([
            getMessages,
            invokePollerHelper
        ], function (err) {
            if (err) {
                console.error(err);
            } else {
                console.log('Successfully');
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
    // Get messages in a batch
    function getMessages(callback) 
    {
        // The amount of times to make a call to SQS. 
        var calls = new Array(QUEUE_READERS);
        async.concat(calls, getSQSMessages, function(err, messages) {
            // Pass batch of messages to invoker
            callback(null, messages);
        });
    }
    // Call
    function invokePollerHelper(messages, callback) 
    {
        console.log('Process ' + messages.length + ' messages.');
        // for each message, reinvoke the function
        const promises = messages.map((message) => invokePoller(context.functionName, message));
        // complete when all invocations have been made
        Promise.all(promises).then(() => {
            const result = `Messages received: ${messages.length}`;
            callback(null, result);
        });
    }
};
