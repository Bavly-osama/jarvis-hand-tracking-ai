import { AICommandValidator } from '../../ai/AICommandValidator';
import { AIIntentResponse } from '../../ai/AIIntentSchema';

describe('AICommandValidator', () => {
  it('allows valid commands in MAIN_CAROUSEL', () => {
    const response: AIIntentResponse = {
      intent: 'NEXT_CARD',
      confidence: 0.9,
      reason: 'User swiped right',
      source: 'gemini',
    };

    const validated = AICommandValidator.validate('MAIN_CAROUSEL', undefined, response);
    expect(validated.intent).toBe('NEXT_CARD');
    expect(validated.confidence).toBe(0.9);
  });

  it('rejects illegal commands like GAME_SHOOT in MAIN_CAROUSEL', () => {
    const response: AIIntentResponse = {
      intent: 'GAME_SHOOT',
      confidence: 0.95,
      reason: 'Pinch motion',
      source: 'gemini',
    };

    const validated = AICommandValidator.validate('MAIN_CAROUSEL', undefined, response);
    expect(validated.intent).toBe('NONE');
    expect(validated.confidence).toBe(0);
    expect(validated.source).toBe('validator');
  });

  it('allows GAME_SHOOT when activeModule is GAME', () => {
    const response: AIIntentResponse = {
      intent: 'GAME_SHOOT',
      confidence: 0.92,
      reason: 'Fired at target',
      source: 'gemini',
    };

    const validated = AICommandValidator.validate('EXPERIENCE_ACTIVE', 'GAME', response);
    expect(validated.intent).toBe('GAME_SHOOT');
  });

  it('allows ROTATE_LEFT when activeModule is EARTH', () => {
    const response: AIIntentResponse = {
      intent: 'ROTATE_LEFT',
      confidence: 0.88,
      reason: 'Rotated Earth globe',
      source: 'gemini',
    };

    const validated = AICommandValidator.validate('EXPERIENCE_ACTIVE', 'EARTH', response);
    expect(validated.intent).toBe('ROTATE_LEFT');
  });
});
