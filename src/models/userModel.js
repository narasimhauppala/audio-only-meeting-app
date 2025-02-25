import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'host', 'student'],
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.role === 'student'; // Only required if the user is a student
    }
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.role === 'student'; // Only required if the user is a student
    },
    validate: {
      validator: function(v) {
        if (this.role === 'student') {
          return v != null; // Must have a hostId if role is student
        }
        return true; // No validation needed for other roles
      },
      message: 'Student accounts must be associated with a host'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Update the password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update the password matching method
userSchema.methods.matchPassword = async function(enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Add a pre-save middleware to validate hostId for students
userSchema.pre('save', async function(next) {
  if (this.role === 'student' && !this.hostId) {
    throw new Error('Students must have a host assigned');
  }
  next();
});

const User = mongoose.model('User', userSchema);
export default User; 