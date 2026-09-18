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
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  sessionTTL: parseInt(process.env.SESSION_TTL || '3600', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
};
