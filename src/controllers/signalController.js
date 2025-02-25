import { logger } from '../utils/logger.js';
import { getIO } from '../utils/io.js';
import Meeting from '../models/meetingModel.js';

// ICE servers configuration
const iceServers = [
  {
    urls: [
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302'
    ]
  }
];

export const handleSignal = async (req, res) => {
  try {
    const { targetId, signal, meetingId } = req.body;

    // Verify meeting exists and user is a participant
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isParticipant = meeting.participants.includes(req.user._id) || 
                         meeting.hostId.toString() === req.user._id.toString();
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Emit the signal through socket.io
    getIO().to(targetId).emit('webrtc-signal', {
      senderId: req.user._id,
      signal,
      meetingId
    });

    res.json({ status: 'success' });
  } catch (error) {
    logger.error(`Signal error: ${error.message}`);
    res.status(500).json({ message: 'Failed to send signal' });
  }
};

export const getIceServers = async (req, res) => {
  try {
    res.json({
      status: 'success',
      data: { iceServers }
    });
  } catch (error) {
    logger.error(`Get ICE servers error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get ICE servers' });
  }
}; 