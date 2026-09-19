import type { Landmark } from './LandmarkFilter';
import { HandPresenceState } from './NormalizedHandState';

export const TRACK_GRACE_MS = 350;

export class HandPresenceManager {
  private marks: Landmark[] | null = null;
  private seen = -Infinity;
  private missing = true;
  private velocity = { x: 0, y: 0, z: 0 };
  private confidence = 0;
  private state = HandPresenceState.LOST;
  private opacity = 0;
  constructor(private config = {
    activateConfidence: 0.62,
    deactivateConfidence: 0.42,
    holdLastMs: 80,
    graceMs: TRACK_GRACE_MS,
    fadeMs: 900,
  }) {}

  update(landmarks: Landmark[] | null, confidence: number, velocity: Landmark, nowMs: number) {
    const keep = this.state === HandPresenceState.TRACKED || this.state === HandPresenceState.UNCERTAIN || this.state === HandPresenceState.REACQUIRING;
    const threshold = keep ? this.config.deactivateConfidence : this.config.activateConfidence;
    if (landmarks?.length === 21 && Number.isFinite(confidence) && confidence >= threshold) {
      const returning = this.missing || this.state === HandPresenceState.TEMPORARILY_LOST || this.state === HandPresenceState.LOST;
      this.marks = landmarks.map(p => ({ ...p }));
      this.seen = nowMs;
      this.missing = false;
      this.confidence = confidence;
      this.velocity = returning ? { x: 0, y: 0, z: 0 } : velocity;
      this.state = returning
        ? HandPresenceState.REACQUIRING
        : confidence >= this.config.activateConfidence ? HandPresenceState.TRACKED : HandPresenceState.UNCERTAIN;
      this.opacity = this.state === HandPresenceState.UNCERTAIN ? 0.7 : 1;
      return { state: this.state, landmarks: this.marks, opacity: this.opacity, shouldResetVelocity: returning };
    }
    this.missing = true;
    return this.sample(nowMs);
  }

  sample(nowMs: number) {
    const age = nowMs - this.seen;
    if (!this.marks || age >= this.config.fadeMs) {
      this.state = HandPresenceState.LOST;
      this.opacity = 0;
      return { state: this.state, landmarks: null, opacity: 0, shouldResetVelocity: true };
    }
    if (age <= this.config.holdLastMs) {
      this.state = this.state === HandPresenceState.TRACKED ? HandPresenceState.UNCERTAIN : this.state;
      this.opacity = Math.max(this.opacity, 0.7);
    } else if (age < this.config.graceMs) {
      this.state = HandPresenceState.TEMPORARILY_LOST;
      this.opacity = 0.55;
    } else {
      this.state = HandPresenceState.LOST;
      this.opacity = 0.55 * Math.max(0, 1 - (age - this.config.graceMs) / Math.max(1, this.config.fadeMs - this.config.graceMs));
      if (this.opacity <= 0.02) {
        this.opacity = 0;
        return { state: this.state, landmarks: null, opacity: 0, shouldResetVelocity: true };
      }
    }
    const dt = Math.max(0, Math.min(age - this.config.holdLastMs, 40)) / 1000;
    const clamp = (v: number) => Math.max(-0.012, Math.min(0.012, v));
    const landmarks = this.marks.map(p => ({ ...p, x: p.x + clamp(this.velocity.x * dt), y: p.y + clamp(this.velocity.y * dt) }));
    return { state: this.state, landmarks, opacity: this.opacity, shouldResetVelocity: false };
  }

  getState() { return this.state; }
  getOpacity() { return this.opacity; }
  getLastConfidence() { return this.confidence; }
  isTracking() { return this.state !== HandPresenceState.LOST; }
  reset() {
    this.marks = null;
    this.seen = -Infinity;
    this.missing = true;
    this.state = HandPresenceState.LOST;
    this.opacity = 0;
    this.confidence = 0;
  }
}
