import cron from 'node-cron';
import Recording from '../models/recordingModel.js';
import { deleteRecording } from './awsService.js';
import { logger } from './logger.js';
import Meeting from '../models/meetingModel.js';

const MAX_MEETING_DURATION = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
const RECORDING_RETENTION_DAYS = 3; // Keep recordings for 3 days

// Function to clean up old recordings
const cleanupOldRecordings = async () => {
  try {
    const threeDaysAgo = new Date(Date.now() - (RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000));
    
    const oldRecordings = await Recording.find({
      createdAt: { $lt: threeDaysAgo }
    });

    for (const recording of oldRecordings) {
      try {
        // Delete from S3
        await deleteRecording(recording.key);
        
        // Delete from database
        await Recording.findByIdAndDelete(recording._id);
        
        logger.info(`Deleted old recording: ${recording._id}`);
      } catch (error) {
        logger.error(`Failed to delete recording ${recording._id}: ${error.message}`);
        continue;
      }
    }

    if (oldRecordings.length > 0) {
      logger.info(`Cleaned up ${oldRecordings.length} old recordings`);
    }
  } catch (error) {
    logger.error(`Recording cleanup error: ${error.message}`);
  }
};

// Function to clean up expired meetings
const cleanupExpiredMeetings = async (io) => {
  try {
    const now = new Date();
    
    // Find meetings that have exceeded max duration or are stale
    const expiredMeetings = await Meeting.find({
      status: 'active',
      $or: [
        // Meetings that have exceeded max duration
        {
          startTime: { 
            $lt: new Date(now - MAX_MEETING_DURATION) 
          }
        },
        // Meetings that are active but created more than 5 hours ago
        {
          createdAt: { 
            $lt: new Date(now - MAX_MEETING_DURATION),
            $exists: true 
          }
        }
      ]
    });

    for (const meeting of expiredMeetings) {
      try {
        // Update meeting status
        meeting.status = 'ended';
        meeting.endTime = now;
        meeting.endReason = 'duration_exceeded';
        meeting.activeParticipants = [];
        await meeting.save();

        // Notify all participants
        io.to(meeting._id.toString()).emit('meeting-ended', {
          meetingId: meeting._id,
          reason: 'Maximum duration exceeded',
          endTime: meeting.endTime
        });

        // Disconnect all sockets in the meeting room
        const sockets = await io.in(meeting._id.toString()).fetchSockets();
        sockets.forEach(socket => {
          socket.leave(meeting._id.toString());
        });

        logger.info(`Auto-ended expired meeting ${meeting._id}`);
      } catch (error) {
        logger.error(`Failed to cleanup meeting ${meeting._id}: ${error.message}`);
        continue; // Continue with next meeting even if one fails
      }
    }

    if (expiredMeetings.length > 0) {
      logger.info(`Cleaned up ${expiredMeetings.length} expired meetings`);
    }
  } catch (error) {
    logger.error(`Error cleaning up expired meetings: ${error.message}`);
  }
};

// Run every day at midnight
export const initCleanupCron = (io) => {
  // Run meeting cleanup every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await cleanupExpiredMeetings(io);
  });

  // Run recording cleanup every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    await cleanupOldRecordings();
  });

  // Run meeting archival every day at 1 AM
  cron.schedule('0 1 * * *', async () => {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const endedMeetings = await Meeting.find({
        status: 'ended',
        endTime: { $lt: oneDayAgo }
      });

      for (const meeting of endedMeetings) {
        meeting.status = 'archived';
        await meeting.save();
      }

      logger.info(`Archived ${endedMeetings.length} ended meetings`);
    } catch (error) {
      logger.error(`Meeting cleanup error: ${error.message}`);
    }
  });

  logger.info('All cleanup cron jobs initialized');
}; 