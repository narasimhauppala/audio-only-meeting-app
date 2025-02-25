import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import { allowedOrigins } from './corsMiddleware.js';

// Rate limiting
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Increase limit for development
  message: 'Too many requests from this IP, please try again later'
});

// API specific limiter (for auth routes)
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 200, // start blocking after 5 requests
  message: 'Too many login attempts, please try again after an hour'
});

// Security headers
export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'", 
        "http://localhost:5173",
        "http://192.168.1.74:5174",
        "http://192.168.1.80:5173",
        "ws://localhost:5000",
        "ws://192.168.1.74:5002",
        "ws://192.168.1.80:5000",
        "http://localhost:5174",
        "https://audio-only-meeting-app-admin-frontend.vercel.app",
        "https://audio-only-meeting-app.onrender.com"
      ],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  dnsPrefetchControl: false,
  frameguard: false,
  hidePoweredBy: true,
  hsts: false,
  ieNoOpen: true,
  noSniff: false,
  referrerPolicy: false,
  xssFilter: true
});

export const configureSecurityMiddleware = (app) => {
  // Basic security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  // Rate limiting
  app.use('/api/', limiter);

  // Trust proxy if behind a proxy
  app.set('trust proxy', 1);

  // Security headers
  app.use((req, res, next) => {
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('X-Frame-Options', 'SAMEORIGIN');
    res.header('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Data sanitization against NoSQL query injection
  app.use(mongoSanitize());

  // Data sanitization against XSS
  app.use(xss());

  // Prevent parameter pollution
  app.use(hpp());
}; 