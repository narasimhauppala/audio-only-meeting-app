import express from 'express';
const router = express.Router();

router.get('/socket-health', (req, res) => {
  res.json({ 
    status: 'healthy',
    connections: connectedUsers.size,
    timestamp: new Date()
  });
});

export default router; 