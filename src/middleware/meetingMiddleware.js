import Meeting from '../models/meetingModel.js';
import User from '../models/userModel.js';
import { logger } from '../utils/logger.js';

export const validateMeetingLimits = async (req, res, next) => {
  try {
    const { hostId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check daily meeting limit
    const dailyMeetings = await Meeting.countDocuments({
      hostId,
      createdAt: { $gte: today }
    });

    if (dailyMeetings >= 25) {
      return res.status(400).json({
        message: 'Daily meeting limit (25) reached'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const validateParticipantLimit = async (req, res, next) => {
  try {
    const { meetingId } = req.body;
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.participants.length >= 50) {
      return res.status(400).json({
        message: 'Meeting participant limit (50) reached'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const validateMonthlyMeetings = async (req, res, next) => {
  try {
    const { hostId } = req.body;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyMeetings = await Meeting.countDocuments({
      hostId,
      createdAt: { $gte: startOfMonth }
    });

    if (monthlyMeetings >= 25 * 25) { // 25 meetings * 25 days
      return res.status(400).json({
        message: 'Monthly meeting limit reached'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const validateMeetingAccess = async (req, res, next) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findById(meetingId)
      .populate('hostId', 'username')
      .populate('participants');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // If user is the host of the meeting
    if (req.user.role === 'host' && meeting.hostId._id.equals(userId)) {
      req.meeting = meeting;
      return next();
    }

    // If user is a student
    if (req.user.role === 'student') {
      const student = await User.findById(userId)
        .populate('hostId')
        .populate('createdBy');

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      // Check if student's host created this meeting or student is a participant
      const studentHost = student.hostId || student.createdBy;
      const isHostsMeeting = studentHost && studentHost._id.equals(meeting.hostId._id);
      const isParticipant = meeting.participants.some(p => p._id.equals(userId));

      if (!isHostsMeeting && !isParticipant) {
        return res.status(403).json({ message: 'You are not authorized to join this meeting' });
      }

      req.meeting = meeting;
      req.student = student;
      return next();
    }

    // If neither host of meeting nor authorized student
    return res.status(403).json({ message: 'Not authorized to access this meeting' });
  } catch (error) {
    logger.error(`Meeting access validation error: ${error.message}`);
    res.status(500).json({ message: 'Failed to validate meeting access' });
  }
}; 