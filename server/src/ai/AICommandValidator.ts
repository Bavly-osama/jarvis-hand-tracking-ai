import { AllowedIntent, AIIntentResponse } from './AIIntentSchema';
import { logger } from '../utils/logger';

const VALID_COMMANDS_BY_STATE: Record<string, Set<AllowedIntent>> = {
  MAIN_CAROUSEL: new Set<AllowedIntent>([
    'NONE',
    'NEXT_CARD',
    'PREVIOUS_CARD',
    'SELECT',
    'OPEN',
    'CONFIRM',
    'CANCEL',
    'ROTATE_LEFT',
    'ROTATE_RIGHT',
    'ZOOM_IN',
    'ZOOM_OUT',
    'OPEN_ANALYTICS',
    'OPEN_EARTH',
    'OPEN_GAME',
    'OPEN_AI',
    'OPEN_FILES',
    'OPEN_SECURITY',
    'OPEN_NAVIGATION',
    'OPEN_ENERGY',
  ]),
  GAME: new Set<AllowedIntent>([
    'NONE',
    'GAME_SHOOT',
    'GAME_MOVE',
    'GAME_PAUSE',
    'SELECT',
    'BACK',
    'CLOSE',
    'CANCEL',
    'CONFIRM',
  ]),
  EARTH: new Set<AllowedIntent>([
    'NONE',
    'ROTATE_LEFT',
    'ROTATE_RIGHT',
    'ROTATE_UP',
    'ROTATE_DOWN',
    'ZOOM_IN',
    'ZOOM_OUT',
    'SELECT',
    'BACK',
    'CLOSE',
    'CANCEL',
    'CONFIRM',
  ]),
  ANALYTICS: new Set<AllowedIntent>([
    'NONE',
    'NEXT_CARD',
    'PREVIOUS_CARD',
    'SELECT',
    'BACK',
    'CLOSE',
    'CANCEL',
    'CONFIRM',
  ]),
  FILES: new Set<AllowedIntent>([
    'NONE',
    'NEXT_CARD',
    'PREVIOUS_CARD',
    'SELECT',
    'OPEN',
    'BACK',
    'CLOSE',
    'CANCEL',
    'CONFIRM',
    'MOVE_UP',
    'MOVE_DOWN',
  ]),
  SECURITY: new Set<AllowedIntent>([
    'NONE',
    'SELECT',
    'ROTATE_LEFT',
    'ROTATE_RIGHT',
    'BACK',
    'CLOSE',
    'CANCEL',
  ]),
  ENERGY: new Set<AllowedIntent>([
    'NONE',
    'NEXT_CARD',
    'PREVIOUS_CARD',
    'SELECT',
    'BACK',
    'CLOSE',
    'CANCEL',
  ]),
  NETWORK: new Set<AllowedIntent>([
    'NONE',
    'NEXT_CARD',
    'PREVIOUS_CARD',
    'SELECT',
    'BACK',
    'CLOSE',
    'CANCEL',
  ]),
  NAVIGATION: new Set<AllowedIntent>([
    'NONE',
    'NEXT_CARD',
    'PREVIOUS_CARD',
    'SELECT',
    'BACK',
    'CLOSE',
    'CANCEL',
  ]),
  AI: new Set<AllowedIntent>([
    'NONE',
    'SELECT',
    'BACK',
    'CLOSE',
    'CANCEL',
    'CONFIRM',
  ]),
};

export class AICommandValidator {
  /**
   * Validates whether an AI intent is permissible in the given UI state.
   * If valid, returns original intent response.
   * If invalid, sanitizes response to 'NONE' with explanatory reason.
   */
  public static validate(
    uiState: string,
    activeModule: string | undefined,
    response: AIIntentResponse
  ): AIIntentResponse {
    const effectiveState = (activeModule || uiState || 'MAIN_CAROUSEL').toUpperCase();
    const allowed = VALID_COMMANDS_BY_STATE[effectiveState] || VALID_COMMANDS_BY_STATE['MAIN_CAROUSEL'];

    if (allowed.has(response.intent)) {
      return response;
    }

    logger.warn(
      { intent: response.intent, uiState: effectiveState },
      'AI intent rejected by state validator (hallucination or illegal transition)'
    );

    return {
      ...response,
      intent: 'NONE',
      confidence: 0,
      reason: `Intent ${response.intent} is not allowed in state ${effectiveState}`,
      source: 'validator',
    };
  }
}
