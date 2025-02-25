import { logger } from '../utils/logger.js';
import multer from 'multer';

export const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

export const handleAwsError = (error, req, res, next) => {
  if (error.name?.includes('AWS') || 
      error.message?.includes('credential') || 
      error.name === 'CredentialsError' ||
      error.name === 'NoSuchKey') {
    logger.error(`AWS Error: ${error.message}`);
    return res.status(500).json({
      status: 'error',
      message: 'Storage service error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
  next(error);
};

export const handleStreamingError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.error('Multer error:', err);
    return res.status(400).json({
      message: 'File upload error',
      error: err.message
    });
  }

  if (err.message === 'Empty audio chunk received') {
    logger.warn('Empty audio data received');
    return res.status(400).json({
      message: 'Empty audio data received',
      error: err.message
    });
  }

  logger.error('Streaming error:', err);
  next(err);
}; 