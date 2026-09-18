import { z } from 'zod';

export const GestureEventSchema = z.object({
  type: z.string(),
  gesture: z.string(),
  confidence: z.number().min(0).max(1),
  velocity: z.number(),
  hand: z.enum(['LEFT', 'RIGHT', 'UNKNOWN']),
  duration: z.number().nonnegative(),
  timestamp: z.number().positive(),
});

export const AIRequestSchema = z.object({
  recentGestures: z.array(z.string()),
  activeObject: z.string().nullable(),
  uiState: z.string(),
  gestureConfidence: z.number().min(0).max(1),
  hand: z.string(),
});

export const UserPreferencesSchema = z.object({
  gestureSensitivity: z.number().min(0).max(1),
  dominantHand: z.enum(['LEFT', 'RIGHT']),
  animationSpeed: z.number().min(0),
  soundEnabled: z.boolean(),
  aiEnabled: z.boolean(),
  trackingSensitivity: z.number().min(0).max(1),
});

export const GestureConfigSchema = z.object({
  swipe: z.object({ minVelocity: z.number(), confidence: z.number().min(0).max(1) }),
  pinch: z.object({ threshold: z.number() }),
  zoom: z.object({ minDelta: z.number() }),
  rotate: z.object({ minVelocity: z.number() }),
  deadZone: z.number(),
});
