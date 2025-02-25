import express from 'express';
import { protect, isHost } from '../middleware/authMiddleware.js';
import { 
  startRecording,
  streamAudio,
  endRecording,
  getRecordingUrl,
  getMeetingRecordings,
  getStudentRecordings,
  getAllAccessibleRecordings
} from '../controllers/recordingController.js';
import multer from 'multer';

const router = express.Router();

router.use(protect);

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Combined middleware for handling both multipart and raw audio data
const audioMiddleware = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  if (contentType.includes('multipart/form-data')) {
    return upload.single('audio')(req, res, (err) => {
      if (err) {
        logger.error('File upload error:', err);
        return res.status(400).json({ 
          message: 'File upload error',
          error: err.message 
        });
      }
      next();
    });
  } else {
    // Handle raw audio data
    express.raw({ 
      type: ['audio/webm', 'application/octet-stream'],
      limit: '10mb'
    })(req, res, next);
  }
};

// Recording management routes
router.post('/start', isHost, startRecording);
router.post('/stream/:recordingId', audioMiddleware, streamAudio);
router.post('/end/:recordingId', endRecording);
router.get('/url/:recordingId', getRecordingUrl);

// Get recordings
router.get('/meeting/:meetingId', getMeetingRecordings);
router.get('/student', getStudentRecordings);

// Add new route to get all accessible recordings
router.get('/accessible', getAllAccessibleRecordings);

export default router; 