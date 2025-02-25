import { createAudioStream, generateSignedUrl as getSignedUrl } from '../utils/awsService.js';
import Recording from '../models/recordingModel.js';
import Meeting from '../models/meetingModel.js';
import { logger } from '../utils/logger.js';

const activeStreams = new Map();

export const startRecording = async (req, res) => {
  try {
    const { meetingId } = req.body;
    const meeting = await Meeting.findById(meetingId)
      .populate('participants', '_id');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Verify host is making the request
    if (meeting.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can start recording' });
    }

    // Create S3 stream
    const streamData = await createAudioStream(meetingId, req.user._id);

    // Create recording document
    const recording = await Recording.create({
      meetingId,
      hostId: req.user._id,
      streamKey: streamData.streamKey,
      startTime: new Date(),
      status: 'recording',
      accessibleTo: [meeting.hostId, ...meeting.participants.map(p => p._id)]
    });

    // Notify participants
    const io = req.app.get('io');
    io.to(meetingId).emit('recording-started', {
      recordingId: recording._id,
      startedBy: req.user._id
    });

    res.status(201).json({
      status: 'success',
      data: { recordingId: recording._id }
    });
  } catch (error) {
    logger.error(`Start recording error: ${error.message}`);
    res.status(500).json({ message: 'Failed to start recording' });
  }
};

// Handle incoming audio chunks
export const streamAudio = async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    const streamData = activeStreams.get(recordingId);
    if (!streamData) {
      return res.status(404).json({ message: 'Recording stream not found' });
    }

    // Get the audio data from the request
    let audioData;
    if (req.headers['content-type'].includes('multipart/form-data')) {
      // Handle multipart form data
      if (!req.file || !req.file.buffer) {
        throw new Error('No audio data received in form data');
      }
      audioData = req.file.buffer;
    } else {
      // Handle raw audio data
      audioData = req.body;
    }

    // Validate audio data
    if (!audioData || !Buffer.isBuffer(audioData)) {
      logger.error('Invalid audio data received:', {
        type: typeof audioData,
        isBuffer: Buffer.isBuffer(audioData),
        contentType: req.headers['content-type']
      });
      throw new Error('Invalid audio data format');
    }

    if (audioData.length === 0) {
      throw new Error('Empty audio chunk received');
    }

    // Write chunk to stream
    try {
      const writeResult = streamData.stream.write(audioData);
      
      if (!writeResult) {
        logger.debug(`Backpressure detected for recording ${recordingId}, waiting for drain`);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            streamData.stream.removeListener('drain', onDrain);
            reject(new Error('Write timeout'));
          }, 5000);

          const onDrain = () => {
            clearTimeout(timeout);
            resolve();
          };

          streamData.stream.once('drain', onDrain);
        });
      }

      const written = streamData.getBytesWritten();
      logger.debug(`Successfully wrote chunk of ${audioData.length} bytes to recording ${recordingId}, total: ${written}`);

      res.status(200).json({ 
        status: 'success',
        bytesWritten: audioData.length,
        totalWritten: written
      });
    } catch (error) {
      logger.error(`Stream write error for recording ${recordingId}:`, error);
      throw error;
    }
  } catch (error) {
    logger.error('Stream audio error:', error);
    res.status(400).json({ 
      message: 'Failed to process audio chunk',
      error: error.message 
    });
  }
};

export const endRecording = async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    const streamData = activeStreams.get(recordingId);
    if (!streamData) {
      return res.status(404).json({ message: 'Recording stream not found' });
    }

    logger.info(`Ending recording ${recordingId} with ${streamData.getBytesWritten()} bytes written`);

    try {
      // End the stream
      streamData.stream.end();

      // Wait for upload to complete
      const result = await streamData.promise;
      
      if (!result || !result.key) {
        throw new Error('Upload failed - no result returned');
      }

      logger.info(`Recording ${recordingId} upload completed. Written: ${result.bytesWritten}, Uploaded: ${result.size}`);

      const recording = await Recording.findById(recordingId);
      if (!recording) {
        throw new Error('Recording not found after stream end');
      }

      recording.status = 'completed';
      recording.endTime = new Date();
      recording.duration = (recording.endTime - recording.startTime) / 1000;
      recording.fileUrl = result.key;
      recording.metadata = {
        size: result.size || 0,
        format: 'webm',
        duration: recording.duration,
        contentType: 'audio/webm'
      };

      await recording.save();

      // Cleanup
      activeStreams.delete(recordingId);

      // Get a signed URL for immediate playback
      const signedUrl = await getSignedUrl(result.key, false);

      res.json({
        status: 'success',
        data: { 
          recording,
          signedUrl,
          bytesWritten: result.bytesWritten || 0,
          bytesUploaded: result.size || 0
        }
      });
    } catch (error) {
      logger.error(`Upload completion error for recording ${recordingId}: ${error.message}`);
      
      try {
        // Update recording status to failed
        const recording = await Recording.findById(recordingId);
        if (recording) {
          recording.status = 'failed';
          recording.error = error.message || 'Unknown error during upload';
          await recording.save();
        }
      } catch (saveError) {
        logger.error(`Failed to save recording error state: ${saveError.message}`);
      }

      // Cleanup even on error
      activeStreams.delete(recordingId);

      res.status(500).json({ 
        message: 'Failed to end recording',
        error: error.message
      });
    }
  } catch (error) {
    logger.error(`End recording error: ${error.message}`);
    res.status(500).json({ 
      message: 'Failed to end recording',
      error: error.message 
    });
  }
};

