import { logger } from './logger.js';

export class WebRTCService {
  constructor(socket, meetingId, userId, role) {
    this.socket = socket;
    this.meetingId = meetingId;
    this.userId = userId;
    this.role = role;
    this.mediaStream = null;
    this.audioContext = null;
    this.isStreaming = false;
    this.isPrivateMode = false;
    this.privateParticipantId = null;
  }

  setPrivateMode(isPrivate, participantId = null) {
    this.isPrivateMode = isPrivate;
    this.privateParticipantId = participantId;
    logger.info(`Private mode ${isPrivate ? 'enabled' : 'disabled'} with participant: ${participantId}`);
  }

  async initializeAudio() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      });

      this.audioContext = new AudioContext({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });

      return true;
    } catch (error) {
      logger.error(`Audio initialization error: ${error.message}`);
      throw error;
    }
  }

  startDirectStream(isPrivate = false, targetUserId = null) {
    if (!this.mediaStream || !this.audioContext) {
      throw new Error('Audio not initialized');
    }

    this.isStreaming = true;
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    const destination = this.audioContext.createMediaStreamDestination();
    source.connect(destination);

    if (isPrivate) {
      this.socket.emit('private-audio-stream', {
        audioStream: destination.stream,
        targetUserId
      });
    } else {
      this.socket.emit('broadcast-audio', {
        audioStream: destination.stream,
        meetingId: this.meetingId,
        userId: this.userId
      });
    }
  }

  stopDirectStream(isPrivate = false) {
    this.isStreaming = false;
    if (isPrivate) {
      this.socket.emit('private-stream-end');
    } else {
      this.socket.emit('audio-stream-end');
    }
  }

  cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isStreaming = false;
  }
}

export const createWebRTCService = (socket, meetingId, userId, role) => {
  return new WebRTCService(socket, meetingId, userId, role);
};

export const createPeerConnection = async (configuration) => {
  try {
    const peerConnection = new RTCPeerConnection(configuration);
    
    // Add default handlers
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        logger.info('New ICE candidate');
      }
    };

    peerConnection.onconnectionstatechange = () => {
      logger.info(`Connection state: ${peerConnection.connectionState}`);
    };

    peerConnection.oniceconnectionstatechange = () => {
      logger.info(`ICE connection state: ${peerConnection.iceConnectionState}`);
    };

    return peerConnection;
  } catch (error) {
    logger.error(`WebRTC Peer Connection error: ${error.message}`);
    throw error;
  }
};

export const addAudioTrack = async (peerConnection, stream) => {
  try {
    stream.getAudioTracks().forEach(track => {
      peerConnection.addTrack(track, stream);
    });
  } catch (error) {
    logger.error(`Add Audio Track error: ${error.message}`);
    throw error;
  }
};

export const createOffer = async (peerConnection) => {
  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });
    await peerConnection.setLocalDescription(offer);
    return offer;
  } catch (error) {
    logger.error(`Create Offer error: ${error.message}`);
    throw error;
  }
};

export const handleAnswer = async (peerConnection, answer) => {
  try {
    if (!peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  } catch (error) {
    logger.error(`Handle Answer error: ${error.message}`);
    throw error;
  }
};

export const handleIceCandidate = async (peerConnection, candidate) => {
  try {
    if (candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    logger.error(`Handle ICE Candidate error: ${error.message}`);
    throw error;
  }
}; 