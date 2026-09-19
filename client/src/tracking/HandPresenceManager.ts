import { Landmark } from './LandmarkFilter';
import { HandPresenceState } from './NormalizedHandState';

// ─── Configuration ──────────────────────────────────────────────────────────

interface PresenceConfig {
  // Confidence hysteresis
  activateConfidence:   number;  // confidence to transition to VISIBLE
  deactivateConfidence: number;  // sustained below this → begin degradation
  deactivateHoldMs:     number;  // how long below deactivate before WEAK

  // Grace period timings (ms)
  holdLastMs:    number;  // 0–N ms: keep last stable landmarks
  predictMs:     number;  // holdLast–N ms: predict from velocity
  fadeMs:        number;  // predict–N ms: fade out visualization
  // after fadeMs: HAND_LOST

  // Reacquisition
  reacquireBlendFrames: number;  // frames to blend when hand returns
}

const DEFAULT_CONFIG: PresenceConfig = {
  activateConfidence:   0.65,
  deactivateConfidence: 0.45,
  deactivateHoldMs:     120,

  holdLastMs:    150,
  predictMs:     400,
  fadeMs:        700,

  reacquireBlendFrames: 5,
};

// ─── HandPresenceManager ────────────────────────────────────────────────────

export class HandPresenceManager {
  private config: PresenceConfig;
  private state: HandPresenceState = HandPresenceState.HAND_LOST;

  // Timing
  private lastSeenTime: number = 0;          // last time we got good landmarks
  private lastLandmarkTime: number = 0;      // last time any landmarks arrived
  private lowConfStartTime: number = 0;      // when confidence first dropped
  private isLowConf: boolean = false;

  // Last known good data
  private lastLandmarks: Landmark[] | null = null;
  private lastVelocity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private lastConfidence: number = 0;

  // Fade
  private fadeOpacity: number = 0;

  // Reacquisition
  private reacquireFramesRemaining: number = 0;
  private preReacquireLandmarks: Landmark[] | null = null;

