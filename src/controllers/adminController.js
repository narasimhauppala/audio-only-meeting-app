import User from '../models/userModel.js';
import { logger } from '../utils/logger.js';

// Host Management
export const createHost = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Username already exists'
      });
    }
    
    const host = await User.create({
      username,
      password,
      role: 'host',
      createdBy: req.user._id
    });

    res.status(201).json({
      status: 'success',
      data: {
        host: {
          id: host._id,
          username: host.username
        }
      }
    });
  } catch (error) {
    logger.error(`Create host error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const getAllHosts = async (req, res) => {
  try {
    const hosts = await User.find({ role: 'host' })
      .select('username isActive createdAt')
      .sort('-createdAt');

    res.json({
      status: 'success',
      data: { hosts }
    });
  } catch (error) {
    logger.error(`Get hosts error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const updateHost = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, isActive, password } = req.body;

    // Check if new username already exists
    if (username) {
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: id } 
      });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Username already exists'
        });
      }
    }

    // Create update object with only provided fields
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password && password.length >= 6) updateData.password = password;

    const host = await User.findOneAndUpdate(
      { _id: id, role: 'host' },
      updateData,
      { new: true }
    ).select('username isActive');

    if (!host) {
      return res.status(404).json({
        status: 'error',
        message: 'Host not found'
      });
    }

    res.json({
      status: 'success',
      data: { host }
    });
  } catch (error) {
    logger.error(`Update host error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const deleteHost = async (req, res) => {
  try {
    const { id } = req.params;
    const host = await User.findOneAndDelete({ _id: id, role: 'host' });

    if (!host) {
      return res.status(404).json({
        status: 'error',
        message: 'Host not found'
      });
    }

    res.json({
      status: 'success',
      message: 'Host deleted successfully'
    });
  } catch (error) {
    logger.error(`Delete host error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const getHostStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      { $match: { role: 'host' } },
      {
        $group: {
          _id: null,
          totalHosts: { $sum: 1 },
          activeHosts: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      status: 'success',
      data: { stats: stats[0] || {} }
    });
  } catch (error) {
    logger.error(`Get host stats error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// Student Management
export const createStudent = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Username already exists'
      });
    }
    
    const student = await User.create({
      username,
      password,
      role: 'student',
      createdBy: req.user._id
    });

    res.status(201).json({
      status: 'success',
      data: {
        student: {
          id: student._id,
          username: student.username
        }
      }
    });
  } catch (error) {
    logger.error(`Create student error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, isActive } = req.body;

    // Check if new username already exists
    if (username) {
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: id } 
      });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Username already exists'
        });
      }
    }

    const student = await User.findOneAndUpdate(
      { _id: id, role: 'student' },
      { username, isActive },
      { new: true }
    ).select('-password');

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    res.json({
      status: 'success',
      data: { student }
    });
  } catch (error) {
    logger.error(`Update student error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await User.findOneAndDelete({ _id: id, role: 'student' });

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    res.json({
      status: 'success',
      message: 'Student deleted successfully'
    });
  } catch (error) {
    logger.error(`Delete student error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('username isActive createdAt')
      .sort('-createdAt');

    res.json({
      status: 'success',
      data: { students }
    });
  } catch (error) {
    logger.error(`Get students error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// Admin Management
export const createAdmin = async (req, res) => {
  try {
    if (!req.user.hasPermission('create_admin')) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to create admin users'
      });
    }

    const { username, password, permissions } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Username already exists'
      });
    }
    
    const admin = await User.create({
      username,
      password,
      role: 'admin',
      createdBy: req.user._id,
      permissions: permissions || ['create_host', 'create_student']
    });

    res.status(201).json({
      status: 'success',
      data: {
        admin: {
          id: admin._id,
          username: admin.username,
          permissions: admin.permissions
        }
      }
    });
  } catch (error) {
    logger.error(`Create admin error: ${error.message}`);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, permissions } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    user.role = role;
    if (permissions) {
      user.permissions = permissions;
    }
    
    await user.save();

    res.json({
      status: 'success',
      data: {
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
          permissions: user.permissions
        }
      }
    });
  } catch (error) {
    logger.error(`Update user role error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('username role isActive createdAt')
      .sort('-createdAt');

    res.json({
      status: 'success',
      data: { users }
    });
  } catch (error) {
    logger.error(`Get users error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
}; 