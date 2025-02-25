import express from 'express';
import { protect, isAdmin } from '../middleware/authMiddleware.js';
import {
  createHost,
  updateHost,
  deleteHost,
  getAllHosts,
  getHostStats,
  createStudent,
  updateStudent,
  deleteStudent,
  getAllStudents,
  createAdmin,
  updateUserRole,
  getAllUsers
} from '../controllers/adminController.js';
import { validate, userValidation } from '../middleware/validationMiddleware.js';

const router = express.Router();

// All routes require admin authentication
router.use(protect, isAdmin);

// Host management
router.route('/hosts')
  .get(getAllHosts)
  .post(validate(userValidation), createHost);

router.route('/hosts/:id')
  .put(updateHost)
  .delete(deleteHost);

// Student management
router.route('/students')
  .get(getAllStudents)
  .post(createStudent);

router.route('/students/:id')
  .put(updateStudent)
  .delete(deleteStudent);

// User management routes
router.post('/admins', createAdmin);
router.put('/users/:userId/role', updateUserRole);
router.get('/users', getAllUsers);

// Statistics
router.get('/stats/hosts', getHostStats);

export default router; 