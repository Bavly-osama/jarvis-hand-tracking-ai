export interface UserGestureProfile {
  sessionId: string;
  preferredHand: 'LEFT' | 'RIGHT';
  averageSwipeVelocity: number;
  averageSwipeDistance: number;
  pinchThreshold: number;
  sensitivity: number;
  samplesRecorded: number;
  lastUpdated: number;
}

export class GestureProfileManager {
  private profiles = new Map<string, UserGestureProfile>();

  public getProfile(sessionId: string): UserGestureProfile {
    let profile = this.profiles.get(sessionId);
    if (!profile) {
      profile = {
        sessionId,
        preferredHand: 'RIGHT',
        averageSwipeVelocity: 0.35,
        averageSwipeDistance: 0.28,
        pinchThreshold: 0.16,
        sensitivity: 1.0,
        samplesRecorded: 0,
        lastUpdated: Date.now(),
      };
      this.profiles.set(sessionId, profile);
    }
    return profile;
  }

  public recordInteraction(
    sessionId: string,
    hand: 'LEFT' | 'RIGHT',
    velocity: number,
    distance: number,
    pinchDist?: number
  ): void {
    const p = this.getProfile(sessionId);
    p.preferredHand = hand;
    const n = Math.min(p.samplesRecorded, 20);
    p.averageSwipeVelocity = (p.averageSwipeVelocity * n + Math.abs(velocity)) / (n + 1);
    p.averageSwipeDistance = (p.averageSwipeDistance * n + Math.abs(distance)) / (n + 1);
    if (pinchDist !== undefined && pinchDist > 0) {
      p.pinchThreshold = (p.pinchThreshold * n + pinchDist) / (n + 1);
    }
    p.samplesRecorded++;
    p.lastUpdated = Date.now();
  }

  public getAdaptedThresholds(sessionId: string): { swipeVelocity: number; pinchDistance: number } {
    const p = this.getProfile(sessionId);
    return {
      swipeVelocity: Math.max(0.22, Math.min(0.55, p.averageSwipeVelocity * 0.85 / p.sensitivity)),
      pinchDistance: Math.max(0.12, Math.min(0.22, p.pinchThreshold * 1.1)),
    };
  }
}

export const gestureProfileManager = new GestureProfileManager();