  constructor(config: Partial<PresenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Main update — call every tracking frame ────────────────────────────

  public update(
    landmarks: Landmark[] | null,
    confidence: number,
    velocity: { x: number; y: number; z: number },
    nowMs: number
  ): {
    state: HandPresenceState;
    landmarks: Landmark[] | null;
    opacity: number;
    shouldResetVelocity: boolean;
  } {
    const hadLandmarks = landmarks !== null && landmarks.length > 0;
    let shouldResetVelocity = false;

    if (hadLandmarks) {
      // ── We have landmarks this frame ──
      const wasLost = this.state === HandPresenceState.HAND_LOST ||
                      this.state === HandPresenceState.HAND_PREDICTED;

      // Handle reacquisition
      if (wasLost && this.lastLandmarks) {
        this.reacquireFramesRemaining = this.config.reacquireBlendFrames;
        this.preReacquireLandmarks = this.lastLandmarks;
        shouldResetVelocity = true;
      }

      // Blend landmarks during reacquisition
      if (this.reacquireFramesRemaining > 0 && this.preReacquireLandmarks && landmarks) {
        const t = 1 - (this.reacquireFramesRemaining / this.config.reacquireBlendFrames);
        landmarks = this.blendLandmarks(this.preReacquireLandmarks, landmarks, t);
        this.reacquireFramesRemaining--;
        if (this.reacquireFramesRemaining <= 0) {
          this.preReacquireLandmarks = null;
        }
      }

      this.lastLandmarks = landmarks!.map(l => ({ ...l }));
      this.lastVelocity = { ...velocity };
      this.lastLandmarkTime = nowMs;
      this.lastConfidence = confidence;

      // Confidence hysteresis
      if (confidence >= this.config.activateConfidence) {
        this.state = HandPresenceState.HAND_VISIBLE;
        this.lastSeenTime = nowMs;
        this.isLowConf = false;
        this.fadeOpacity = 1;
      } else if (confidence >= this.config.deactivateConfidence) {
        // In hysteresis band
        if (this.state === HandPresenceState.HAND_VISIBLE) {
          // Stay visible
          this.lastSeenTime = nowMs;
          this.fadeOpacity = 1;
        } else {
          this.state = HandPresenceState.HAND_WEAK;
          this.lastSeenTime = nowMs;
          this.fadeOpacity = 0.7;
        }
        this.isLowConf = false;
      } else {
        // Below deactivate threshold
        if (!this.isLowConf) {
          this.isLowConf = true;
          this.lowConfStartTime = nowMs;
        }
        const lowDuration = nowMs - this.lowConfStartTime;
        if (lowDuration < this.config.deactivateHoldMs) {
          // Hold current state during debounce
          if (this.state === HandPresenceState.HAND_VISIBLE ||
              this.state === HandPresenceState.HAND_WEAK) {
            this.lastSeenTime = nowMs;
          }
        } else {
          this.state = HandPresenceState.HAND_WEAK;
          this.fadeOpacity = 0.5;
        }
      }

      return {
        state: this.state,
        landmarks: landmarks,
        opacity: this.fadeOpacity,
        shouldResetVelocity,
      };
    }

    // ── No landmarks this frame ──
    const elapsed = nowMs - this.lastLandmarkTime;

    if (elapsed < this.config.holdLastMs) {
      // Grace: hold last known landmarks
      if (this.state !== HandPresenceState.HAND_LOST) {
        this.fadeOpacity = 1;
      }
      return {
        state: this.state,
        landmarks: this.lastLandmarks,
        opacity: this.fadeOpacity,
        shouldResetVelocity: false,
      };
    }

    if (elapsed < this.config.predictMs) {
      // Predict from velocity
      this.state = HandPresenceState.HAND_PREDICTED;
      const predicted = this.predictLandmarks(elapsed - this.config.holdLastMs);
      this.fadeOpacity = 0.6;
      return {
        state: this.state,
        landmarks: predicted,
        opacity: this.fadeOpacity,
        shouldResetVelocity: false,
      };
    }

    if (elapsed < this.config.fadeMs) {
      // Fading out
      this.state = HandPresenceState.HAND_PREDICTED;
      const fadeProgress = (elapsed - this.config.predictMs) /
                           (this.config.fadeMs - this.config.predictMs);
      this.fadeOpacity = Math.max(0, 0.6 * (1 - fadeProgress));
      const predicted = this.predictLandmarks(this.config.predictMs - this.config.holdLastMs);
      return {
        state: this.state,
        landmarks: predicted,
        opacity: this.fadeOpacity,
        shouldResetVelocity: false,
      };
    }

    // Fully lost
    this.state = HandPresenceState.HAND_LOST;
    this.fadeOpacity = 0;
    return {
      state: HandPresenceState.HAND_LOST,
      landmarks: null,
      opacity: 0,
      shouldResetVelocity: true,
    };
  }

  // ── Predict landmark positions from last known velocity ────────────────

  private predictLandmarks(predictionMs: number): Landmark[] | null {
    if (!this.lastLandmarks) return null;
    const dt = predictionMs / 1000;
    // Clamp prediction to avoid runaway
    const maxPrediction = 0.05;
    const vx = Math.max(-maxPrediction, Math.min(maxPrediction, this.lastVelocity.x * dt));
    const vy = Math.max(-maxPrediction, Math.min(maxPrediction, this.lastVelocity.y * dt));

    return this.lastLandmarks.map(lm => ({
      x: lm.x + vx,
      y: lm.y + vy,
      z: lm.z,
    }));
  }

  // ── Blend two landmark sets for smooth reacquisition ───────────────────

  private blendLandmarks(from: Landmark[], to: Landmark[], t: number): Landmark[] {
    const count = Math.min(from.length, to.length);
    const result: Landmark[] = [];
    const st = Math.max(0, Math.min(1, t));
    for (let i = 0; i < count; i++) {
      result.push({
        x: from[i].x + (to[i].x - from[i].x) * st,
        y: from[i].y + (to[i].y - from[i].y) * st,
        z: from[i].z + (to[i].z - from[i].z) * st,
      });
    }
    return result;
  }

  // ── Queries ────────────────────────────────────────────────────────────

  public getState(): HandPresenceState { return this.state; }
  public getOpacity(): number { return this.fadeOpacity; }
  public getLastConfidence(): number { return this.lastConfidence; }
  public isTracking(): boolean {
    return this.state !== HandPresenceState.HAND_LOST;
  }

  public reset(): void {
    this.state = HandPresenceState.HAND_LOST;
    this.lastLandmarks = null;
    this.lastConfidence = 0;
    this.fadeOpacity = 0;
    this.isLowConf = false;
    this.reacquireFramesRemaining = 0;
    this.preReacquireLandmarks = null;
  }
}
