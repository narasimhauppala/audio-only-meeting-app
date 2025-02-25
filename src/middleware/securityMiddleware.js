import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import cors from 'cors';
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
  max: 500, // Increased from 200 to 500
  message: 'Too many login attempts, please try again after an hour'
});

// CORS Middleware Setup
export const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // ✅ Allow cookies/auth headers
  methods: "GET, POST, PUT, DELETE, OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
};

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
        "https://audio-only-meeting-app.onrender.com",
        "wss://audio-only-meeting-app.onrender.com"  // ✅ Secure WebSocket connection
      ],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
    },
  },
  dnsPrefetchControl: false,
  frameguard: { action: "SAMEORIGIN" },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }, // Enable strict HTTPS
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
});

export const configureSecurityMiddleware = (app) => {
  // Apply Helmet Security Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  // Enable CORS
  app.use(cors(corsOptions));

  // Handle Preflight Requests
  app.options("*", cors(corsOptions));

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
