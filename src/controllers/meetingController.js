import Meeting from '../models/meetingModel.js';
import Recording from '../models/recordingModel.js';
import { logger } from '../utils/logger.js';
import { getIO } from '../utils/io.js';
import { generateParticipantToken } from '../utils/tokenUtils.js';
import { scheduleMeetingEnd } from '../utils/meetingScheduler.js';

export const createMeeting = async (req, res) => {
  try {
    const { topic } = req.body;
    const meeting = await Meeting.create({
      hostId: req.user._id,
      topic,
      status: 'created',
      maxDuration: 5 * 60 * 60
    });

    res.status(201).json({
      status: 'success',
      data: { meeting }
    });
  } catch (error) {
    logger.error(`Create meeting error: ${error.message}`);
    res.status(500).json({ message: 'Failed to create meeting' });
  }
};

export const joinMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;
    const meeting = req.meeting; // Already validated and populated by middleware

    // Check if meeting is active or created
    if (meeting.status !== 'active' && meeting.status !== 'created') {
      return res.status(400).json({ message: 'Meeting is not active' });
    }

    // If user is host, they can always join their meeting
    if (req.user.role === 'host' && meeting.hostId._id.equals(userId)) {
      // Add to active participants if not already there
      if (!meeting.activeParticipants.includes(userId)) {
        meeting.activeParticipants.push(userId);
        await meeting.save();
      }
    } else {
      // For students, add to participants and active participants if not already there
      if (!meeting.participants.includes(userId)) {
        meeting.participants.push(userId);
      }
      if (!meeting.activeParticipants.includes(userId)) {
        meeting.activeParticipants.push(userId);
      }
      await meeting.save();
    }

    // Get fully populated meeting data
    const populatedMeeting = await Meeting.findById(meetingId)
      .populate('hostId', 'username')
      .populate({
        path: 'participants',
        select: 'username role isActive'
      })
      .populate({
        path: 'activeParticipants',
        select: 'username role isActive'
      });

    // Notify other participants
    const io = req.app.get('io');
    io.to(meetingId).emit('participant-joined', {
      userId,
      username: req.user.username,
      role: req.user.role,
      participantInfo: {
        _id: userId,
        username: req.user.username,
        role: req.user.role,
        isActive: req.user.isActive
      }
    });

    res.json({
      status: 'success',
      data: {
        meeting: populatedMeeting,
        token: generateParticipantToken(userId, meetingId)
      }
    });
  } catch (error) {
    logger.error(`Join meeting error: ${error.message}`);
    res.status(500).json({ message: 'Failed to join meeting' });
  }
};

export const leaveMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Remove user from active participants
    meeting.activeParticipants = meeting.activeParticipants.filter(
      participantId => !participantId.equals(userId)
    );

    // If it's a student, also remove from participants list
    if (req.user.role === 'student') {
      meeting.participants = meeting.participants.filter(
        participantId => !participantId.equals(userId)
      );
    }

    await meeting.save();

    // Get updated meeting data
    const updatedMeeting = await Meeting.findById(meetingId)
      .populate('hostId', 'username')
      .populate({
        path: 'participants',
        select: 'username role isActive'
      })
      .populate({
        path: 'activeParticipants',
        select: 'username role isActive'
      });

    // Notify other participants
    const io = req.app.get('io');
    io.to(meetingId).emit('participant-left', {
      userId,
      username: req.user.username,
      role: req.user.role,
      updatedParticipants: updatedMeeting.participants,
      updatedActiveParticipants: updatedMeeting.activeParticipants
    });

    res.json({
      status: 'success',
      message: 'Successfully left the meeting',
      data: { meeting: updatedMeeting }
    });
  } catch (error) {
    logger.error(`Leave meeting error: ${error.message}`);
    res.status(500).json({ message: 'Failed to leave meeting' });
  }
};

