import mongoose from 'mongoose';

const recordingSchema = new mongoose.Schema({
  meetingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting',
    required: true
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.isPrivateConversation === true;
    }
  },
  streamKey: {  // Add this for real-time streaming
    type: String,
    required: true,
    unique: true
  },
  fileUrl: {
    type: String,
    default: ''  // Will be populated when stream ends
  },
  status: {
    type: String,
    enum: ['recording', 'completed', 'failed'],
    default: 'recording'
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number,
    default: 0
  },
  error: {
    type: String,
    required: false
  },
  metadata: {
    size: Number,
    format: String,
    duration: Number,
    contentType: String
  },
  isPrivateConversation: {
    type: Boolean,
    default: false
  },
  accessibleTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }]
}, {
  timestamps: true
});

// Auto-delete recordings older than 3 days
recordingSchema.index({ createdAt: 1 }, { 
  expireAfterSeconds: 3 * 24 * 60 * 60 
});

// Add indexes for common queries
recordingSchema.index({ hostId: 1, createdAt: -1 });
recordingSchema.index({ meetingId: 1 });
recordingSchema.index({ accessibleTo: 1 });

// Add middleware to ensure proper access control
recordingSchema.pre('save', function(next) {
  // Ensure host always has access
  if (!this.accessibleTo.includes(this.hostId)) {
    this.accessibleTo.push(this.hostId);
  }
  
  if (this.isPrivateConversation && this.studentId) {
    // For private conversations, only host and student should have access
    this.accessibleTo = [this.hostId, this.studentId];
  }
  
  // Ensure fileUrl starts with recordings/ if it exists
  if (this.fileUrl && !this.fileUrl.startsWith('recordings/')) {
    this.fileUrl = `recordings/${this.fileUrl}`;
  }

  next();
});

const Recording = mongoose.model('Recording', recordingSchema);
export default Recording; 