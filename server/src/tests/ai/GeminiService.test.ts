import { GeminiService } from '../../ai/GeminiService';
import { AIIntentRequest } from '../../ai/AIIntentSchema';
import { aiIntentCache } from '../../ai/AIIntentCache';

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(() => {
    service = new GeminiService();
  });

  it('reports availability status based on GEMINI_API_KEY', () => {
    expect(typeof service.isAvailable()).toBe('boolean');
  });

  it('performs healthCheck without throwing', async () => {
    const health = await service.healthCheck();
    expect(health).toHaveProperty('ok');
    expect(health).toHaveProperty('model');
    expect(health).toHaveProperty('latencyMs');
  });

  it('returns structured fallback on empty or unconfigured client', async () => {
    const request: AIIntentRequest = {
      sessionId: 'test-sess',
      requestId: 'req-1',
      stateVersion: 1,
      uiState: 'MAIN_CAROUSEL',
      hand: 'RIGHT',
      trackingConfidence: 0.9,
      gesture: {
        candidate: 'UNKNOWN',
        confidence: 0.6,
        velocity: { x: 0.2, y: 0, z: 0 },
        duration: 150,
      },
      recentGestures: [],
      timestamp: Date.now(),
    };

    const result = await service.inferGestureIntent(request);
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('enforces deduplication via AIIntentCache', () => {
    aiIntentCache.setCache('test-key', {
      intent: 'ROTATE_RIGHT',
      confidence: 0.88,
      reason: 'Cached test',
      source: 'cache',
    }, 1000);

    const cached = aiIntentCache.getCached('test-key');
    expect(cached).not.toBeNull();
    expect(cached?.intent).toBe('ROTATE_RIGHT');
    expect(cached?.cached).toBe(true);
  });
});
