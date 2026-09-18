import { GestureEvent } from '../models/types';
import { GestureEventSchema } from '../validation/schemas';
import { sessionService } from './SessionService';
import { telemetryService } from './TelemetryService';

class GestureEventService {
  private rateLimitMap = new Map<string, { count: number, resetTime: number }>();

  processGestureEvent(sessionId: string, event: GestureEvent): void {
    // Rate limit: max 100 events/sec per session
    const now = Date.now();
    let rl = this.rateLimitMap.get(sessionId);
    if (!rl || now > rl.resetTime) {
      rl = { count: 0, resetTime: now + 1000 };
      this.rateLimitMap.set(sessionId, rl);
    }
    rl.count++;
    
    if (rl.count > 100) {
      return; // Drop if rate limit exceeded
    }

    try {
      GestureEventSchema.parse(event);
    } catch (err) {
      telemetryService.logGestureFailure(sessionId, event.gesture, 'Schema validation failed');
      return;
    }

    const session = sessionService.getSession(sessionId);
    if (!session) return;

    const newCount = session.gestureCount + 1;
    let newAvg = session.avgConfidence;
    
    if (event.confidence < 0.3) {
      telemetryService.logLowConfidence(sessionId, event);
      sessionService.updateSession(sessionId, {
        gestureCount: newCount,
        failedGestures: session.failedGestures + 1,
        avgConfidence: (newAvg * session.gestureCount + event.confidence) / newCount
      });
    } else {
      sessionService.updateSession(sessionId, {
        gestureCount: newCount,
        recognizedGestures: session.recognizedGestures + 1,
        avgConfidence: (newAvg * session.gestureCount + event.confidence) / newCount
      });
    }
  }
}

export const gestureEventService = new GestureEventService();
