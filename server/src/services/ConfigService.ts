import { GestureConfig } from '../models/types';

class ConfigService {
  private config: GestureConfig = {
    swipe: { minVelocity: 1.5, confidence: 0.8 },
    pinch: { threshold: 0.2 },
    zoom: { minDelta: 0.1 },
    rotate: { minVelocity: 0.5 },
    deadZone: 0.05,
  };

  getConfig(): GestureConfig {
    return this.config;
  }

  updateConfig(partial: Partial<GestureConfig>): GestureConfig {
    this.config = { ...this.config, ...partial };
    return this.config;
  }
}

export const configService = new ConfigService();
