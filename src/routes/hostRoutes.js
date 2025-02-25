import express from 'express';
import { protect, isHost } from '../middleware/authMiddleware.js';
import {
  createStudent,
  updateStudent,
  deleteStudent,
  getAllStudents,
  getAllRecordings,
  getHostMeetings,
  updateHostPassword
} from '../controllers/hostController.js';
import { getHostRecordings, startRecording, stopRecording } from '../controllers/recordingController.js';
import { createMeeting } from '../controllers/hostController.js';

const router = express.Router();

// All routes require host authentication
router.use(protect, isHost);

// Host password update
router.put('/update-password', updateHostPassword);

// Student management
router.route('/students')
  .get(getAllStudents)
  .post(createStudent);

router.route('/students/:id')
  .put(updateStudent)
  .delete(deleteStudent);

// Recordings
router.get('/recordings', getHostRecordings);

// Add new meetings route
router.get('/meetings', getHostMeetings);

// Recording routes
router.post('/recordings/start', startRecording);
router.post('/recordings/stop', stopRecording);

// Create meeting route
router.post('/meetings/create', createMeeting);

export default router; 