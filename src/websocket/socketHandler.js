import { logger } from '../utils/logger.js';
import Meeting from '../models/meetingModel.js';
import jwt from 'jsonwebtoken';

// Move connectedUsers to module scope so it persists
const connectedUsers = new Map();
const activePrivateConversations = new Map();

// Add these utility functions at the top
const convertAudioData = (audioData) => {
  try {
    // Ensure we're getting Float32Array
    const float32Data = new Float32Array(audioData);
    
    // Convert to 16-bit PCM with proper scaling
    const int16Data = new Int16Array(float32Data.length);
    for (let i = 0; i < float32Data.length; i++) {
      // Properly scale and clip the audio data
      const sample = Math.max(-1, Math.min(1, float32Data[i]));
      int16Data[i] = Math.round(sample * 32767);
    }
    
    return {
      audioData: int16Data.buffer,
      sampleRate: 48000,
      channels: 1,
      timestamp: Date.now(),
      byteLength: int16Data.buffer.byteLength,
      samplesCount: int16Data.length
    };
  } catch (error) {
    logger.error(`Audio conversion error: ${error.stack}`);
    throw new Error(`Audio conversion failed: ${error.message}`);
  }
};

const setupAudioPlayback = (audioData, sampleRate = 48000) => {
  try {
    // Create AudioContext if not exists
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: sampleRate
    });

    // Convert the received buffer to AudioBuffer
    const arrayBuffer = new Int16Array(audioData).buffer;
    const audioBuffer = audioContext.createBuffer(1, arrayBuffer.byteLength / 2, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Convert Int16 to Float32
    const int16Array = new Int16Array(arrayBuffer);
    for (let i = 0; i < int16Array.length; i++) {
      channelData[i] = int16Array[i] / 0x8000;
    }

    // Create and configure source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);

    return true;
  } catch (error) {
    logger.error(`Audio playback setup error: ${error.message}`);
    return false;
  }
};

