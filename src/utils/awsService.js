import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { PassThrough } from 'stream';
import { logger } from './logger.js';

let s3Client = null;

const initializeS3Client = () => {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      },
      maxAttempts: 3,
      retryMode: 'standard'
    });
  }
  return s3Client;
};

export const verifyCredentials = async () => {
  try {
    const client = initializeS3Client();
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: 'test-credentials'
    });

    try {
      await client.send(command);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        logger.info('AWS credentials verified successfully');
        return true;
      }
      throw error;
    }
  } catch (error) {
    logger.error(`AWS credentials verification failed: ${error.message}`);
    throw new Error(`AWS credentials are invalid: ${error.message}`);
  }
};

export const uploadRecording = async (fileBuffer, meetingId, studentId) => {
  try {
    const client = initializeS3Client();
    const key = `recordings/${meetingId}/${studentId}_${Date.now()}.webm`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: 'audio/webm'
    });

    await client.send(command);
    return key; // Return just the key, not the full URL
  } catch (error) {
    logger.error(`S3 upload error: ${error.message}`);
    throw error;
  }
};

export const createAudioStream = async (meetingId, userId) => {
  try {
    const client = initializeS3Client();
    const streamKey = `recordings/${meetingId}/${userId}-${Date.now()}.webm`;
    
    const upload = new Upload({
      client,
      params: {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: streamKey,
        ContentType: 'audio/webm',
      }
    });

    return {
      streamKey,
      stream: upload
    };
  } catch (error) {
    logger.error(`Create audio stream error: ${error.message}`);
    throw new Error('Failed to create audio stream');
  }
};

export const generateSignedUrl = async (fileKey) => {
  try {
    if (!fileKey) {
      throw new Error('No file key provided');
    }

    const client = initializeS3Client();

    // Verify object exists
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileKey
      });
      await client.send(headCommand);
    } catch (error) {
      if (error.name === 'NotFound') {
        logger.error(`File not found in S3: ${fileKey}`);
        return null;
      }
      throw error;
    }

    // Generate signed URL
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileKey
    });

    const signedUrl = await s3GetSignedUrl(client, command, {
      expiresIn: 3600 // URL valid for 1 hour
    });

    return signedUrl;
  } catch (error) {
    logger.error(`Error generating signed URL: ${error.message}`);
    return null;
  }
};

export const deleteRecording = async (fileKey) => {
  try {
    const client = initializeS3Client();
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileKey
    });
    await client.send(command);
    logger.info(`Successfully deleted recording: ${fileKey}`);
  } catch (error) {
    logger.error(`Error deleting recording: ${error.message}`);
    throw error;
  }
};

// Test S3 connection and permissions
export const testS3Connection = async () => {
  try {
    const client = initializeS3Client();
    const testKey = `test-connection-${Date.now()}.txt`;
    const testData = 'Testing S3 connection and permissions';

    // Try to upload a test file
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: testKey,
      Body: testData,
      ContentType: 'text/plain'
    });
    await client.send(uploadCommand);

    // Try to get the file
    const getCommand = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: testKey
    });
    await client.send(getCommand);

    // Clean up test file
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: testKey
    });
    await client.send(deleteCommand);

    logger.info('S3 connection test successful');
    return true;
  } catch (error) {
    logger.error(`S3 connection test failed: ${error.message}`);
    throw error;
  }
};

export const getStreamUrl = async (streamKey) => {
  try {
    if (!streamKey) {
      throw new Error('No stream key provided');
    }

    const client = initializeS3Client();
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: streamKey
    });

    const signedUrl = await s3GetSignedUrl(client, command, {
      expiresIn: 3600 // URL valid for 1 hour
    });

    return signedUrl;
  } catch (error) {
    logger.error(`Error getting stream URL: ${error.message}`);
    return null;
  }
}; 