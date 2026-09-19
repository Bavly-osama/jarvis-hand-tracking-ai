import { OneEuroFilter } from '../tracking/LandmarkFilter';

export const MOTION_CONFIG = {
  POINTER_GAIN_MIN: 0.42,
  POINTER_GAIN_MAX: 1.05,
  SLOW_MOVEMENT_GAIN: 0.50,
  FAST_MOVEMENT_GAIN: 0.95,
  ACCELERATION_CURVE: 1.35,
  DEAD_ZONE: 0.0035,
  MAX_POINTER_SPEED: 1.15,
  MAX_VALID_FRAME_DELTA: 0.12,
  SLOW_SPEED: 0.28,
  FAST_SPEED: 1.70,
};

export type MotionSample = {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  velocityX: number;
  velocityY: number;
  reanchored: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class PointerMotionMapper {
  readonly config = MOTION_CONFIG;
  private filterX = new OneEuroFilter(1.6, 8, 2);
  private filterY = new OneEuroFilter(1.6, 8, 2);
  private prevX: number | null = null;
  private prevY: number | null = null;
  private prevT = 0;

  reset() {
    this.filterX.reset();
    this.filterY.reset();
    this.prevX = this.prevY = null;
    this.prevT = 0;
  }

  reanchor(x: number, y: number, timestamp: number) {
    this.prevX = x;
    this.prevY = y;
    this.prevT = timestamp;
  }

  sample(x: number, y: number, timestamp: number): MotionSample {
    const tSec = timestamp / 1000;
    const fx = this.filterX.filter(x, tSec);
    const fy = this.filterY.filter(y, tSec);
    if (this.prevX === null || this.prevY === null || timestamp <= this.prevT) {
      this.prevX = fx;
      this.prevY = fy;
      this.prevT = timestamp;
      return { x: fx, y: fy, deltaX: 0, deltaY: 0, velocityX: 0, velocityY: 0, reanchored: true };
    }

    const rawDx = fx - this.prevX;
    const rawDy = fy - this.prevY;
    if (Math.abs(rawDx) > MOTION_CONFIG.MAX_VALID_FRAME_DELTA || Math.abs(rawDy) > MOTION_CONFIG.MAX_VALID_FRAME_DELTA) {
      this.prevX = fx;
      this.prevY = fy;
      this.prevT = timestamp;
      return { x: fx, y: fy, deltaX: 0, deltaY: 0, velocityX: 0, velocityY: 0, reanchored: true };
    }

    const dt = Math.max(0.001, (timestamp - this.prevT) / 1000);
    const dead = MOTION_CONFIG.DEAD_ZONE;
    const dx = Math.abs(rawDx) < dead ? 0 : rawDx;
    const dy = Math.abs(rawDy) < dead ? 0 : rawDy;
    let velocityX = dx / dt;
    let velocityY = dy / dt;
    const speed = Math.hypot(velocityX, velocityY);
    const ramp = clamp((speed - MOTION_CONFIG.SLOW_SPEED) / (MOTION_CONFIG.FAST_SPEED - MOTION_CONFIG.SLOW_SPEED), 0, 1);
    const curved = Math.pow(ramp, MOTION_CONFIG.ACCELERATION_CURVE);
    const gain = clamp(
      MOTION_CONFIG.SLOW_MOVEMENT_GAIN + (MOTION_CONFIG.FAST_MOVEMENT_GAIN - MOTION_CONFIG.SLOW_MOVEMENT_GAIN) * curved,
      MOTION_CONFIG.POINTER_GAIN_MIN,
      MOTION_CONFIG.POINTER_GAIN_MAX
    );
    velocityX *= gain;
    velocityY *= gain;
    const clamped = Math.hypot(velocityX, velocityY);
    if (clamped > MOTION_CONFIG.MAX_POINTER_SPEED) {
      const scale = MOTION_CONFIG.MAX_POINTER_SPEED / clamped;
      velocityX *= scale;
      velocityY *= scale;
    }

    this.prevX = fx;
    this.prevY = fy;
    this.prevT = timestamp;
    return {
      x: fx,
      y: fy,
      deltaX: velocityX * dt,
      deltaY: velocityY * dt,
      velocityX,
      velocityY,
      reanchored: false,
    };
  }
}
