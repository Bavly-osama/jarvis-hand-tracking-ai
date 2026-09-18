import { randomUUID } from 'crypto';
import { Session } from '../models/types';
import { config } from '../config';

class SessionService {
  private sessions = new Map<string, Session>();
  
  createSession(deviceType: string): Session {
    const id = randomUUID();
    const session: Session = {
      id,
      startTime: Date.now(),
      deviceType,
      gestureCount: 0,
      recognizedGestures: 0,
      failedGestures: 0,
      avgConfidence: 0,
    };
    this.sessions.set(id, session);
    
    // Auto-cleanup after TTL
    setTimeout(() => {
      this.endSession(id);
    }, config.sessionTTL * 1000);
    
    return session;
  }
  
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
  
  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }
  
  updateSession(sessionId: string, partial: Partial<Session>): void {
    const session = this.getSession(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, ...partial });
    }
  }
}

export const sessionService = new SessionService();
