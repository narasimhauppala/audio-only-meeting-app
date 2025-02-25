export const allowedOrigins = [
  'http://localhost:5173',
  'http://192.168.1.80:5173',
  'http://localhost:3000',
  'http://192.168.1.80:3000',
  'http://192.168.1.74:5173',
  'http://192.168.1.74:3000',
  "https://audio-only-meeting-app-admin-frontend.onrender.com",
  "https://audio-only-meeting-app-admin-frontend.vercel.app"
];

export const corsPreflightMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Content-Length, X-Requested-With, Accept'
    );
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}; 