export const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://192.168.1.74:5173',
  'http://192.168.1.74:5174',
  'http://192.168.1.80:5173',
  'https://audio-only-meeting-app-admin-frontend.vercel.app',
  'https://audio-only-meeting-app-admin-frontend.onrender.com',
  'https://audio-only-meeting-app.onrender.com'
];

export const corsPreflightMiddleware = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    return res.status(200).send();
  }
  next();
}; 