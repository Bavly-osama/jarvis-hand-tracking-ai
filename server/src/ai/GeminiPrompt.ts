import { ALLOWED_INTENTS, AIIntentRequest } from './AIIntentSchema';

export const GEMINI_SYSTEM_INSTRUCTION = `You are the gesture intent classification engine for a futuristic spatial interface.
You receive preprocessed hand-motion features, recent gesture history, current UI state, and current interaction target.
Determine the most likely user intention.
Do not invent functionality.
Only select an intent from the supplied allowed-intent list.
If evidence is insufficient, return NONE.
Favor NONE over low-confidence guesses.
Do not perform actions yourself.
Return only the required structured JSON response matching the schema.

ALLOWED INTENTS:
${ALLOWED_INTENTS.join(', ')}

CONTEXTUAL REASONING RULES:
1. uiState = 'MAIN_CAROUSEL':
   - Horizontal hand motion (RIGHT) -> NEXT_CARD
   - Horizontal hand motion (LEFT) -> PREVIOUS_CARD
   - Pinch or point dwell -> SELECT or OPEN
   - Fist grab and move -> ROTATE_LEFT / ROTATE_RIGHT
   - Two hands expanding/contracting -> ZOOM_IN / ZOOM_OUT

2. uiState = 'EARTH' or activeModule = 'EARTH':
   - Horizontal motion -> ROTATE_LEFT or ROTATE_RIGHT
   - Vertical motion -> ROTATE_UP or ROTATE_DOWN
   - Two hands delta -> ZOOM_IN or ZOOM_OUT
   - Pointing node & pinch -> SELECT
   - Open palm down or back flick -> BACK or CLOSE

3. uiState = 'GAME' or activeModule = 'GAME':
   - Pointing target + pinch -> GAME_SHOOT
   - Fist or palm drag -> GAME_MOVE
   - Palm hold / pause gesture -> GAME_PAUSE
   - Back flick -> BACK

4. uiState = 'ANALYTICS':
   - Horizontal motion -> NEXT_CARD or PREVIOUS_CARD (changes dataset)
   - Pinch -> SELECT
   - Back flick -> BACK

5. IRREGULAR / CASUAL MOVEMENT:
   - If user adjusts hair, scratches face, moves casually without directed intent -> return NONE with high confidence.
   - Ambiguous erratic movement -> return NONE.`;

export function buildIntentUserPrompt(request: AIIntentRequest): string {
  const motion = request.semanticFeatures?.motion;
  const fingers = request.semanticFeatures?.fingers;
  const pinch = request.semanticFeatures?.pinch;

  return JSON.stringify({
    uiState: request.uiState,
    activeModule: request.activeModule || request.activeCard || 'NONE',
    activeCard: request.activeCard,
    hand: request.hand,
    trackingConfidence: request.trackingConfidence,
    localCandidate: request.gesture?.candidate || 'UNKNOWN',
    localConfidence: request.gesture?.confidence || 0.5,
    localVelocity: request.gesture?.velocity || { x: 0, y: 0 },
    semanticMotion: motion ? {
      direction: motion.direction,
      speed: motion.speed,
      distance: motion.distance,
      acceleration: motion.acceleration
    } : undefined,
    fingers: fingers ? {
      indexExtended: fingers.indexExtended,
      thumbExtended: fingers.thumbExtended,
      handOpen: fingers.handOpen,
      isFist: fingers.isFist
    } : undefined,
    pinch: pinch ? {
      distance: pinch.distance,
      isPinching: pinch.isPinching
    } : undefined,
    recentGestures: request.recentGestures.slice(-5),
    target: request.target,
    durationMs: request.gesture?.duration || request.semanticFeatures?.timing?.duration || 0
  });
}