export const getRecordingUrl = async (req, res) => {
  try {
    const { recordingId } = req.params;
    const recording = await Recording.findById(recordingId)
      .populate('meetingId', 'topic')
      .populate('hostId', 'username');

    if (!recording) {
      return res.status(404).json({ message: 'Recording not found' });
    }

    // Check if user has access
    if (!recording.accessibleTo.includes(req.user._id)) {
      return res.status(403).json({ message: 'Access denied to this recording' });
    }

    // Get signed URL based on recording status
    const url = await getSignedUrl(
      recording.status === 'completed' ? recording.fileUrl : recording.streamKey,
      recording.status === 'streaming'
    );

    if (!url) {
      logger.error(`Failed to generate signed URL for recording ${recordingId}`);
      return res.status(500).json({ 
        message: 'Failed to generate playback URL' 
      });
    }

    res.json({
      status: 'success',
      data: { 
        recording: {
          ...recording.toJSON(),
          signedUrl: url,
          playback: {
            url: url,
            type: 'audio/webm',
            title: `${recording.meetingId?.topic || 'Recording'} - ${new Date(recording.startTime).toLocaleString()}`,
            duration: recording.metadata?.duration || 0
          }
        }
      }
    });
  } catch (error) {
    logger.error(`Get recording URL error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get recording URL' });
  }
};

export const getMeetingRecordings = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // First verify if user is part of the meeting
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isParticipant = meeting.participants.includes(req.user._id);
    const isHost = meeting.hostId.toString() === req.user._id.toString();

    if (!isParticipant && !isHost) {
      return res.status(403).json({ 
        message: 'You do not have access to this meeting\'s recordings' 
      });
    }

    // Get all non-private recordings for this meeting
    const recordings = await Recording.find({
      meetingId,
      createdAt: { $gte: threeDaysAgo },
      isPrivateConversation: false
    })
    .populate('hostId', 'name')
    .sort('-createdAt');

    // Generate signed URLs for each recording
    const recordingsWithUrls = await Promise.all(
      recordings.map(async (recording) => {
        const url = await getSignedUrl(
          recording.status === 'streaming' ? recording.streamKey : recording.fileUrl,
          recording.status === 'streaming'
        );
        return {
          ...recording.toJSON(),
          signedUrl: url,
          isHost: isHost,
          canDownload: true
        };
      })
    );

    res.json({
      status: 'success',
      data: { 
        recordings: recordingsWithUrls,
        isHost,
        meetingTopic: meeting.topic
      }
    });
  } catch (error) {
    logger.error(`Get meeting recordings error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get recordings' });
  }
};

export const getStudentRecordings = async (req, res) => {
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
        const url = await getSignedUrl(
          recording.status === 'streaming' ? recording.streamKey : recording.fileUrl,
          recording.status === 'streaming'
        );
        return {
          ...recording.toJSON(),
          signedUrl: url,
          isPrivate: recording.isPrivateConversation
        };
      })
    );

    res.json({
      status: 'success',
      data: { recordings: recordingsWithUrls }
    });
  } catch (error) {
    logger.error(`Get student recordings error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get recordings' });
  }
};

export const getHostRecordings = async (req, res) => {
  try {
    const recordings = await Recording.find({ hostId: req.user._id })
      .populate('meetingId', 'topic startTime endTime')
      .sort('-createdAt');

    // Generate signed URLs for each recording
    const recordingsWithUrls = await Promise.all(
      recordings.map(async (recording) => {
        const signedUrl = await getSignedUrl(recording.streamKey);
        return {
          ...recording.toObject(),
          signedUrl,
          duration: recording.endTime 
            ? (recording.endTime - recording.startTime) / 1000 
            : null
        };
      })
    );

    res.json({
      status: 'success',
      data: { recordings: recordingsWithUrls }
    });
  } catch (error) {
    logger.error(`Get host recordings error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get recordings' });
  }
};

export const getAllAccessibleRecordings = async (req, res) => {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const recordings = await Recording.find({
      accessibleTo: req.user._id,
      createdAt: { $gte: threeDaysAgo }
    })
    .populate('meetingId', 'topic')
    .populate('hostId', 'name')
    .sort('-createdAt');

    const recordingsWithUrls = await Promise.all(
      recordings.map(async (recording) => {
        let url = null;
        if (recording.status === 'completed' && recording.fileUrl) {
          url = await getSignedUrl(recording.fileUrl, false);
        }

        return {
          ...recording.toJSON(),
          signedUrl: url,
          playback: {
            url: url,
            type: 'audio/webm',
            title: `${recording.meetingId?.topic || 'Recording'} - ${new Date(recording.startTime).toLocaleString()}`,
            duration: recording.metadata?.duration || 0
          }
        };
      })
    );

    res.json({
      status: 'success',
      data: { 
        recordings: recordingsWithUrls
      }
    });
  } catch (error) {
    logger.error(`Get accessible recordings error: ${error.message}`);
    res.status(500).json({ message: 'Failed to get recordings' });
  }
};

export const stopRecording = async (req, res) => {
  try {
    const { recordingId } = req.body;
    const recording = await Recording.findById(recordingId);

    if (!recording) {
      return res.status(404).json({ message: 'Recording not found' });
    }

    // Verify host is making the request
    if (recording.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can stop recording' });
    }

    // Update recording status
    recording.status = 'completed';
    recording.endTime = new Date();
    await recording.save();

    // Close the stream in AWS S3
    const streamData = activeStreams.get(recordingId);
    if (streamData) {
      await streamData.stream.end();
      activeStreams.delete(recordingId);
    }

    // Notify participants
    const io = req.app.get('io');
    io.to(recording.meetingId.toString()).emit('recording-ended', {
      recordingId: recording._id,
      stoppedBy: req.user._id
    });

    res.json({
      status: 'success',
      data: { recordingId: recording._id }
    });
  } catch (error) {
    logger.error(`Stop recording error: ${error.message}`);
    res.status(500).json({ message: 'Failed to stop recording' });
  }
}; 