import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  topic: {
    type: String,
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  status: {
    type: String,
    enum: ['created', 'active', 'paused', 'ended', 'cancelled'],
    default: 'created',
    index: true
  },
  currentSpeaker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  activePrivateChat: {
    isActive: Boolean,
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startTime: Date
  },
  privateMode: {
    isActive: {
      type: Boolean,
      default: false
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  maxDuration: {
    type: Number,
    default: 5 * 60 * 60, // 5 hours in seconds
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  maxParticipants: {
    type: Number,
    default: 50
  },
  isActive: {
    type: Boolean,
    default: true
  },
  activeParticipants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  endReason: {
    type: String
  }
}, {
  timestamps: true
});

// Add compound indexes for common queries
meetingSchema.index({ hostId: 1, status: 1 });
meetingSchema.index({ participants: 1 });

// Add these indexes
meetingSchema.index({ status: 1, startTime: 1 });
meetingSchema.index({ status: 1, createdAt: 1 });

meetingSchema.pre('save', async function(next) {
  // Check participant limit
  if (this.participants.length > this.maxParticipants) {
    throw new Error('Maximum participants limit reached');
  }

  // Skip duration check if meeting is being ended by system
  if (this.startTime && this.endTime && this.endReason !== 'duration_exceeded') {
    const duration = (this.endTime - this.startTime) / 1000; // in seconds
    if (duration > this.maxDuration) {
      throw new Error('Maximum meeting duration (5 hours) exceeded');
    }
  }

  // Set startTime if activating meeting
  if (this.isModified('status') && this.status === 'active' && !this.startTime) {
    this.startTime = new Date();
  }

  next();
});

const Meeting = mongoose.model('Meeting', meetingSchema);
export default Meeting; 