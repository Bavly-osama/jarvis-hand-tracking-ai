import { sessionService } from '../services/SessionService';

describe('SessionService', () => {
  it('createSession returns valid session', () => {
    const session = sessionService.createSession('vr-headset');
    expect(session.id).toBeDefined();
    expect(session.deviceType).toBe('vr-headset');
  });

  it('endSession removes session', () => {
    const session = sessionService.createSession('vr-headset');
    sessionService.endSession(session.id);
    expect(sessionService.getSession(session.id)).toBeNull();
  });

  it('updateSession merges correctly', () => {
    const session = sessionService.createSession('vr-headset');
    sessionService.updateSession(session.id, { gestureCount: 5 });
    const updated = sessionService.getSession(session.id);
    expect(updated?.gestureCount).toBe(5);
    expect(updated?.deviceType).toBe('vr-headset');
  });
});
