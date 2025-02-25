import User from '../models/userModel.js';
import { logger } from '../utils/logger.js';

export const initAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      await User.create({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD,
        role: 'admin',
        isActive: true
      });
      logger.info('Admin account created successfully');
    }
  } catch (error) {
    logger.error(`Admin initialization error: ${error.message}`);
    process.exit(1);
  }
}; 