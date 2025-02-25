import { logger } from './logger.js';
import Meeting from '../models/meetingModel.js';

const MAX_MEETING_DURATION = 5 * 60 * 60 * 1000; // 5 hours in milliseconds

export const scheduleMeetingEnd = async (meetingId, io) => {
  try {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      logger.error(`Meeting not found for scheduling: ${meetingId}`);
      return;
    }

    const timeUntilEnd = MAX_MEETING_DURATION - (Date.now() - meeting.startTime);
    
    if (timeUntilEnd <= 0) {
      await endMeetingAutomatically(meetingId, io);
      return;
    }

    setTimeout(async () => {
      await endMeetingAutomatically(meetingId, io);
    }, timeUntilEnd);

    logger.info(`Scheduled meeting ${meetingId} to end in ${timeUntilEnd}ms`);
  } catch (error) {
    logger.error(`Error scheduling meeting end: ${error.message}`);
  }
};

const endMeetingAutomatically = async (meetingId, io) => {
  try {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting || meeting.status !== 'active') return;

    // Update meeting status
    meeting.status = 'ended';
    meeting.endTime = new Date();
    meeting.endReason = 'duration_exceeded';
    meeting.activeParticipants = [];
    await meeting.save();

    // Notify all participants
    io.to(meetingId).emit('meeting-ended', {
      meetingId,
      reason: 'Maximum duration exceeded',
      endTime: meeting.endTime
    });

    logger.info(`Auto-ended meeting ${meetingId} due to duration limit`);
  } catch (error) {
    logger.error(`Error auto-ending meeting: ${error.message}`);
  }
}; 