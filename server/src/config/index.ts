import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  port: number;
  corsOrigin: string[];
  geminiApiKey: string;
  geminiModel: string;
  rateLimitMax: number;
  sessionTTL: number;
  logLevel: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3001', 10),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  sessionTTL: parseInt(process.env.SESSION_TTL || '3600', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
};
