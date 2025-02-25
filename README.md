# Audio Meeting Backend API

A real-time audio meeting platform with WebSocket support, private conversations, and recording capabilities.

## Core Features

### Real-time Audio Communication
- WebSocket-based audio streaming using Socket.IO
- WebRTC integration for peer-to-peer audio
- Audio quality optimization with noise suppression and echo cancellation
- Support for both broadcast and private conversations

### Meeting Management
- Host/Student role-based access control
- Meeting creation and participant management
- Private mode for one-on-one conversations
- Maximum 50 participants per meeting
- 5-hour meeting duration limit
- Daily meeting limits (25 meetings per host)

### Recording System
- Meeting recording support
- S3 storage integration
- 3-day retention policy
- Private conversation recordings
- Automatic cleanup of old recordings

### Automated Maintenance
- Meeting auto-termination after 5 hours
- Automatic cleanup of expired meetings
- Daily archival of ended meetings
- Recording retention management

## Technical Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **Real-time**: Socket.IO
- **Media**: WebRTC
- **Storage**: AWS S3
- **Authentication**: JWT
- **Logging**: Winston
- **Security**: Helmet, Rate Limiting, XSS Protection

## Prerequisites

- Node.js 16+
- MongoDB
- AWS Account with S3 access
- npm or yarn

## Environment Variables

Create a `.env` file:

NODE_ENV=development
PORT=5000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:5173
CLIENT_URL=http://192.168.1.74:5173
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=your_aws_region
AWS_S3_BUCKET=your_bucket_name


## Installation

1. Clone the repository
2. Install dependencies:

bash
npm install

3. Start the server:

npm start


## WebSocket Events

### Client to Server
- `join-meeting`: Join a meeting room
- `broadcast-audio`: Send audio to all participants
- `private-audio-stream`: Send private audio
- `audio-status`: Update audio status
- `pong`: Keepalive response

### Server to Client
- `connection-ack`: Connection confirmation
- `participant-joined`: New participant notification
- `participant-left`: Participant left notification
- `audio-broadcast`: Incoming audio stream
- `meeting-ended`: Meeting termination notice
- `mode-changed`: Meeting mode updates
- `recording-started`: Recording initiation
- `recording-ended`: Recording completion

## API Routes

### Authentication
- POST `/api/auth/login` - User login
- GET `/api/auth/profile` - Get user profile
- PUT `/api/auth/change-password` - Update password

### Host Routes
- POST `/api/host/students` - Create student
- GET `/api/host/students` - List students
- PUT `/api/host/students/:id` - Update student
- DELETE `/api/host/students/:id` - Delete student
- GET `/api/host/meetings` - Get host meetings

### Student Routes
- POST `/api/student/login` - Student login
- GET `/api/student/info` - Get student info
- GET `/api/student/meetings` - List meetings
- GET `/api/student/recordings` - Access recordings
- GET `/api/student/recordings/private` - Access private recordings

### Meeting Routes
- POST `/api/meetings/create` - Create meeting
- POST `/api/meetings/join` - Join meeting
- POST `/api/meetings/:meetingId/end` - End meeting
- POST `/api/meetings/switch-mode` - Toggle private mode
- GET `/api/meetings/participants/:meetingId` - List participants

## Security Features

- JWT Authentication
- WebSocket connection validation
- Rate limiting
- CORS protection
- Input sanitization
- MongoDB injection prevention
- XSS protection

## Automated Tasks

### Cron Jobs
- Meeting cleanup (every 5 minutes)
- Recording cleanup (3 days old at 2 AM)
- Meeting archival (daily at 1 AM)

### Auto-cleanup Conditions
- Meetings > 5 hours
- Recordings > 3 days old
- Ended meetings > 1 day old

## Error Handling

Comprehensive error handling for:
- Authentication failures
- WebSocket disconnections
- AWS S3 operations
- Database operations
- Audio streaming issues

## Health Monitoring

- GET `/socket-health` - WebSocket connection status
- Connection monitoring
- Error logging with Winston
- AWS service health checks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License

## Support

For issues and feature requests, please create an issue in the repository.