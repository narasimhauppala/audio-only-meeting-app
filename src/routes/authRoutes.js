import express from 'express';
import { login, getProfile, changePassword } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate, passwordValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Public routes
router.post('/login', login);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/change-password', protect, validate(passwordValidation), changePassword);

export default router; 