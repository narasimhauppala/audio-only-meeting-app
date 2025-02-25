import User from '../models/userModel.js';
import Meeting from '../models/meetingModel.js';
import Recording from '../models/recordingModel.js';
import { generateToken } from '../utils/tokenUtils.js';
import { logger } from '../utils/logger.js';
import { generateSignedUrl as getSignedUrl } from '../utils/awsService.js';

export const studentLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find student
    const student = await User.findOne({ 
      username,
      role: 'student'
    });

    if (!student) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid student credentials'
      });
    }

    // Verify password
    const isMatch = await student.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid student credentials'
      });
    }

    // Check if student is active
    if (!student.isActive) {
      return res.status(401).json({
        status: 'error',
        message: 'Your account has been deactivated. Please contact your host.'
      });
    }

    // Generate token
    const token = generateToken(student._id);

    res.json({
      status: 'success',
      data: {
        _id: student._id,
        username: student.username,
        role: student.role,
        token
      }
    });

  } catch (error) {
    logger.error(`Student login error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Login failed'
    });
  }
};

export const getStudentMeetings = async (req, res) => {
  try {
    // Get the student with populated host info
    const student = await User.findById(req.user._id)
      .populate('hostId', 'username')
      .populate('createdBy', 'username');

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    // Use either hostId or createdBy for finding meetings
    const hostId = student.hostId || student.createdBy;
    if (!hostId) {
      return res.status(404).json({
        status: 'error',
        message: 'No host associated with this student'
      });
    }

    // Get only meetings that:
    // 1. Are created by the student's host
    // 2. Are not private
    // 3. Are either 'created' or 'active' status
    const meetings = await Meeting.find({
      hostId: hostId._id,
      isPrivate: false,
      status: { $in: ['created', 'active'] }
    })
    .populate('hostId', 'username')
    .populate('participants', 'username')
    .populate('activeParticipants', 'username')
    .sort('-createdAt');

    logger.info(`Found ${meetings.length} meetings for student ${student.username}`);

    res.json({
      status: 'success',
      data: { 
        meetings: meetings || [],
        hostInfo: {
          id: hostId._id,
          username: hostId.username
        }
      }
    });
  } catch (error) {
    logger.error(`Get student meetings error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get meetings'
    });
  }
};

export const getStudentRecordings = async (req, res) => {
  try {
    // Get recordings from last 3 days only
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    const recordings = await Recording.find({
      accessibleTo: req.user._id,
      createdAt: { $gte: threeDaysAgo },
      status: 'completed'
    })
    .populate('meetingId', 'topic startTime endTime')
    .populate('hostId', 'username')
    .sort('-createdAt');

    // Add signed URLs for playback
    const recordingsWithUrls = await Promise.all(
      recordings.map(async (recording) => {
        const signedUrl = await getSignedUrl(recording.streamKey);
        return {
          _id: recording._id,
          meetingTopic: recording.meetingId?.topic || 'Untitled Meeting',
          hostName: recording.hostId?.username || 'Unknown Host',
          startTime: recording.startTime,
          endTime: recording.endTime,
          duration: recording.endTime ? 
            (recording.endTime - recording.startTime) / 1000 : null,
          isPrivate: recording.isPrivateConversation,
          playback: {
            url: signedUrl,
            type: 'audio/webm',
            title: `${recording.meetingId?.topic || 'Recording'} - ${new Date(recording.startTime).toLocaleString()}`
          }
        };
      })
    );

    res.json({
      status: 'success',
      data: { recordings: recordingsWithUrls }
    });
  } catch (error) {
    logger.error(`Get student recordings error: ${error.message}`);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to get recordings' 
    });
  }
};

export const getPrivateRecordings = async (req, res) => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    const recordings = await Recording.find({
      studentId: req.user._id,
      isPrivateConversation: true,
      createdAt: { $gte: threeDaysAgo },
      status: 'completed'
    })
    .populate('meetingId', 'topic startTime')
    .populate('hostId', 'username')
    .sort('-createdAt');

    const recordingsWithUrls = await Promise.all(
      recordings.map(async (recording) => {
        const signedUrl = await getSignedUrl(recording.streamKey);
        return {
          _id: recording._id,
          meetingTopic: recording.meetingId?.topic || 'Private Conversation',
          hostName: recording.hostId?.username || 'Unknown Host',
          startTime: recording.startTime,
          endTime: recording.endTime,
          duration: recording.endTime ? 
            (recording.endTime - recording.startTime) / 1000 : null,
          playback: {
            url: signedUrl,
            type: 'audio/webm',
            title: `Private: ${recording.meetingId?.topic || 'Recording'} - ${new Date(recording.startTime).toLocaleString()}`
          }
        };
      })
    );

    res.json({
      status: 'success',
      data: { recordings: recordingsWithUrls }
    });
  } catch (error) {
    logger.error(`Get private recordings error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get private recordings'
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Input validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Both current and new passwords are required'
      });
    }

    // Password length validation
    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 6 characters long'
      });
    }

    // Get student with password
    const student = await User.findById(req.user._id);
    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    // Check current password
    const isMatch = await student.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    student.password = newPassword;
    await student.save();

    logger.info(`Student ${student._id} successfully changed password`);

    res.json({
      status: 'success',
      message: 'Password updated successfully'
    });

  } catch (error) {
    logger.error(`Change password error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update password'
    });
  }
};

export const getMyRecordings = async (req, res) => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    // Get recordings where student is either a participant or it's their private conversation
    const recordings = await Recording.find({
      $and: [
        { createdAt: { $gte: threeDaysAgo } },
        {
          $or: [
            // Get student's private conversations
            { 
              studentId: req.user._id,
              isPrivateConversation: true 
            },
            // Get public meeting recordings where student was a participant
            {
              isPrivateConversation: false,
              accessibleTo: req.user._id
            }
          ]
        }
      ]
    })
    .populate('meetingId', 'topic')
    .populate('hostId', 'name')
    .sort('-createdAt');

    // Generate signed URLs for each recording
    const recordingsWithUrls = await Promise.all(
      recordings.map(async (recording) => {
        const signedUrl = await getSignedUrl(recording.fileUrl);
        return {
          ...recording.toJSON(),
          signedUrl,
          isPrivate: recording.isPrivateConversation
        };
      })
    );

    res.json({
      status: 'success',
      data: { recordings: recordingsWithUrls }
    });
  } catch (error) {
    logger.error(`Get recordings error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get recordings' });
  }
};

export const getStudentInfo = async (req, res) => {
  try {
    const student = await User.findById(req.user._id)
      .populate('hostId', 'username email')
      .populate('createdBy', 'username email')
      .select('-password');

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    const hostInfo = student.hostId || student.createdBy;
    if (!hostInfo) {
      return res.status(404).json({
        status: 'error',
        message: 'No host associated with this student'
      });
    }

    res.json({
      status: 'success',
      data: {
        student: {
          _id: student._id,
          username: student.username,
          role: student.role,
          isActive: student.isActive
        },
        host: {
          _id: hostInfo._id,
          username: hostInfo.username,
          email: hostInfo.email
        }
      }
    });
  } catch (error) {
    logger.error(`Get student info error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get student information'
    });
  }
}; 