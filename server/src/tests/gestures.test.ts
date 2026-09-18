import { gestureEventService } from '../services/GestureEventService';
import { sessionService } from '../services/SessionService';
import { telemetryService } from '../services/TelemetryService';

describe('GestureEventService', () => {
  beforeEach(() => {
    telemetryService.clearLogs();
  });

  it('validates schema and processes valid event', () => {
    const session = sessionService.createSession('test-device');
    gestureEventService.processGestureEvent(session.id, {
      type: 'swipe',
      gesture: 'swipe_left',
      confidence: 0.9,
      velocity: 1.2,
      hand: 'RIGHT',
      duration: 100,
      timestamp: Date.now()
    });

    const updated = sessionService.getSession(session.id);
    expect(updated?.gestureCount).toBe(1);
    expect(updated?.recognizedGestures).toBe(1);
  });

  it('logs low confidence events', () => {
    const session = sessionService.createSession('test-device');
    gestureEventService.processGestureEvent(session.id, {
      type: 'swipe',
      gesture: 'swipe_left',
      confidence: 0.2,
      velocity: 1.2,
      hand: 'RIGHT',
      duration: 100,
      timestamp: Date.now()
    });

    const updated = sessionService.getSession(session.id);
    expect(updated?.failedGestures).toBe(1);
    
    const logs = telemetryService.getRecentLogs();
    expect(logs.find(l => l.type === 'low_confidence')).toBeDefined();
  });

  it('rate limiting triggers at 100+/sec', () => {
    const session = sessionService.createSession('test-device');
    for (let i = 0; i < 150; i++) {
      gestureEventService.processGestureEvent(session.id, {
        type: 'swipe',
        gesture: 'swipe_left',
        confidence: 0.9,
        velocity: 1.2,
        hand: 'RIGHT',
        duration: 100,
        timestamp: Date.now()
      });
    }

    const updated = sessionService.getSession(session.id);
    expect(updated?.gestureCount).toBeLessThanOrEqual(100);
  });
});
