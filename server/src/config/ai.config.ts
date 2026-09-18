import dotenv from 'dotenv';
dotenv.config();

export interface AIConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiTimeoutMs: number;
  aiGestureMinConfidence: number;
  localGestureConfidence: number;
  maxAiRequestsPerMinute: number;
}

export const aiConfig: AIConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  geminiTimeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || '1200', 10),
  aiGestureMinConfidence: parseFloat(process.env.AI_GESTURE_MIN_CONFIDENCE || '0.55'),
  localGestureConfidence: parseFloat(process.env.LOCAL_GESTURE_CONFIDENCE || '0.85'),
  maxAiRequestsPerMinute: parseInt(process.env.MAX_AI_REQUESTS_PER_MINUTE || '30', 10),
};
