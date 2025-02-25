import User from '../models/userModel.js';
import Meeting from '../models/meetingModel.js';
import Recording from '../models/recordingModel.js';
import { logger } from '../utils/logger.js';
import { generateSignedUrl as getSignedUrl } from '../utils/awsService.js';

// Student Management
export const createStudent = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Username already exists'
      });
    }
    
    const student = await User.create({
      username,
      password,
      hostId: req.user._id,
      role: 'student',
      createdBy: req.user._id
    });

    res.status(201).json({
      status: 'success',
      data: {
        student: {
          id: student._id,
          username: student.username
        }
      }
    });
  } catch (error) {
    logger.error(`Create student error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    // Only get students created by this host
    const students = await User.find({ 
      role: 'student',
      createdBy: req.user._id 
    })
    .select('username isActive createdAt')
    .sort('-createdAt');

    res.json({
      status: 'success',
      data: { students }
    });
  } catch (error) {
    logger.error(`Get students error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, isActive } = req.body;

    // Check if new username already exists
    if (username) {
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: id } 
      });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Username already exists'
        });
      }
    }

    // Only update students created by this host
    const student = await User.findOneAndUpdate(
      { 
        _id: id, 
        role: 'student',
        createdBy: req.user._id 
      },
      { username, isActive },
      { new: true }
    ).select('username isActive');

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found or not authorized'
      });
    }

    res.json({
      status: 'success',
      data: { student }
    });
  } catch (error) {
    logger.error(`Update student error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Only delete students created by this host
    const student = await User.findOneAndDelete({ 
      _id: id, 
      role: 'student',
      createdBy: req.user._id 
    });

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found or not authorized'
      });
    }

    res.json({
      status: 'success',
      message: 'Student deleted successfully'
    });
  } catch (error) {
    logger.error(`Delete student error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// Recording Management
export const getAllRecordings = async (req, res) => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    // Get all recordings from host's meetings
    const recordings = await Recording.find({
      hostId: req.user._id,
      createdAt: { $gte: threeDaysAgo }
    })
    .populate('studentId', 'name username')
    .populate('meetingId', 'topic')
    .sort('-createdAt');

    // Generate signed URLs for each recording with error handling
    const recordingsWithUrls = await Promise.all(
      recordings.map(async (recording) => {
        try {
          // Check if we have the correct key to generate URL
          const fileKey = recording.streamKey || recording.fileUrl;
          if (!fileKey) {
            logger.error(`No file key found for recording: ${recording._id}`);
            return {
              ...recording.toJSON(),
              signedUrl: null,
              error: 'Recording file not found',
              isPrivate: recording.isPrivateConversation
            };
          }

          const signedUrl = await getSignedUrl(fileKey);
          if (!signedUrl) {
            throw new Error('Failed to generate signed URL');
          }

          return {
            ...recording.toJSON(),
            signedUrl,
            isPrivate: recording.isPrivateConversation,
            playback: {
              url: signedUrl,
              type: 'audio/webm',
              title: `${recording.meetingId?.topic || 'Recording'} - ${new Date(recording.startTime).toLocaleString()}`
            }
          };
        } catch (error) {
          logger.error(`Error generating signed URL for recording ${recording._id}: ${error.message}`);
          return {
            ...recording.toJSON(),
            signedUrl: null,
            error: 'Failed to generate playback URL',
            isPrivate: recording.isPrivateConversation
          };
        }
      })
    );

    // Filter out recordings without URLs if needed
    const validRecordings = recordingsWithUrls.filter(rec => rec.signedUrl || rec.error);

    res.json({
      status: 'success',
      data: { 
        recordings: validRecordings,
        total: validRecordings.length
      }
    });
  } catch (error) {
    logger.error(`Get host recordings error: ${error.message}`);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch recordings'
    });
  }
};

// Meeting Statistics
export const getMeetingStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await Meeting.aggregate([
      {
        $match: {
          hostId: req.user._id,
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          totalMeetings: { $sum: 1 },
          totalParticipants: { $sum: { $size: "$participants" } },
          averageDuration: { 
            $avg: { 
              $subtract: ["$endTime", "$startTime"] 
            }
          }
        }
      }
    ]);

    res.json({
      status: 'success',
      data: { stats: stats[0] || {} }
    });
  } catch (error) {
    logger.error(`Get meeting stats error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// Add this new function
export const getHostMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({ hostId: req.user._id })
      .select('topic status participants startTime endTime')
      .populate('participants', 'username')
      .sort('-createdAt');

    res.json({
      status: 'success',
      data: { 
        meetings,
        count: meetings.length
      }
    });
  } catch (error) {
    logger.error(`Get host meetings error: ${error.message}`);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch meetings' 
    });
  }
};

// Add this new function to your existing hostController.js
export const updateHostPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Both current and new password are required'
      });
    }

    // Get host from database
    const host = await User.findById(req.user._id);
    if (!host) {
      return res.status(404).json({
        status: 'error',
        message: 'Host not found'
      });
    }

    // Verify current password
    const isMatch = await host.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 6 characters long'
      });
    }

    // Update password
    host.password = newPassword;
    await host.save();

    logger.info(`Host ${host._id} successfully updated password`);

    res.json({
      status: 'success',
      message: 'Password updated successfully'
    });

  } catch (error) {
    logger.error(`Update host password error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update password',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const createMeeting = async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({
        status: 'error',
        message: 'Meeting topic is required'
      });
    }

    const meeting = await Meeting.create({
      topic,
      hostId: req.user._id,
      status: 'created'
    });

    res.status(201).json({
      status: 'success',
      data: {
        meeting: {
          id: meeting._id,
          topic: meeting.topic,
          status: meeting.status
        }
      }
    });
  } catch (error) {
    logger.error(`Create meeting error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create meeting'
    });
  }
}; 