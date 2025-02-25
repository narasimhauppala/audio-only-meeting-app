import express from 'express';
import { protect, isHost, isStudent } from '../middleware/authMiddleware.js';
import { validateMeetingLimits, validateParticipantLimit, validateMeetingAccess } from '../middleware/meetingMiddleware.js';
import {
  createMeeting,
  joinMeeting,
  leaveMeeting,
  switchMode,
  startPrivateConversation,
  endPrivateConversation,
  getMeetingParticipants,
  endMeeting,
  getStudentMeetings,
  activateMeeting,
  getMeeting,
  getStudentRecordings,
  requestPrivateConversation
} from '../controllers/meetingController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Host only routes
router.post('/create', isHost, validateMeetingLimits, createMeeting);
router.post('/activate/:meetingId', isHost, activateMeeting);
router.post('/switch-mode', isHost, switchMode);
router.post('/:meetingId/end', isHost, endMeeting);
router.get('/participants/:meetingId', isHost, getMeetingParticipants);

// Student routes
router.get('/student/meetings', isStudent, getStudentMeetings);
router.get('/student/recordings', isStudent, getStudentRecordings);

// Common routes (both host and student can access)
router.post('/join', validateParticipantLimit, joinMeeting);
router.post('/leave', leaveMeeting);

// Student only routes
router.post('/private/start', isStudent, startPrivateConversation);
router.post('/private/end', isStudent, endPrivateConversation);

// Student meeting routes
router.post('/:meetingId/join', validateMeetingAccess, joinMeeting);
router.post('/:meetingId/leave', protect, leaveMeeting);

// Get meeting details - accessible by both host and students
router.route('/')
  .post(isHost, createMeeting);

// Get meeting details - accessible by both host and students
router.route('/:meetingId')
  .get(validateMeetingAccess, getMeeting);

// Add these routes
router.post('/private-request', isStudent, requestPrivateConversation);

export default router; 