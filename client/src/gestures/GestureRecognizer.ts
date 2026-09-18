import { Landmark } from '../tracking/LandmarkFilter';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface GestureData {
  pinchDistance:  number;   // thumb-to-index, normalised [0..1]
  pinchMidpoint:  Landmark; // midpoint between thumb and index tips
  isPinching:     boolean;  // robust hysteresis pinch state
  pinchEdge:      'start' | 'hold' | 'release' | 'none';
  isOpen:         boolean;  // all 4 fingers extended
  isFist:         boolean;  // all 4 fingers curled
  indexExtended:  boolean;  // index up (pointing)
  handCenter:     Landmark; // palm centre (landmark 9)
  velocity:       { x: number; y: number; z: number };
  smoothedVel:    { x: number; y: number; z: number };  // 5-frame average
  swipeVelocityX: number;   // physical horizontal velocity (>0 = user moved right)
  swipeVelocityY: number;   // physical vertical velocity (>0 = user moved down)
  isSwipeHorizontal: boolean; // horizontal dominance check
  twoHandDistance?: number; // only populated when two hands fed
  handSize:       number;   // wrist-to-middle-MCP distance
  handedness:     string;   // 'LEFT' | 'RIGHT'
}

// ─── Dead-zone config ─────────────────────────────────────────────────────────

const VELOCITY_DEAD_ZONE = 0.0008;
const OPEN_FINGER_RATIO  = 1.15;
const BASELINE_HAND_SIZE = 0.16; // reference hand size for distance normalization

// ─── GestureRecognizer ────────────────────────────────────────────────────────

export class GestureRecognizer {
  private previousCenter: Landmark | null = null;
  private previousTime:   number = 0;
  private velocityHistory: { x: number; y: number; z: number }[] = [];

  // Robust two-level pinch state machine
  private isPinchActive:  boolean = false;
  private lastPinchReleaseTime: number = 0;

  private distance(a: Landmark, b: Landmark): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private midpoint(a: Landmark, b: Landmark): Landmark {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  }

  public recognize(
    landmarks:         Landmark[],
    timestamp:         number,
    handedness:        string = 'RIGHT',
    secondHandCenter?: Landmark
  ): GestureData {
    // ── Key landmarks ─────────────────────────────────────────────────────
    const wrist     = landmarks[0];
    const thumbTip  = landmarks[4];
    const indexMCP  = landmarks[5];
    const indexTip  = landmarks[8];
    const middleMCP = landmarks[9];
    const middleTip = landmarks[12];
    const ringMCP   = landmarks[13];
    const ringTip   = landmarks[16];
    const pinkyMCP  = landmarks[17];
    const pinkyTip  = landmarks[20];

    // ── Hand size & normalisation ─────────────────────────────────────────
    const handSize = this.distance(wrist, middleMCP);
    const sizeScale = handSize > 0 ? Math.max(0.6, Math.min(1.8, handSize / BASELINE_HAND_SIZE)) : 1.0;

    // ── Pinch distance & Hysteresis ───────────────────────────────────────
    const rawPinch      = this.distance(thumbTip, indexTip);
    const pinchDistance = handSize > 0 ? rawPinch / handSize : rawPinch;
    const pinchMidpoint = this.midpoint(thumbTip, indexTip);

    // Two-level hysteresis: enter < 0.16, exit > 0.22, cooldown 220ms
    let pinchEdge: 'start' | 'hold' | 'release' | 'none' = 'none';
    const nowMs = timestamp * 1000;

    if (!this.isPinchActive) {
      if (pinchDistance < 0.16 && (nowMs - this.lastPinchReleaseTime > 220)) {
        this.isPinchActive = true;
        pinchEdge = 'start';
      }
    } else {
      if (pinchDistance >= 0.22) {
        this.isPinchActive = false;
        this.lastPinchReleaseTime = nowMs;
        pinchEdge = 'release';
      } else {
        pinchEdge = 'hold';
      }
    }

    // ── Finger extension (tip further from wrist than MCP * ratio) ────────
    const indexExtended  = this.distance(indexTip, wrist)  > this.distance(indexMCP,  wrist) * OPEN_FINGER_RATIO;
    const middleExtended = this.distance(middleTip, wrist) > this.distance(middleMCP, wrist) * OPEN_FINGER_RATIO;
    const ringExtended   = this.distance(ringTip,   wrist) > this.distance(ringMCP,   wrist) * OPEN_FINGER_RATIO;
    const pinkyExtended  = this.distance(pinkyTip,  wrist) > this.distance(pinkyMCP,  wrist) * OPEN_FINGER_RATIO;

    const isOpen = indexExtended && middleExtended && ringExtended && pinkyExtended;
    const isFist = !indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
    const isPointing = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

    // ── Velocity calculation ───────────────────────────────────────────────
    const handCenter = middleMCP;
    let velocity     = { x: 0, y: 0, z: 0 };

    if (this.previousCenter !== null && this.previousTime > 0) {
      const dt = timestamp - this.previousTime;
      if (dt > 0 && dt < 0.2) {
        const raw = {
          x: (handCenter.x - this.previousCenter.x) / dt,
          y: (handCenter.y - this.previousCenter.y) / dt,
          z: (handCenter.z - this.previousCenter.z) / dt,
        };
        // Normalized by hand distance scale
        velocity = {
          x: Math.abs(raw.x) > VELOCITY_DEAD_ZONE ? raw.x / sizeScale : 0,
          y: Math.abs(raw.y) > VELOCITY_DEAD_ZONE ? raw.y / sizeScale : 0,
          z: Math.abs(raw.z) > VELOCITY_DEAD_ZONE ? raw.z / sizeScale : 0,
        };
      }
    }

    // 5-frame rolling average
    this.velocityHistory.push(velocity);
    if (this.velocityHistory.length > 5) this.velocityHistory.shift();

    const smoothedVel = this.velocityHistory.reduce(
      (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }),
      { x: 0, y: 0, z: 0 }
    );
    const n = this.velocityHistory.length || 1;
    smoothedVel.x /= n;
    smoothedVel.y /= n;
    smoothedVel.z /= n;

    this.previousCenter = { ...handCenter };
    this.previousTime   = timestamp;

    // Webcam mirror adjustment: In mirrored webcam space, moving physical hand to the right
    // decreases X in camera space. Invert X so positive swipeVelocityX = physical hand moved RIGHT.
    const swipeVelocityX = -smoothedVel.x;
    const swipeVelocityY = smoothedVel.y;
    const isSwipeHorizontal = Math.abs(swipeVelocityX) > 1.4 * Math.abs(swipeVelocityY);

    // ── Two-hand distance ─────────────────────────────────────────────────
    const twoHandDistance = secondHandCenter
      ? this.distance(handCenter, secondHandCenter)
      : undefined;

    return {
      pinchDistance,
      pinchMidpoint,
      isPinching: this.isPinchActive,
      pinchEdge,
      isOpen,
      isFist,
      indexExtended: isPointing,
      handCenter,
      velocity,
      smoothedVel,
      swipeVelocityX,
      swipeVelocityY,
      isSwipeHorizontal,
      twoHandDistance,
      handSize,
      handedness,
    };
  }

  public reset() {
    this.previousCenter       = null;
    this.previousTime         = 0;
    this.velocityHistory      = [];
    this.isPinchActive        = false;
    this.lastPinchReleaseTime = 0;
  }
}
