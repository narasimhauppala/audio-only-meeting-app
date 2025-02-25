import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { handleSignal, getIceServers } from '../controllers/signalController.js';
import { body } from 'express-validator';
import { validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.use(protect);

// Validation for signal data
const signalValidation = [
  body('targetId').notEmpty().withMessage('Target ID is required'),
  body('meetingId').notEmpty().withMessage('Meeting ID is required'),
  body('signal').notEmpty().withMessage('Signal data is required')
];

// WebRTC signaling routes
router.post('/signal', validate(signalValidation), handleSignal);
router.get('/ice-servers', getIceServers);

export default router; 