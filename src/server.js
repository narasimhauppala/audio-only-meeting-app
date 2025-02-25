import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import { errorHandler, handleAwsError } from './middleware/errorMiddleware.js';
import { limiter, authLimiter, securityHeaders } from './middleware/securityMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import recordingRoutes from './routes/recordingRoutes.js';
import signalRoutes from './routes/signalRoutes.js';
import { setupWebSocket } from './websocket/socketHandler.js';
import adminRoutes from './routes/adminRoutes.js';
import hostRoutes from './routes/hostRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import { initAdmin } from './config/initAdmin.js';
import { initCleanupCron } from './utils/cronService.js';
import { initIO } from './utils/io.js';
import { verifyCredentials as verifyAwsCredentials, testS3Connection } from './utils/awsService.js';
import { corsPreflightMiddleware, allowedOrigins } from './middleware/corsMiddleware.js';
import { logger } from './utils/logger.js';
import Meeting from './models/meetingModel.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const wsServer = createServer();
const WS_PORT = process.env.WS_PORT || 5001;

const io = new Server(wsServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  },
  path: '/ws',
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

app.options('*', cors(corsPreflightMiddleware));

httpServer.on('error', (error) => {
  logger.error(`HTTP Server error: ${error.message}`);
});

wsServer.on('error', (error) => {
  logger.error(`WebSocket Server error: ${error.message}`);
});

io.engine.on('connection_error', (error) => {
  logger.error(`Socket.IO connection error: ${error.message}`);
});

io.engine.on('connection', (socket) => {
  logger.info(`New transport connection: ${socket.id}`);
});

initIO(io);
app.set('io', io);

app.use(securityHeaders);
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/host', hostRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/signal', signalRoutes);

setupWebSocket(io);
initCleanupCron(io);

app.use(handleAwsError);
app.use(errorHandler);

app.get('/debug/connections', (req, res) => {
  const connections = Array.from(connectedUsers.entries()).map(([socketId, user]) => ({
    socketId,
    userId: user.userId,
    role: user.role,
    meetingId: user.meetingId,
    lastPing: user.lastPing
  }));
  res.json({ activeConnections: connections, totalConnections: connections.length });
});

app.get('/debug/meetings/:meetingId', async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.meetingId).populate('hostId', 'username').populate('participants', 'username');
    const sockets = await io.in(req.params.meetingId).fetchSockets();
    res.json({ meeting, connectedSockets: sockets.length, socketIds: sockets.map(s => s.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const startServer = async () => {
  try {
    await testS3Connection();
    logger.info('S3 connection verified successfully');
    await connectDB();
    await initAdmin();
    await verifyAwsCredentials();

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`HTTP Server running on port ${PORT}`);
      logger.info(`Server accessible at http://192.168.1.74:${PORT}`);
    });

    wsServer.listen(WS_PORT, '0.0.0.0', () => {
      logger.info(`WebSocket Server running on port ${WS_PORT}`);
      logger.info(`WebSocket Server accessible at ws://192.168.1.74:${WS_PORT}/ws`);
    });
  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
};

startServer();

export default { httpServer, wsServer };