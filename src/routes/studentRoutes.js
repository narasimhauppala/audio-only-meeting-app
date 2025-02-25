import express from 'express';
import { protect, isStudent } from '../middleware/authMiddleware.js';
import {
  studentLogin,
  getStudentMeetings,
  getStudentRecordings,
  getPrivateRecordings,
  changePassword,
  getStudentInfo
} from '../controllers/studentController.js';
import { validate, passwordValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Public routes
router.post('/login', studentLogin);

// Protected routes
router.use(protect, isStudent);

// Profile routes
router.get('/info', getStudentInfo);
router.post('/change-password', changePassword);

// Meeting routes - removed validateMeetingAccess since we're listing meetings
router.get('/meetings', getStudentMeetings);

// Recording routes
router.get('/recordings', getStudentRecordings);
router.get('/recordings/private', getPrivateRecordings);

export default router; 