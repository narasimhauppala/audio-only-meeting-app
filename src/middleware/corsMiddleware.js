export const allowedOrigins = [
  'http://localhost:5173',
  'http://192.168.1.80:5173',
  'http://localhost:3000',
  'http://192.168.1.80:3000',
  'http://192.168.1.74:5173',
  'http://192.168.1.74:3000',
  "https://audio-only-meeting-app-admin-frontend.vercel.app",
  "https://audio-only-meeting-app.onrender.com"
];

export const corsPreflightMiddleware = (req, res, next) => {
  try {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
    
    res.header('Access-Control-Allow-Origin', allowedOrigins.join(','));
    res.header('Access-Control-Allow-Methods', allowedMethods.join(','));
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204); // Correctly respond to preflight request
    }
    
    next();
  } catch (error) {
    console.error('CORS Middleware Error:', error);
    return res.status(500).json({ error: 'Internal Server Error in CORS Middleware' });
  }
};
