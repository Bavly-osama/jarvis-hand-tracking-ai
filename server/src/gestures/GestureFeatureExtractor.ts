export interface RawMotionSample {
  x: number;
  y: number;
  z?: number;
  time: number;
}

export interface ExtractedSemanticFeatures {
  hand: 'LEFT' | 'RIGHT';
  motion: {
    direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'FORWARD' | 'BACKWARD' | 'NONE';
    speed: number;
    acceleration: number;
    distance: number;
  };
  fingers: {
    indexExtended: boolean;
    thumbExtended: boolean;
    handOpen: boolean;
    isFist: boolean;
  };
  pinch: {
    distance: number;
    isPinching: boolean;
  };
  timing: {
    duration: number;
  };
}

export class GestureFeatureExtractor {
  /**
   * Extracts semantic features from motion history and finger states.
   */
  public static extract(
    hand: 'LEFT' | 'RIGHT',
    samples: RawMotionSample[],
    fingerState: { index: boolean; thumb: boolean; open: boolean; fist: boolean },
    pinchDistance: number,
    durationMs: number
  ): ExtractedSemanticFeatures {
    if (!samples || samples.length < 2) {
      return {
        hand,
        motion: { direction: 'NONE', speed: 0, acceleration: 0, distance: 0 },
        fingers: {
          indexExtended: fingerState.index,
          thumbExtended: fingerState.thumb,
          handOpen: fingerState.open,
          isFist: fingerState.fist,
        },
        pinch: {
          distance: pinchDistance,
          isPinching: pinchDistance < 0.18,
        },
        timing: { duration: durationMs },
      };
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const distance = Math.hypot(dx, dy);
    const totalTime = Math.max(0.001, (last.time - first.time) / 1000);
    const speed = distance / totalTime;

    let direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'FORWARD' | 'BACKWARD' | 'NONE' = 'NONE';
    if (distance > 0.04) {
      if (Math.abs(dx) > Math.abs(dy) * 1.3) {
        direction = dx > 0 ? 'RIGHT' : 'LEFT';
      } else if (Math.abs(dy) > Math.abs(dx) * 1.3) {
        direction = dy > 0 ? 'DOWN' : 'UP';
      }
    }

    let acceleration = 0;
    if (samples.length >= 3) {
      const mid = samples[Math.floor(samples.length / 2)];
      const t1 = Math.max(0.001, (mid.time - first.time) / 1000);
      const t2 = Math.max(0.001, (last.time - mid.time) / 1000);
      const v1 = Math.hypot(mid.x - first.x, mid.y - first.y) / t1;
      const v2 = Math.hypot(last.x - mid.x, last.y - mid.y) / t2;
      acceleration = (v2 - v1) / ((t1 + t2) / 2);
    }

    return {
      hand,
      motion: {
        direction,
        speed: parseFloat(speed.toFixed(3)),
        acceleration: parseFloat(acceleration.toFixed(3)),
        distance: parseFloat(distance.toFixed(3)),
      },
      fingers: {
        indexExtended: fingerState.index,
        thumbExtended: fingerState.thumb,
        handOpen: fingerState.open,
        isFist: fingerState.fist,
      },
      pinch: {
        distance: parseFloat(pinchDistance.toFixed(3)),
        isPinching: pinchDistance < 0.18,
      },
      timing: { duration: durationMs },
    };
  }
}
