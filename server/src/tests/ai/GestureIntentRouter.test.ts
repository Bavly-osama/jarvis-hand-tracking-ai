import { GestureIntentRouter } from '../../gestures/GestureIntentRouter';
import { AIIntentRequest } from '../../ai/AIIntentSchema';

describe('GestureIntentRouter', () => {
  it('routes high confidence (>= 0.85) to LOCAL immediately', async () => {
    const decision = GestureIntentRouter.evaluateRoute(0.88);
    expect(decision).toBe('LOCAL');

    const request: AIIntentRequest = {
      sessionId: 'sess-1',
      uiState: 'MAIN_CAROUSEL',
      hand: 'RIGHT',
      trackingConfidence: 0.95,
      gesture: {
        candidate: 'SWIPE_RIGHT',
        confidence: 0.90,
        velocity: { x: 0.45, y: 0, z: 0 },
        duration: 200,
      },
      recentGestures: [],
      timestamp: Date.now(),
    };

    const routed = await GestureIntentRouter.routeAndResolve(request);
    expect(routed.decision).toBe('LOCAL');
    expect(routed.response.intent).toBe('NEXT_CARD');
  });

  it('routes ambiguous confidence (0.55 <= c < 0.85) to GEMINI', () => {
    const decision = GestureIntentRouter.evaluateRoute(0.65);
    expect(decision).toBe('GEMINI');
  });

  it('ignores sub-threshold confidence (< 0.55) without history', async () => {
    const decision = GestureIntentRouter.evaluateRoute(0.35, false);
    expect(decision).toBe('IGNORE');

    const request: AIIntentRequest = {
      sessionId: 'sess-1',
      uiState: 'MAIN_CAROUSEL',
      hand: 'RIGHT',
      trackingConfidence: 0.70,
      gesture: {
        candidate: 'UNKNOWN',
        confidence: 0.35,
        velocity: { x: 0.05, y: 0.02, z: 0 },
        duration: 80,
      },
      recentGestures: [],
      timestamp: Date.now(),
    };

    const routed = await GestureIntentRouter.routeAndResolve(request);
    expect(routed.decision).toBe('IGNORE');
    expect(routed.response.intent).toBe('NONE');
  });

  it('calculates smart confidence using weighted formula', () => {
    // local * 0.45 + gemini * 0.35 + context * 0.20
    // 0.60 * 0.45 + 0.90 * 0.35 + 0.85 * 0.20 = 0.27 + 0.315 + 0.17 = 0.755
    const score = GestureIntentRouter.calculateSmartConfidence(0.60, 0.90, 0.85);
    expect(score).toBeCloseTo(0.755, 2);
  });
});
