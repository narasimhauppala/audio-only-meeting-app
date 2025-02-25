import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { logger } from '../utils/logger.js';
import { promisify } from 'util';

export const protect = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization?.startsWith('Bearer') ||
      req.cookies.jwt
    ) {
      token = req.headers.authorization?.split(' ')[1] || req.cookies.jwt;
      
      if (!token) {
        throw new Error('No token provided');
      }

      const decoded = await promisify(jwt.verify)(
        token,
        process.env.JWT_SECRET
      );
      
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        throw new Error('User no longer exists');
      }

      if (user.passwordChangedAt && decoded.iat < user.passwordChangedAt.getTime() / 1000) {
        throw new Error('Password recently changed, please login again');
      }

      if (!user.isActive) {
        throw new Error('User account is deactivated');
      }

      req.user = user;
      next();
    } else {
      res.status(401).json({ message: 'Not authorized, no token' });
    }
  } catch (error) {
    logger.error(`Auth error: ${error.message}`);
    res.status(401).json({ 
      status: 'error',
      message: 'Not authorized',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
};

export const isHost = (req, res, next) => {
  if (req.user && req.user.role === 'host') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as host' });
  }
};

export const isStudent = (req, res, next) => {
  if (req.user && req.user.role === 'student') {
    next();
  } else {
    res.status(403).json({ 
      status: 'error',
      message: 'Not authorized as student' 
    });
  }
};

export const isHostOrStudent = (req, res, next) => {
  if (req.user && (req.user.role === 'host' || req.user.role === 'student')) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized' });
  }
};

export const hasPermission = (permission) => {
  return (req, res, next) => {
    if (req.user && req.user.hasPermission(permission)) {
      next();
    } else {
      res.status(403).json({ 
        status: 'error',
        message: 'You do not have permission to perform this action' 
      });
    }
  };
}; 