import { z } from 'zod';

export const ALLOWED_INTENTS = [
  'NONE',
  'NEXT_CARD',
  'PREVIOUS_CARD',
  'SELECT',
  'OPEN',
  'CLOSE',
  'BACK',
  'CONFIRM',
  'CANCEL',
  'ROTATE_LEFT',
  'ROTATE_RIGHT',
  'ROTATE_UP',
  'ROTATE_DOWN',
  'ZOOM_IN',
  'ZOOM_OUT',
  'GRAB',
  'RELEASE',
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'MOVE_UP',
  'MOVE_DOWN',
  'GAME_SHOOT',
  'GAME_MOVE',
  'GAME_PAUSE',
  'OPEN_ANALYTICS',
  'OPEN_EARTH',
  'OPEN_GAME',
  'OPEN_AI',
  'OPEN_FILES',
  'OPEN_SECURITY',
  'OPEN_NAVIGATION',
  'OPEN_ENERGY',
] as const;

export type AllowedIntent = (typeof ALLOWED_INTENTS)[number];

export const IntentEnumSchema = z.enum(ALLOWED_INTENTS);

export const MotionFeaturesSchema = z.object({
  direction: z.enum(['LEFT', 'RIGHT', 'UP', 'DOWN', 'FORWARD', 'BACKWARD', 'NONE']).default('NONE'),
  speed: z.number().default(0),
  acceleration: z.number().default(0),
  distance: z.number().default(0),
});

export const FingerFeaturesSchema = z.object({
  indexExtended: z.boolean().default(false),
  thumbExtended: z.boolean().default(false),
  handOpen: z.boolean().default(false),
  isFist: z.boolean().default(false),
});

export const PinchFeaturesSchema = z.object({
  distance: z.number().default(1),
  isPinching: z.boolean().default(false),
});

export const GestureTimingSchema = z.object({
  duration: z.number().default(0),
});

export const SemanticFeaturesSchema = z.object({
  hand: z.enum(['LEFT', 'RIGHT']).default('RIGHT'),
  motion: MotionFeaturesSchema.optional(),
  fingers: FingerFeaturesSchema.optional(),
  pinch: PinchFeaturesSchema.optional(),
  timing: GestureTimingSchema.optional(),
});

export const AIIntentRequestSchema = z.object({
  sessionId: z.string().min(1).default('anonymous'),
  requestId: z.string().optional(),
  gestureId: z.string().optional(),
  stateVersion: z.number().int().nonnegative().optional(),
  uiState: z.string().default('MAIN_CAROUSEL'),
  activeModule: z.string().optional(),
  activeCard: z.string().optional(),
  hand: z.enum(['LEFT', 'RIGHT']).default('RIGHT'),
  trackingConfidence: z.number().min(0).max(1).default(0.8),
  gesture: z.object({
    candidate: z.string().default('UNKNOWN'),
    confidence: z.number().min(0).max(1).default(0.5),
    velocity: z.object({
      x: z.number().default(0),
      y: z.number().default(0),
      z: z.number().optional().default(0),
    }).default({ x: 0, y: 0, z: 0 }),
    duration: z.number().default(0),
  }).optional(),
  semanticFeatures: SemanticFeaturesSchema.optional(),
  recentGestures: z.array(
    z.union([
      z.string(),
      z.object({
        gesture: z.string(),
        time: z.number().optional(),
      })
    ])
  ).default([]),
  target: z.object({
    type: z.string().default('CARD'),
    id: z.string().default('unknown'),
  }).optional(),
  timestamp: z.number().default(() => Date.now()),
});

export type AIIntentRequest = z.infer<typeof AIIntentRequestSchema>;

export const AIIntentResponseSchema = z.object({
  requestId: z.string().optional(),
  stateVersion: z.number().int().optional(),
  intent: IntentEnumSchema,
  confidence: z.number().min(0).max(1),
  target: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  reason: z.string().default(''),
  latencyMs: z.number().optional(),
  cached: z.boolean().optional(),
  source: z.enum(['gemini', 'fallback', 'cache', 'validator']).default('gemini'),
});

export type AIIntentResponse = z.infer<typeof AIIntentResponseSchema>;
