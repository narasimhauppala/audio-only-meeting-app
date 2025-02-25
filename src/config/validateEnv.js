import { cleanEnv, str, port, url } from 'envalid';

export const validateEnv = () => {
  const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'MONGODB_URI',
    'JWT_SECRET',
    'FRONTEND_URL',
    'CLIENT_URL'
  ];

  const missingEnvVars = requiredEnvVars.filter(
    envVar => !process.env[envVar]
  );

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}`
    );
  }

  // Validate URLs and add proper error handling
  try {
    new URL(process.env.FRONTEND_URL);
    new URL(process.env.CLIENT_URL);
  } catch (error) {
    throw new Error(`Invalid URL in environment variables: ${error.message}`);
  }
};

export default validateEnv;