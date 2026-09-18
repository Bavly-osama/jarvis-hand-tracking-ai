import { logger } from '../utils/logger';
import { GestureEvent } from '../models/types';

interface LogEntry {
  type: string;
  sessionId: string;
  timestamp: number;
  data: any;
}

class TelemetryService {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;

  private pushLog(entry: LogEntry) {
    if (this.logs.length >= this.MAX_LOGS) {
      this.logs.shift();
    }
    this.logs.push(entry);
  }

  logGestureFailure(sessionId: string, gesture: string, reason: string) {
    logger.warn({ sessionId, gesture, reason }, 'Gesture failure');
    this.pushLog({ type: 'gesture_failure', sessionId, timestamp: Date.now(), data: { gesture, reason } });
  }

  logLowConfidence(sessionId: string, event: GestureEvent) {
    logger.warn({ sessionId, event }, 'Low confidence gesture');
    this.pushLog({ type: 'low_confidence', sessionId, timestamp: Date.now(), data: event });
  }

  logWebSocketReconnect(sessionId: string) {
    logger.info({ sessionId }, 'WebSocket reconnected');
    this.pushLog({ type: 'ws_reconnect', sessionId, timestamp: Date.now(), data: null });
  }

  logAILatency(sessionId: string, ms: number) {
    logger.debug({ sessionId, latency: ms }, 'AI latency');
    this.pushLog({ type: 'ai_latency', sessionId, timestamp: Date.now(), data: { latency: ms } });
  }

  logAIError(sessionId: string, error: any) {
    logger.error({ sessionId, error: error.message || error }, 'AI error');
    this.pushLog({ type: 'ai_error', sessionId, timestamp: Date.now(), data: { error: error.message || error } });
  }

  logSessionError(sessionId: string, error: any) {
    logger.error({ sessionId, error: error.message || error }, 'Session error');
    this.pushLog({ type: 'session_error', sessionId, timestamp: Date.now(), data: { error: error.message || error } });
  }

  getRecentLogs(): LogEntry[] {
    return this.logs;
  }

  clearLogs(): void {
    this.logs = [];
  }
}

export const telemetryService = new TelemetryService();
