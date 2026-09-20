export type ProfileName = 'HIGH' | 'MEDIUM' | 'LOW' | 'MOBILE';

export type DeviceMetrics = {
  width: number;
  height: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory?: number;
};

export type PerformanceSettings = {
  name: ProfileName;
  pixelRatioCap: number;
  bloom: boolean;
  fxaa: boolean;
  dustPoints: number;
  globeSegments: number;
  clouds: boolean;
  atmosphere: boolean;
  cardTransmission: boolean;
  visibleCards: number;
  captureWidth: number;
  captureHeight: number;
  modelComplexity: 0 | 1;
  trackingIntervalMs: number;
  trackingTargetFps: number;
  renderTargetFps: number;
  holographicHands: boolean;
  floorAnimation: boolean;
  orbitClutter: boolean;
};

export const PROFILE_PRESETS: Record<ProfileName, PerformanceSettings> = {
  HIGH: {
    name: 'HIGH', pixelRatioCap: 1.5, bloom: true, fxaa: true, dustPoints: 180, globeSegments: 64,
    clouds: true, atmosphere: true, cardTransmission: true, visibleCards: 10,
    captureWidth: 640, captureHeight: 480, modelComplexity: 1, trackingIntervalMs: 33,
    trackingTargetFps: 30, renderTargetFps: 60, holographicHands: true, floorAnimation: true, orbitClutter: true,
  },
  MEDIUM: {
    name: 'MEDIUM', pixelRatioCap: 1.25, bloom: true, fxaa: true, dustPoints: 150, globeSegments: 48,
    clouds: true, atmosphere: true, cardTransmission: true, visibleCards: 7,
    captureWidth: 640, captureHeight: 480, modelComplexity: 1, trackingIntervalMs: 33,
    trackingTargetFps: 30, renderTargetFps: 60, holographicHands: true, floorAnimation: true, orbitClutter: true,
  },
  LOW: {
    name: 'LOW', pixelRatioCap: 1.0, bloom: false, fxaa: false, dustPoints: 120, globeSegments: 32,
    clouds: false, atmosphere: true, cardTransmission: false, visibleCards: 5,
    captureWidth: 480, captureHeight: 360, modelComplexity: 0, trackingIntervalMs: 50,
    trackingTargetFps: 20, renderTargetFps: 30, holographicHands: false, floorAnimation: false, orbitClutter: false,
  },
  MOBILE: {
    name: 'MOBILE', pixelRatioCap: 1.0, bloom: false, fxaa: false, dustPoints: 120, globeSegments: 32,
    clouds: false, atmosphere: true, cardTransmission: false, visibleCards: 3,
    captureWidth: 480, captureHeight: 360, modelComplexity: 0, trackingIntervalMs: 50,
    trackingTargetFps: 18, renderTargetFps: 30, holographicHands: false, floorAnimation: false, orbitClutter: false,
  },
};

export function readDeviceMetrics(): DeviceMetrics {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number };
  return {
    width: globalThis.innerWidth || 1024,
    height: globalThis.innerHeight || 768,
    devicePixelRatio: globalThis.devicePixelRatio || 1,
    hardwareConcurrency: nav?.hardwareConcurrency || 8,
    deviceMemory: nav?.deviceMemory,
  };
}

export function classifyDevice(metrics: DeviceMetrics): ProfileName {
  const minSide = Math.min(metrics.width, metrics.height);
  const maxSide = Math.max(metrics.width, metrics.height);
  const phoneViewport = minSide <= 500 || (maxSide <= 920 && metrics.devicePixelRatio >= 2);
  const constrainedPhone = metrics.devicePixelRatio >= 2 && (metrics.deviceMemory ?? 8) <= 4 && metrics.hardwareConcurrency <= 6 && maxSide <= 1400;
  if (phoneViewport || constrainedPhone) return 'MOBILE';
  if ((metrics.deviceMemory ?? 8) <= 4 || metrics.hardwareConcurrency <= 4) return 'LOW';
  if (metrics.hardwareConcurrency <= 8 || metrics.devicePixelRatio >= 2) return 'MEDIUM';
  return 'HIGH';
}

const TIER: ProfileName[] = ['LOW', 'MEDIUM', 'HIGH'];

export class PerformanceProfileManager {
  classified: ProfileName;
  profile: PerformanceSettings;
  private lowSince = 0;
  private highSince = 0;
  private listeners = new Set<(profile: PerformanceSettings) => void>();

  constructor(metrics: DeviceMetrics = readDeviceMetrics()) {
    this.classified = classifyDevice(metrics);
    this.profile = { ...PROFILE_PRESETS[this.classified] };
  }

  onChange(listener: (profile: PerformanceSettings) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reclassify(metrics: DeviceMetrics = readDeviceMetrics()) {
    const next = classifyDevice(metrics);
    if (next === this.profile.name) return this.profile;
    this.classified = next;
    this.setTier(next);
    return this.profile;
  }

  sampleFps(fps: number, now: number) {
    if (this.classified === 'MOBILE') return this.profile;
    if (fps < 24) {
      if (!this.lowSince) this.lowSince = now;
      this.highSince = 0;
      if (now - this.lowSince >= 2000) this.setTier(this.shift(-1));
    } else if (fps > 35) {
      if (!this.highSince) this.highSince = now;
      this.lowSince = 0;
      if (now - this.highSince >= 3000) this.setTier(this.shift(1));
    } else {
      this.lowSince = 0;
      this.highSince = 0;
    }
    return this.profile;
  }

  private shift(delta: number): ProfileName {
    const ceiling = TIER.indexOf(this.classified === 'MOBILE' ? 'LOW' : this.classified);
    const current = Math.max(0, TIER.indexOf(this.profile.name === 'MOBILE' ? 'LOW' : this.profile.name));
    const next = Math.max(0, Math.min(ceiling, current + delta));
    return TIER[next];
  }

  private setTier(name: ProfileName) {
    if (this.profile.name === name) return;
    this.lowSince = 0;
    this.highSince = 0;
    this.profile = { ...PROFILE_PRESETS[name] };
    for (const listener of this.listeners) listener(this.profile);
  }
}
