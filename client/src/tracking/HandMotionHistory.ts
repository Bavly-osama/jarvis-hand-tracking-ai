import { Landmark } from './LandmarkFilter';
import { HandPose, NormalizedHandState } from './NormalizedHandState';

// ─── History entry ──────────────────────────────────────────────────────────

export interface MotionSample {
  position:   { x: number; y: number; z: number };
  velocity:   { x: number; y: number; z: number };
  pose:       HandPose;
  confidence: number;
  targetId:   string | null;
  timestamp:  number;
  landmarks:  Landmark[];
}

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_HISTORY_MS    = 1200;  // keep ~1.2s of history
const MAX_HISTORY_COUNT = 60;    // cap at ~60 entries

// ─── HandMotionHistory ──────────────────────────────────────────────────────

export class HandMotionHistory {
  private samples: MotionSample[] = [];

  // ── Add a sample ──────────────────────────────────────────────────────

  public push(sample: MotionSample): void {
    this.samples.push(sample);

    // Prune old entries
    const cutoff = sample.timestamp - MAX_HISTORY_MS;
    while (this.samples.length > MAX_HISTORY_COUNT ||
           (this.samples.length > 0 && this.samples[0].timestamp < cutoff)) {
      this.samples.shift();
    }
  }

  // ── Get recent N samples ──────────────────────────────────────────────

  public recent(count: number): MotionSample[] {
    return this.samples.slice(-count);
  }

  // ── Get samples within time window ────────────────────────────────────

  public window(durationMs: number): MotionSample[] {
    if (this.samples.length === 0) return [];
    const cutoff = this.samples[this.samples.length - 1].timestamp - durationMs;
    return this.samples.filter(s => s.timestamp >= cutoff);
  }

  // ── Compute average velocity over recent window ───────────────────────

  public averageVelocity(durationMs: number = 200): { x: number; y: number; z: number } {
    const win = this.window(durationMs);
    if (win.length === 0) return { x: 0, y: 0, z: 0 };
    const sum = win.reduce(
      (acc, s) => ({
        x: acc.x + s.velocity.x,
        y: acc.y + s.velocity.y,
        z: acc.z + s.velocity.z,
      }),
      { x: 0, y: 0, z: 0 }
    );
    const n = win.length;
    return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
  }

  // ── Compute displacement over time window ─────────────────────────────

  public displacement(durationMs: number): { x: number; y: number; z: number } {
    const win = this.window(durationMs);
    if (win.length < 2) return { x: 0, y: 0, z: 0 };
    const first = win[0];
    const last = win[win.length - 1];
    return {
      x: last.position.x - first.position.x,
      y: last.position.y - first.position.y,
      z: last.position.z - first.position.z,
    };
  }

  // ── Check direction consistency ───────────────────────────────────────

  public directionConsistency(axis: 'x' | 'y' | 'z', durationMs: number = 300): number {
    const win = this.window(durationMs);
    if (win.length < 3) return 0;

    let consistent = 0;
    let total = 0;
    const overallDirection = Math.sign(win[win.length - 1].velocity[axis]);

    for (const s of win) {
      total++;
      if (Math.sign(s.velocity[axis]) === overallDirection) consistent++;
    }

    return total > 0 ? consistent / total : 0;
  }

  // ── Get peak speed in window ──────────────────────────────────────────

  public peakSpeed(durationMs: number = 300): number {
    const win = this.window(durationMs);
    let peak = 0;
    for (const s of win) {
      const speed = Math.sqrt(s.velocity.x ** 2 + s.velocity.y ** 2 + s.velocity.z ** 2);
      if (speed > peak) peak = speed;
    }
    return peak;
  }

  // ── Get Z displacement pattern (for tap detection) ────────────────────

  public zPattern(durationMs: number = 500): {
    minZ: number; maxZ: number; deltaZ: number;
    hasForwardPush: boolean; hasRetract: boolean;
  } {
    const win = this.window(durationMs);
    if (win.length < 3) {
      return { minZ: 0, maxZ: 0, deltaZ: 0, hasForwardPush: false, hasRetract: false };
    }

    let minZ = Infinity, maxZ = -Infinity;
    let forwardSamples = 0, retractSamples = 0;

    for (const s of win) {
      if (s.position.z < minZ) minZ = s.position.z;
      if (s.position.z > maxZ) maxZ = s.position.z;
      if (s.velocity.z < -0.01) forwardSamples++;
      if (s.velocity.z > 0.01) retractSamples++;
    }

    return {
      minZ,
      maxZ,
      deltaZ: maxZ - minZ,
      hasForwardPush: forwardSamples >= 2,
      hasRetract: retractSamples >= 2,
    };
  }

  // ── Was the hand stable recently? ─────────────────────────────────────

  public wasStable(durationMs: number = 200, threshold: number = 0.01): boolean {
    const win = this.window(durationMs);
    if (win.length < 2) return false;
    for (const s of win) {
      const speed = Math.sqrt(s.velocity.x ** 2 + s.velocity.y ** 2);
      if (speed > threshold) return false;
    }
    return true;
  }

  // ── Get the latest sample ─────────────────────────────────────────────

  public latest(): MotionSample | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
  }

  // ── Count ─────────────────────────────────────────────────────────────

  public get length(): number { return this.samples.length; }

  // ── Reset ─────────────────────────────────────────────────────────────

  public reset(): void {
    this.samples = [];
  }

  // ── Soft reset — keep last few for continuity ─────────────────────────

  public softReset(): void {
    if (this.samples.length > 3) {
      this.samples = this.samples.slice(-3);
    }
  }
}
