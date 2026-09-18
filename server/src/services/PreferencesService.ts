import { UserPreferences } from '../models/types';

class PreferencesService {
  private prefs = new Map<string, UserPreferences>();

  getPreferences(sessionId: string): UserPreferences {
    if (!this.prefs.has(sessionId)) {
      this.prefs.set(sessionId, {
        gestureSensitivity: 0.5,
        dominantHand: 'RIGHT',
        animationSpeed: 1,
        soundEnabled: true,
        aiEnabled: true,
        trackingSensitivity: 0.5
      });
    }
    return this.prefs.get(sessionId)!;
  }

  updatePreferences(sessionId: string, partial: Partial<UserPreferences>): UserPreferences {
    const current = this.getPreferences(sessionId);
    const updated = { ...current, ...partial };
    this.prefs.set(sessionId, updated);
    return updated;
  }
}

export const preferencesService = new PreferencesService();
