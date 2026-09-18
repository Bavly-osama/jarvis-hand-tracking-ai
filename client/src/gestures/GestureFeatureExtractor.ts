import { GestureData } from './GestureRecognizer';

export interface SemanticFeatures {
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

export class ClientGestureFeatureExtractor {
  private static lastSpeed = 0;

  public static extract(
    data: GestureData,
    durationMs: number
  ): SemanticFeatures {
    const vx = data.swipeVelocityX;
    const vy = data.swipeVelocityY;
    const speed = Math.hypot(vx, vy);
    const acceleration = speed - this.lastSpeed;
    this.lastSpeed = speed;

    let direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'FORWARD' | 'BACKWARD' | 'NONE' = 'NONE';
    if (speed > 0.15) {
      if (Math.abs(vx) > Math.abs(vy) * 1.3) {
        direction = vx > 0 ? 'RIGHT' : 'LEFT';
      } else if (Math.abs(vy) > Math.abs(vx) * 1.3) {
        direction = vy > 0 ? 'DOWN' : 'UP';
      }
    }

    return {
      hand: (data.handedness as 'LEFT' | 'RIGHT') || 'RIGHT',
      motion: {
        direction,
        speed: parseFloat(speed.toFixed(3)),
        acceleration: parseFloat(acceleration.toFixed(3)),
        distance: parseFloat((speed * (durationMs / 1000)).toFixed(3)),
      },
      fingers: {
        indexExtended: data.indexExtended,
        thumbExtended: data.pinchDistance > 0.25,
        handOpen: data.isOpen,
        isFist: data.isFist,
      },
      pinch: {
        distance: parseFloat(data.pinchDistance.toFixed(3)),
        isPinching: data.isPinching,
      },
      timing: {
        duration: durationMs,
      },
    };
  }
}
