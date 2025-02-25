import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

export const generateToken = (id) => {
  try {
    return jwt.sign(
      { id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
  } catch (error) {
    logger.error(`Token generation error: ${error.message}`);
    throw new Error('Failed to generate token');
  }
};

export const generateParticipantToken = (userId, meetingId) => {
  try {
    return jwt.sign(
      { 
        userId,
        meetingId,
        type: 'meeting'
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '24h' 
      }
    );
  } catch (error) {
    logger.error(`Token generation error: ${error.message}`);
    throw new Error('Failed to generate participant token');
  }
}; 