export const setupWebSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.query.auth;
      if (!auth) {
        throw new Error('Authentication required');
      }

      const authData = JSON.parse(Buffer.from(auth, 'base64').toString());
      
      // Validate token
      const decoded = jwt.verify(authData.token, process.env.JWT_SECRET);
      if (!decoded) {
        throw new Error('Invalid token');
      }

      // Store user data
      const userData = {
        userId: authData.userId,
        meetingId: authData.meetingId,
        role: authData.role,
        username: authData.username,
        lastSeen: Date.now()
      };

      connectedUsers.set(socket.id, userData);
      socket.join(authData.meetingId);

      // Send immediate connection acknowledgment
      socket.emit('connection-ack', {
        status: 'connected',
        userId: userData.userId,
        meetingId: userData.meetingId
      });

      next();
    } catch (error) {
      logger.error(`Socket authentication error: ${error.message}`);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`New socket connection: ${socket.id}`);

    // Send immediate connection status
    socket.emit('connection-status', { 
      connected: true,
      socketId: socket.id 
    });

    // Handle join meeting
    socket.on('join-meeting', async ({ meetingId, userId }) => {
      try {
        const user = connectedUsers.get(socket.id);
        if (!user) {
          throw new Error('User not found');
        }

        await socket.join(meetingId);
        
        // Notify others in the meeting
        socket.to(meetingId).emit('participant-joined', {
          userId: user.userId,
          username: user.username,
          role: user.role
        });

        logger.info(`User ${userId} joined meeting ${meetingId}`);
      } catch (error) {
        logger.error(`Join meeting error: ${error.message}`);
        socket.emit('join-error', { message: error.message });
      }
    });

    // Enhanced connection monitoring
    const pingInterval = setInterval(() => {
      socket.emit('ping');
    }, 25000);

    socket.on('pong', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        user.lastSeen = Date.now();
      }
    });

    socket.on('disconnect', () => {
      clearInterval(pingInterval);
      const user = connectedUsers.get(socket.id);
      if (user) {
        socket.to(user.meetingId).emit('participant-left', {
          userId: user.userId
        });
        connectedUsers.delete(socket.id);
      }
      logger.info(`Socket disconnected: ${socket.id}`);
    });

    // Add error handling for connection
    socket.on('connect_error', (error) => {
      logger.error(`WebSocket connection error: ${error.message}`);
      socket.emit('connection-error', {
        message: 'Connection error, attempting to reconnect...'
      });
    });

    try {
      const { meetingId, userId, role } = socket.meetingData;
      
      // Store user info
      connectedUsers.set(socket.id, {
        userId,
        role,
        meetingId,
        joinedAt: Date.now(),
        lastPing: Date.now()
      });

      // Join meeting room
      socket.join(meetingId);

      // Notify others
      socket.to(meetingId).emit('user-joined', {
        userId,
        role,
        socketId: socket.id
      });

      // Send connection acknowledgment
      socket.emit('connection-ack', {
        status: 'connected',
        socketId: socket.id,
        meetingId,
        userId,
        role
      });

      logger.info(`User ${userId} (${role}) joined meeting ${meetingId}`);
    } catch (error) {
      logger.error(`Connection error: ${error.message}`);
      socket.emit('connection-error', { message: error.message });
    }

    // Handle broadcast audio with better error handling and audio streaming
    socket.on('broadcast-audio', async ({ audioStream, meetingId, userId }) => {
      try {
        const user = connectedUsers.get(socket.id);
        if (!user || user.role !== 'host') {
          logger.warn(`Unauthorized broadcast attempt from ${socket.id}`);
          return;
        }

        // Set up direct audio streaming
        socket.to(meetingId).emit('audio-stream-start', {
          userId: user.userId,
          role: 'host',
          sampleRate: 48000,
          channels: 1,
          timestamp: Date.now()
        });

        // Handle the direct audio stream
        socket.on('audio-stream-data', (stream) => {
          socket.to(meetingId).emit('audio-stream-data', {
            stream,
            userId: user.userId
          });
        });

        // Handle stream end
        socket.on('audio-stream-end', () => {
          socket.to(meetingId).emit('audio-stream-end', {
            userId: user.userId
          });
        });

      } catch (error) {
        logger.error(`Broadcast audio error: ${error.message}`);
        socket.emit('stream-error', { message: error.message });
      }
    });

    // Add audio reception acknowledgment
    socket.on('audio-received', ({ success, error }) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        if (!success) {
          logger.error(`Audio reception error from ${user.userId}: ${error}`);
        } else {
          logger.debug(`Audio received successfully by ${user.userId}`);
        }
      }
    });

    // Add ping handler
    socket.on('ping', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        user.lastPing = Date.now();
        socket.emit('pong');
      }
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      try {
        const user = connectedUsers.get(socket.id);
        if (user) {
          const { meetingId, userId, role } = user;

          // Update meeting in database
          const meeting = await Meeting.findById(meetingId);
          if (meeting) {
            // Remove from active participants
            meeting.activeParticipants = meeting.activeParticipants.filter(
              participantId => participantId.toString() !== userId
            );

            await meeting.save();

            // Get updated participant info
            const updatedMeeting = await Meeting.findById(meetingId)
              .populate('hostId', 'username _id')
              .populate('participants', 'username _id role isActive')
              .populate('activeParticipants', 'username _id role isActive');

            // Notify others
            socket.to(meetingId).emit('user-left', {
              userId,
              role,
              reason,
              meetingData: {
                participants: updatedMeeting.participants,
                activeParticipants: updatedMeeting.activeParticipants
              }
            });
          }

          connectedUsers.delete(socket.id);
          logger.info(`User ${userId} disconnected: ${reason}`);
        }
      } catch (error) {
        logger.error(`Disconnect error: ${error.message}`);
      }
    });

    const FIVE_MINUTES = 5 * 60 * 1000;

    socket.on('request-private-conversation', ({ meetingId, hostId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'student') {
        io.to(meetingId).emit('private-conversation-requested', {
          studentId: user.userId,
          hostId
        });
      }
    });

    socket.on('accept-private-conversation', ({ meetingId, studentId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'host') {
        activePrivateConversations.set(studentId, socket.id);
        io.to(meetingId).emit('private-conversation-started', {
          studentId,
          hostId: user.userId
        });
      }
    });

    // Handle private audio streaming
    socket.on('private-audio-stream', ({ audioStream, targetUserId }) => {
      try {
        const user = connectedUsers.get(socket.id);
        if (!user) {
          socket.emit('reconnect-required');
          return;
        }

        let targetSocket;
        if (user.role === 'host') {
          // Find target student's socket
          targetSocket = Array.from(connectedUsers.entries())
            .find(([_, u]) => u.userId === targetUserId && u.meetingId === user.meetingId);
        } else if (user.role === 'student') {
          // Find host's socket
          targetSocket = Array.from(connectedUsers.entries())
            .find(([_, u]) => u.role === 'host' && u.meetingId === user.meetingId);
        }

        if (targetSocket) {
          // Initialize direct stream
          io.to(targetSocket[0]).emit('private-stream-start', {
            userId: user.userId,
            role: user.role,
            sampleRate: 48000,
            channels: 1,
            isPrivate: true,
            timestamp: Date.now()
          });

          // Handle stream data
          socket.on('private-stream-data', (stream) => {
            io.to(targetSocket[0]).emit('private-stream-data', {
              stream,
              userId: user.userId,
              isPrivate: true
            });
          });

          // Handle stream end
          socket.on('private-stream-end', () => {
            io.to(targetSocket[0]).emit('private-stream-end', {
              userId: user.userId,
              isPrivate: true
            });
          });
        }
      } catch (error) {
        logger.error(`Private audio stream error: ${error.message}`);
        socket.emit('stream-error', { message: error.message });
      }
    });

    // Add audio control handlers
    socket.on('mute-participant', ({ meetingId, participantId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'host') {
        io.to(meetingId).emit('participant-muted', {
          participantId,
          mutedBy: user.userId
        });
      }
    });

    socket.on('unmute-participant', ({ meetingId, participantId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'host') {
        io.to(meetingId).emit('participant-unmuted', {
          participantId,
          unmutedBy: user.userId
        });
      }
    });

    // Add audio status tracking
    socket.on('audio-status-change', ({ meetingId, isActive }) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        user.isAudioActive = isActive;
        io.to(meetingId).emit('participant-audio-status', {
          userId: user.userId,
          role: user.role,
          isActive
        });
      }
    });

    socket.on('switch-mode', async ({ meetingId, mode, targetUserId }) => {
      if (mode === 'private') {
        io.to(meetingId).emit('private-mode-started', { hostId: socket.id, targetUserId });
      } else {
        io.to(meetingId).emit('broadcast-mode-resumed');
      }
    });

    socket.on('webrtc-signal', ({ targetId, signal, meetingId }) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        io.to(targetId).emit('webrtc-signal', {
          senderId: user.userId,
          signal,
          meetingId
        });
      }
    });

    // Handle private chat requests
    socket.on('request-private-chat', ({ meetingId, hostId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'student') {
        io.to(meetingId).emit('private-chat-requested', {
          studentId: user.userId,
          hostId
        });
      }
    });

    socket.on('accept-private-chat', ({ meetingId, studentId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'host') {
        activePrivateConversations.set(studentId, {
          hostSocketId: socket.id,
          meetingId
        });
        io.to(meetingId).emit('private-chat-started', {
          studentId,
          hostId: user.userId
        });
      }
    });

    socket.on('end-private-chat', ({ meetingId, studentId }) => {
      activePrivateConversations.delete(studentId);
      io.to(meetingId).emit('private-chat-ended', {
        studentId
      });
    });

    socket.on('recording-started', (data) => {
      const { meetingId } = data;
      socket.to(meetingId).emit('recording-started', data);
    });

    socket.on('recording-ended', (data) => {
      const { meetingId } = data;
      socket.to(meetingId).emit('recording-ended', data);
    });

    socket.on('private-recording-started', (data) => {
      const { meetingId } = data;
      socket.to(meetingId).emit('private-recording-started', data);
    });

    socket.on('private-recording-ended', (data) => {
      const { meetingId } = data;
      socket.to(meetingId).emit('private-recording-ended', data);
    });

    socket.on('leave-meeting', async ({ meetingId, userId, role }) => {
      try {
        // Remove from socket room
        socket.leave(meetingId);

        // Remove from connected users
        connectedUsers.delete(socket.id);

        // Update meeting in database
        const meeting = await Meeting.findById(meetingId);
        if (meeting) {
          // Remove from active participants
          meeting.activeParticipants = meeting.activeParticipants.filter(
            participantId => participantId.toString() !== userId
          );

          // If student, also remove from participants
          if (role === 'student') {
            meeting.participants = meeting.participants.filter(
              participantId => participantId.toString() !== userId
            );
          }

          await meeting.save();

          // Get updated participant info
          const updatedMeeting = await Meeting.findById(meetingId)
            .populate('hostId', 'username _id')
            .populate('participants', 'username _id role isActive')
            .populate('activeParticipants', 'username _id role isActive');

          // Notify others in the meeting with updated lists
          io.to(meetingId).emit('participant-left', {
            userId,
            role,
            timestamp: new Date(),
            meetingData: {
              participants: updatedMeeting.participants,
              activeParticipants: updatedMeeting.activeParticipants
            }
          });
        }
      } catch (error) {
        logger.error(`Error handling leave-meeting: ${error.message}`);
      }
    });

    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}: ${error.message}`);
      
      // Attempt to recover the connection
      socket.emit('reconnect-attempt');
      
      // Clean up if necessary
      const user = connectedUsers.get(socket.id);
      if (user) {
        socket.to(user.meetingId).emit('participant-disconnected', {
          userId: user.userId,
          temporary: true
        });
      }
    });

    socket.on('reconnect-success', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        socket.join(user.meetingId);
        socket.to(user.meetingId).emit('participant-reconnected', {
          userId: user.userId
        });
      }
    });

    // Add connection timeout handling
    socket.on('connect_timeout', () => {
      logger.error(`Connection timeout for ${socket.id}`);
    });

    // Add reconnection handler
    socket.on('reconnect', async ({ meetingId, userId, role }) => {
      try {
        // Re-store user info
        connectedUsers.set(socket.id, {
          userId,
          role,
          meetingId,
          joinedAt: Date.now()
        });

        await socket.join(meetingId);
        
        logger.info(`User ${userId} reconnected with socket ${socket.id}`);
        
        socket.emit('reconnected', {
          success: true,
          socketId: socket.id
        });
      } catch (error) {
        logger.error(`Reconnection error: ${error.message}`);
        socket.emit('reconnect-error', { message: error.message });
      }
    });

    // Add heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (connectedUsers.has(socket.id)) {
        socket.emit('ping');
      } else {
        clearInterval(heartbeat);
      }
    }, 25000);

    socket.on('pong', () => {
      // Update last seen timestamp
      const user = connectedUsers.get(socket.id);
      if (user) {
        user.lastSeen = Date.now();
      }
    });

    // Add this new event handler for audio status
    socket.on('audio-status', ({ meetingId, isActive }) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        io.to(meetingId).emit('participant-audio-status', {
          userId: user.userId,
          isActive
        });
      }
    });

    // Add private mode handlers
    socket.on('enable-private-mode', ({ meetingId, studentId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'host') {
        io.to(meetingId).emit('private-mode-enabled', {
          hostId: user.userId,
          studentId
        });
      }
    });

    socket.on('disable-private-mode', ({ meetingId }) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.role === 'host') {
        io.to(meetingId).emit('private-mode-disabled', {
          hostId: user.userId
        });
      }
    });

    // Add audio stream error handling
    socket.on('stream-error', ({ message }) => {
      logger.error(`Audio stream error: ${message}`);
      // Attempt to reinitialize audio stream
      socket.emit('reinitialize-audio');
    });

    // Add connection monitoring
    const monitorConnection = (socket) => {
      let lastPing = Date.now();
      
      const pingInterval = setInterval(() => {
        if (Date.now() - lastPing > 10000) { // 10 seconds
          logger.warn(`Connection possibly stale for socket ${socket.id}`);
          socket.emit('check-connection');
        }
      }, 5000);

      socket.on('pong', () => {
        lastPing = Date.now();
      });

      socket.on('disconnect', () => {
        clearInterval(pingInterval);
      });
    };

    monitorConnection(socket);

    socket.on('audio-stream', ({ audioData }) => {
      try {
        const user = connectedUsers.get(socket.id);
        if (!user) {
          socket.emit('reconnect-required');
          return;
        }

        if (user.role === 'host') {
          // Convert and broadcast audio data to all participants
          const processedAudio = convertAudioData(new Float32Array(audioData));
          socket.to(user.meetingId).emit('audio-broadcast', {
            audioData: processedAudio,
            userId: user.userId,
            role: 'host',
            timestamp: Date.now(),
            sampleRate: 48000,
            channels: 1
          });
        }
      } catch (error) {
        logger.error(`Audio stream error: ${error.message}`);
        socket.emit('stream-error', { message: error.message });
      }
    });
  });

  // Add periodic cleanup of stale connections
  setInterval(() => {
    const now = Date.now();
    for (const [socketId, user] of connectedUsers.entries()) {
      if (now - user.lastPing > 30000) { // 30 seconds
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
        connectedUsers.delete(socketId);
        logger.info(`Removed stale connection: ${socketId}`);
      }
    }
  }, 10000);
}; 