export const switchMode = async (req, res) => {
  try {
    const { meetingId, mode, participantId } = req.body;
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Only host can switch modes
    if (meeting.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Update meeting mode
    meeting.privateMode = {
      isActive: mode === 'private',
      participantId: mode === 'private' ? participantId : null,
    };
    await meeting.save();

    // Notify all participants about mode change
    const io = req.app.get('io');
    io.to(meetingId).emit('mode-changed', {
      isPrivate: mode === 'private',
      participantId: mode === 'private' ? participantId : null,
      hostId: req.user._id
    });

    res.json({
      status: 'success',
      data: { meeting }
    });
  } catch (error) {
    logger.error(`Switch mode error: ${error.message}`);
    res.status(500).json({ message: 'Failed to switch mode' });
  }
};

export const startPrivateConversation = async (req, res) => {
  try {
    const { meetingId } = req.body;
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Start recording for private conversation
    const recording = await Recording.create({
      meetingId,
      hostId: meeting.hostId,
      studentId: req.user._id,
      startTime: new Date(),
      isPrivateConversation: true,
      accessibleTo: [meeting.hostId, req.user._id]
    });

    meeting.activePrivateChat = {
      isActive: true,
      studentId: req.user._id,
      startTime: new Date()
    };
    await meeting.save();

    res.json({
      status: 'success',
      data: { 
        recordingId: recording._id 
      }
    });
  } catch (error) {
    logger.error(`Start private conversation error: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const endPrivateConversation = async (req, res) => {
  try {
    const { meetingId, recordingId } = req.body;
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Reset private mode
    meeting.privateMode = {
      isActive: false,
      participantId: null
    };
    await meeting.save();

    // Update recording
    const recording = await Recording.findById(recordingId);
    if (recording) {
      recording.endTime = new Date();
      recording.duration = (recording.endTime - recording.startTime) / 1000;
      await recording.save();
    }

    res.json({ message: 'Private conversation ended' });
  } catch (error) {
    logger.error(`End private conversation error: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getStudentRecordings = async (req, res) => {
  try {
    const recordings = await Recording.find({
      studentId: req.user._id,
      createdAt: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
    })
    .populate('meetingId', 'topic')
    .populate('hostId', 'name')
    .sort('-createdAt');

    res.json(recordings);
  } catch (error) {
    logger.error(`Get recordings error: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const endMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    // Find and validate meeting
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ 
        status: 'error',
        message: 'Meeting not found' 
      });
    }

    // Verify that requester is the host
    if (meeting.hostId.toString() !== userId.toString()) {
      return res.status(403).json({ 
        status: 'error',
        message: 'Only the host can end this meeting' 
      });
    }

    // Update meeting status
    meeting.status = 'ended';
    meeting.endTime = new Date();
    meeting.endReason = 'host_ended';
    meeting.activeParticipants = [];
    
    await meeting.save();

    // Notify all participants through Socket.IO
    const io = req.app.get('io');
    io.to(meetingId).emit('meeting-ended', {
      meetingId,
      reason: 'Host ended the meeting',
      endTime: meeting.endTime
    });

    // Disconnect all sockets in the meeting room
    const sockets = await io.in(meetingId).fetchSockets();
    sockets.forEach(socket => {
      socket.leave(meetingId);
    });

    logger.info(`Meeting ${meetingId} ended by host ${userId}`);

    res.json({
      status: 'success',
      data: {
        meeting,
        message: 'Meeting ended successfully'
      }
    });
  } catch (error) {
    logger.error(`End meeting error: ${error.message}`);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to end meeting',
      error: error.message 
    });
  }
};

export const getMeetingParticipants = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId)
      .populate('participants', 'name email')
      .select('participants');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Verify that requester is the host
    if (meeting.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json({
      status: 'success',
      data: { participants: meeting.participants }
    });
  } catch (error) {
    logger.error(`Get meeting participants error: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getStudentMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      participants: req.user._id,
      status: 'active'
    })
    .populate('hostId', 'username')
    .sort('-startTime');

    res.json({
      status: 'success',
      data: { meetings }
    });
  } catch (error) {
    logger.error(`Get student meetings error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get meetings' });
  }
};

export const activateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ 
        message: 'Meeting not found' 
      });
    }

    // Verify that requester is the host
    if (meeting.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        message: 'Only the host can activate this meeting' 
      });
    }

    if (meeting.status === 'active') {
      return res.status(400).json({ 
        message: 'Meeting is already active' 
      });
    }

    // Activate the meeting
    meeting.status = 'active';
    meeting.startTime = new Date();
    await meeting.save();

    // Schedule auto-end
    const io = req.app.get('io');
    await scheduleMeetingEnd(meetingId, io);

    // Notify participants
    io.to(meetingId).emit('meeting-activated', {
      meetingId,
      hostId: req.user._id
    });

    res.json({
      status: 'success',
      data: { 
        meeting,
        message: 'Meeting activated successfully'
      }
    });
  } catch (error) {
    logger.error(`Activate meeting error: ${error.message}`);
    res.status(500).json({ message: 'Failed to activate meeting' });
  }
};

export const startRecording = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId)
      .populate('hostId', 'username')
      .populate('participants', 'username');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Start recording logic here...
    const recording = await Recording.create({
      meetingId,
      hostId: req.user._id,
      startTime: new Date(),
      status: 'recording'
    });

    // Notify all participants that recording has started
    const io = req.app.get('io');
    io.to(meetingId).emit('recording-started', {
      recordingId: recording._id,
      startedBy: {
        id: req.user._id,
        username: req.user.username,
        role: req.user.role
      },
      startTime: recording.startTime
    });

    res.json({
      status: 'success',
      data: { recording }
    });
  } catch (error) {
    logger.error(`Start recording error: ${error.message}`);
    res.status(500).json({ message: 'Failed to start recording' });
  }
};

export const stopRecording = async (req, res) => {
  try {
    const { meetingId, recordingId } = req.params;
    
    const recording = await Recording.findById(recordingId);
    if (!recording) {
      return res.status(404).json({ message: 'Recording not found' });
    }

    recording.endTime = new Date();
    recording.status = 'completed';
    await recording.save();

    // Generate signed URL for the recording
    const signedUrl = await getSignedUrl(recording.fileUrl);

    // Notify all participants that recording has ended
    const io = req.app.get('io');
    io.to(meetingId).emit('recording-ended', {
      recordingId: recording._id,
      endedBy: {
        id: req.user._id,
        username: req.user.username,
        role: req.user.role
      },
      endTime: recording.endTime,
      duration: (recording.endTime - recording.startTime) / 1000, // duration in seconds
      isPrivate: recording.isPrivateConversation
    });

    res.json({
      status: 'success',
      data: { 
        recording,
        signedUrl
      }
    });
  } catch (error) {
    logger.error(`Stop recording error: ${error.message}`);
    res.status(500).json({ message: 'Failed to stop recording' });
  }
};

export const togglePrivateRecording = async (req, res) => {
  try {
    const { meetingId, studentId } = req.params;
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isStarting = !meeting.activePrivateChat?.isActive;

    if (isStarting) {
      // Start private recording
      meeting.activePrivateChat = {
        isActive: true,
        studentId,
        startTime: new Date()
      };

      // Notify participants about private recording
      const io = req.app.get('io');
      io.to(meetingId).emit('private-recording-started', {
        hostId: req.user._id,
        studentId,
        startTime: meeting.activePrivateChat.startTime
      });
    } else {
      // End private recording
      meeting.activePrivateChat = {
        isActive: false,
        studentId: null,
        startTime: null
      };

      // Notify participants about private recording end
      const io = req.app.get('io');
      io.to(meetingId).emit('private-recording-ended', {
        hostId: req.user._id,
        studentId,
        endTime: new Date()
      });
    }

    await meeting.save();

    res.json({
      status: 'success',
      data: { 
        meeting,
        isPrivateRecording: isStarting
      }
    });
  } catch (error) {
    logger.error(`Toggle private recording error: ${error.message}`);
    res.status(500).json({ message: 'Failed to toggle private recording' });
  }
};

export const getMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const meeting = await Meeting.findById(meetingId)
      .populate('hostId', 'username')
      .populate('participants', 'username role isActive')
      .populate('activeParticipants', 'username role isActive');

    if (!meeting) {
      return res.status(404).json({ 
        status: 'error',
        message: 'Meeting not found' 
      });
    }

    // Check if user has access to meeting
    const isHost = meeting.hostId._id.toString() === req.user._id.toString();
    const isParticipant = meeting.participants.some(
      p => p._id.toString() === req.user._id.toString()
    );

    if (!isHost && !isParticipant) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to access this meeting'
      });
    }

    // Add additional info for client
    const meetingData = {
      ...meeting.toObject(),
      isHost,
      canJoin: meeting.status === 'active' || (meeting.status === 'created' && isHost),
      userRole: isHost ? 'host' : 'student'
    };

    res.json({
      status: 'success',
      data: { meeting: meetingData }
    });

  } catch (error) {
    logger.error(`Get meeting error: ${error.message}`);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to get meeting details'
    });
  }
};

export const requestPrivateConversation = async (req, res) => {
  try {
    const { meetingId } = req.body;
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ 
        status: 'error',
        message: 'Meeting not found' 
      });
    }

    // Check if meeting is active
    if (meeting.status !== 'active') {
      return res.status(400).json({
        status: 'error',
        message: 'Meeting is not active'
      });
    }

    // Check if another private conversation is in progress
    if (meeting.privateMode.isActive) {
      return res.status(400).json({
        status: 'error',
        message: 'Another private conversation is in progress'
      });
    }

    // Notify host about private conversation request
    const io = req.app.get('io');
    io.to(meetingId).emit('private-conversation-requested', {
      studentId: req.user._id,
      studentName: req.user.username,
      timestamp: new Date()
    });

    logger.info(`Student ${req.user._id} requested private conversation in meeting ${meetingId}`);

    res.json({
      status: 'success',
      message: 'Private conversation request sent to host'
    });

  } catch (error) {
    logger.error(`Request private conversation error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to request private conversation'
    });
  }
}; 