import type { Landmark } from '../tracking/LandmarkFilter';
import { HandCoordinateNormalizer } from '../tracking/HandCoordinateNormalizer';
import { AdaptiveLandmarkFilter } from '../tracking/AdaptiveLandmarkFilter';
import { HandPresenceManager, TRACK_GRACE_MS } from '../tracking/HandPresenceManager';
import { HandPoseAnalyzer } from '../gestures/HandPoseAnalyzer';
import { PointerMotionMapper, MOTION_CONFIG } from './PointerMotionMapper';
import { HandPresenceState } from '../tracking/NormalizedHandState';

export const HAND_CONFIG = {
  DEAD_ZONE: MOTION_CONFIG.DEAD_ZONE,
  PINCH_DOWN_RATIO: 0.22,
  PINCH_RELEASE_RATIO: 0.34,
  PINCH_STABLE_MS: 100,
  CLICK_MOVE_THRESHOLD: 0.025,
  /** Cancel a pinch candidate if the palm drifts this far (no drag mode). */
  PINCH_CANCEL_MOVE: 0.045,
  MIN_ZOOM: 0.7,
  MAX_ZOOM: 2.0,
  ZOOM_DEAD_ZONE: 0.025,
  ZOOM_STABILIZE_MS: 120,
  ZOOM_SMOOTH: 0.35,
  ZOOM_LOSS_MS: TRACK_GRACE_MS,
  /** Accumulated logical ΔX before one-card snap (positive = RIGHT). */
  NAV_THRESHOLD: 0.085,
  /** Palm speed below this unlocks the next nav step after a snap. */
  NAV_UNLOCK_SPEED: 0.08,
  /** Consecutive near-still frames required to unlock after a snap. */
  NAV_UNLOCK_FRAMES: 4,
  TRACK_GRACE_MS,
  TRACK_ENTER_CONFIDENCE: 0.62,
  TRACK_KEEP_CONFIDENCE: 0.42,
  ACTION_CONFIDENCE: 0.42,
};

export type HandFrame = {
  timestamp: number;
  space: 'camera' | 'logical';
  hands: { landmarks: Landmark[]; handedness: string; quality?: number }[];
  video?: { width: number; height: number };
  stage?: { width: number; height: number };
};
export type HandContext = { id: string; home: boolean; scale: number };
export type HandGesture = 'IDLE' | 'HOVER' | 'POINT' | 'PINCH_START' | 'PINCH_CONFIRMED' | 'RELEASE' | 'MOVE' | 'ZOOM' | 'RECOVERING_TRACKING';
export type PinchState = 'OPEN' | 'PINCH_CANDIDATE' | 'PINCHED' | 'RELEASE_WAIT';
export type ZoomPhase = 'NONE' | 'TWO_HAND_CANDIDATE' | 'ZOOM_ACTIVE' | 'ZOOM_END';
export type InteractionMode = 'IDLE' | 'POINTER' | 'HOVER' | 'PINCH' | 'MOVE' | 'ZOOM';
/** +1 = hand moved RIGHT → next card; -1 = LEFT → previous card; 0 = none. */
export type NavStep = -1 | 0 | 1;

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const zero = () => ({ x: 0, y: 0, z: 0 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type BoundHand = { landmarks: Landmark[]; raw: Landmark[]; handedness: string; quality: number; id: string };

function observationQuality(landmarks: Landmark[], prevPalm: Landmark | null, reported?: number) {
  if (reported !== undefined && Number.isFinite(reported)) return reported;
  if (landmarks.length !== 21 || landmarks.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return 0;
  const palm = landmarks[9];
  const size = distance(landmarks[0], palm);
  const sizeOk = size > 0.015 && size < 0.6 ? 1 : 0.15;
  const continuity = prevPalm ? 1 - Math.min(1, distance(palm, prevPalm) / 0.35) : 0.8;
  return clamp(0.35 * sizeOk + 0.25 + 0.4 * continuity, 0, 1);
}

/** Sole owner of camera gesture decisions. Fixtures use this production path. */
export class HandInteractionEngine {
  readonly normalizer = new HandCoordinateNormalizer();
  readonly presence = new HandPresenceManager();
  readonly motion = new PointerMotionMapper();
  readonly history: { timestamp: number; x: number; y: number; state: HandGesture; target: string | null; quality: number }[] = [];
  private filters = [new AdaptiveLandmarkFilter(1), new AdaptiveLandmarkFilter(1)];
  private analyzer = new HandPoseAnalyzer();
  state: HandGesture = 'IDLE';
  mode: InteractionMode = 'IDLE';
  pinchState: PinchState = 'OPEN';
  zoomPhase: ZoomPhase = 'NONE';
  private previous: Landmark | null = null;
  private anchor: Landmark | null = null;
  private primaryRaw: Landmark | null = null;
  private lastSeen = -Infinity;
  private lastTime = -Infinity;
  private pinchAt = 0;
  private pinchTarget: string | null = null;
  private pinchOrigin: Landmark | null = null;
  private pinchClicked = false;
  private zoomStartDistance = 0;
  private zoomStartScale = 1;
  private zoomRendered = 1;
  private zoomCandidateAt = 0;
  private zoomPausedAt = 0;
  private context = '';
  private handedness = 'UNKNOWN';
  private tracks: { id: string; palm: Landmark; handedness: string }[] = [];
  private debugHands: { id: string; state: string; confidence: number; rawX: number; rawY: number; filteredX: number; filteredY: number; velocityX: number; velocityY: number; handedness: string }[] = [];
  private zoomDistance = 0;
  private zoomRatio = 1;
  private navAccum = 0;
  private navLocked = false;
  private navIdleFrames = 0;
  /** True after entering PINCHED until click fires on release (one-shot). */
  private pinchArmed = false;

  reset() {
    this.filters.forEach(f => f.reset());
    this.presence.reset();
    this.motion.reset();
    this.history.length = 0;
    this.state = 'IDLE';
    this.mode = 'IDLE';
    this.pinchState = 'OPEN';
    this.zoomPhase = 'NONE';
    this.previous = this.anchor = this.primaryRaw = null;
    this.lastSeen = this.lastTime = -Infinity;
    this.pinchTarget = this.pinchOrigin = null;
    this.pinchClicked = false;
    this.pinchArmed = false;
    this.zoomStartDistance = 0;
    this.navAccum = 0;
    this.navLocked = false;
    this.navIdleFrames = 0;
    this.context = '';
    this.tracks = [];
    this.debugHands = [];
  }

  private bindHands(incoming: BoundHand[]) {
    if (!this.tracks.length || incoming.length === 0) {
      this.tracks = incoming.map((h, i) => ({ id: 'H' + (i + 1), palm: h.landmarks[9], handedness: h.handedness }));
      return incoming.map((h, i) => ({ ...h, id: 'H' + (i + 1) }));
    }
    const used = new Set<number>();
    const ordered: BoundHand[] = [];
    for (const track of this.tracks) {
      let best = -1;
      let bestScore = Infinity;
      incoming.forEach((hand, i) => {
        if (used.has(i)) return;
        const score = distance(hand.landmarks[9], track.palm) + (hand.handedness === track.handedness ? 0 : 0.08);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best >= 0) {
        used.add(best);
        ordered.push({ ...incoming[best], id: track.id });
      }
    }
    incoming.forEach((hand, i) => {
      if (!used.has(i)) ordered.push({ ...hand, id: 'H' + (ordered.length + 1) });
    });
    this.tracks = ordered.map(h => ({ id: h.id, palm: h.landmarks[9], handedness: h.handedness }));
    return ordered;
  }

  private emptyResult(now: number) {
    return {
      state: this.state,
      mode: this.mode,
      pointer: null as Landmark | null,
      raw: null as Landmark[] | null,
      landmarks: null as Landmark[] | null,
      presence: this.presence.sample(now) as {state: HandPresenceState; landmarks: Landmark[] | null; opacity: number; shouldResetVelocity?: boolean},
      target: null as string | null,
      clickTarget: null as string | null,
      capturedTarget: this.pinchTarget,
      dragDelta: zero(),
      dragStart: false,
      dragEnd: false,
      navStep: 0 as NavStep,
      navLocked: this.navLocked,
      zoom: this.zoomPhase === 'NONE' ? null as number | null : this.zoomRendered,
      pinchDistance: 1,
      pinchRatio: 1,
      pinchState: this.pinchState,
      pinchThresholdDown: HAND_CONFIG.PINCH_DOWN_RATIO,
      pinchThresholdRelease: HAND_CONFIG.PINCH_RELEASE_RATIO,
      progress: 0,
      velocity: zero(),
      quality: 0,
      handedness: this.handedness,
      handCount: 0,
      pose: 'UNKNOWN',
      openness: 0,
      zoomDistance: this.zoomDistance,
      zoomStartDistance: this.zoomStartDistance,
      zoomRatio: this.zoomRatio,
      zoomState: this.zoomPhase,
      hands: this.debugHands,
    };
  }

  process(frame: HandFrame, hitTest: (x: number, y: number) => string | null, context: HandContext) {
    const now = frame.timestamp;
    const result = this.emptyResult(now);
    if (!Number.isFinite(now) || now <= this.lastTime) return result;
    this.lastTime = now;
    if (this.context && this.context !== context.id) {
      this.state = 'IDLE';
      this.mode = 'IDLE';
      this.anchor = this.previous = null;
      this.pinchState = 'OPEN';
      this.pinchTarget = null;
      this.pinchClicked = true;
      this.pinchArmed = false;
      this.zoomPhase = 'NONE';
      this.navAccum = 0;
      this.navLocked = false;
    }
    this.context = context.id;

    const incoming = frame.hands.slice(0, 2)
      .filter(h => h.landmarks.length === 21 && h.landmarks.every(p => [p.x, p.y, p.z].every(Number.isFinite)) && distance(h.landmarks[0], h.landmarks[9]) > 0.015)
      .map(h => {
        const raw = h.landmarks;
        const landmarks = this.normalizer.landmarks(raw, frame.space, frame.video, frame.stage);
        return {
          raw,
          landmarks,
          handedness: this.normalizer.handedness(h.handedness, frame.space),
          quality: observationQuality(landmarks, this.primaryRaw, h.quality),
          id: '',
        };
      });
    const bound = this.bindHands(incoming);
    const keep = this.presence.getState() === HandPresenceState.TRACKED || this.presence.getState() === HandPresenceState.UNCERTAIN || this.presence.getState() === HandPresenceState.REACQUIRING;
    const usable = bound.filter(h => h.quality >= (keep ? HAND_CONFIG.TRACK_KEEP_CONFIDENCE : HAND_CONFIG.TRACK_ENTER_CONFIDENCE));
    result.handCount = usable.length;
    result.quality = usable[0]?.quality ?? 0;

    if (!usable.length) {
      const age = now - this.lastSeen;
      result.presence = this.presence.update(null, 0, zero(), now) as typeof result.presence;
      result.clickTarget = null;
      result.dragDelta = zero();
      result.navStep = 0;
      if (this.zoomPhase === 'ZOOM_ACTIVE' || this.zoomPhase === 'TWO_HAND_CANDIDATE') {
        if (!this.zoomPausedAt) this.zoomPausedAt = now;
        result.zoom = this.zoomRendered;
        this.state = age <= HAND_CONFIG.TRACK_GRACE_MS ? 'ZOOM' : 'RECOVERING_TRACKING';
        if (now - this.zoomPausedAt > HAND_CONFIG.ZOOM_LOSS_MS) this.zoomPhase = 'ZOOM_END';
      } else if (age <= HAND_CONFIG.TRACK_GRACE_MS) {
        this.state = 'RECOVERING_TRACKING';
        this.mode = this.mode === 'ZOOM' ? 'ZOOM' : 'IDLE';
      } else {
        this.pinchState = 'OPEN';
        this.pinchTarget = null;
        this.pinchClicked = true;
        this.pinchArmed = false;
        this.motion.reset();
        this.previous = this.anchor = null;
        this.navAccum = 0;
        this.navLocked = false;
        if (this.zoomPhase !== 'NONE') this.zoomPhase = 'ZOOM_END';
        this.state = result.presence.state === HandPresenceState.LOST ? 'IDLE' : 'RECOVERING_TRACKING';
        this.mode = 'IDLE';
      }
      result.state = this.state;
      result.mode = this.mode;
      result.navLocked = this.navLocked;
      return result;
    }

    const returning = now - this.lastSeen > 40 && (this.state === 'RECOVERING_TRACKING' || this.state === 'IDLE' || this.presence.getState() === HandPresenceState.TEMPORARILY_LOST || this.presence.getState() === HandPresenceState.LOST);
    const palmJump = !!this.primaryRaw && distance(usable[0].landmarks[9], this.primaryRaw) > 0.3;
    const reanchor = returning || palmJump;
    if (reanchor) {
      this.motion.reanchor(usable[0].landmarks[9].x, usable[0].landmarks[9].y, now);
      this.previous = { ...usable[0].landmarks[9] };
      this.anchor = { ...usable[0].landmarks[9] };
      this.pinchClicked = true;
      this.pinchArmed = false;
      this.pinchState = 'OPEN';
      this.pinchTarget = null;
      this.navAccum = 0;
      this.navLocked = false;
    }

    const filtered = usable.map((h, i) => this.filters[i].filter([h.landmarks], now / 1000).filtered[0]);
    const marks = filtered[0];
    const palm = marks[9];
    const pointer = marks[8];
    const motion = this.motion.sample(palm.x, palm.y, now);
    const velocity = { x: motion.velocityX, y: motion.velocityY, z: 0 };
    this.primaryRaw = { ...usable[0].raw[9] };
    this.lastSeen = now;
    if (reanchor || this.handedness === 'UNKNOWN') this.handedness = usable[0].handedness;
    const pose = this.analyzer.analyze(marks);
    const liveTarget = hitTest(pointer.x, pointer.y);
    const pinchRatio = pose.pinchDistance;
    Object.assign(result, {
      raw: usable[0].raw,
      landmarks: marks,
      pointer,
      target: liveTarget,
      pinchDistance: pinchRatio,
      pinchRatio,
      velocity,
      handedness: this.handedness,
      pose: pose.pose,
      openness: pose.openness,
    });
    result.presence = this.presence.update(marks, usable[0].quality, velocity, now) as typeof result.presence;
    if (!this.anchor) this.anchor = { ...palm };
    result.dragDelta = motion.reanchored ? zero() : { x: motion.deltaX, y: motion.deltaY, z: 0 };

    this.debugHands = usable.map((h, i) => ({
      id: h.id,
      state: result.presence.state,
      confidence: h.quality,
      rawX: h.landmarks[9].x,
      rawY: h.landmarks[9].y,
      filteredX: filtered[i][9].x,
      filteredY: filtered[i][9].y,
      velocityX: i === 0 ? motion.velocityX : 0,
      velocityY: i === 0 ? motion.velocityY : 0,
      handedness: h.handedness,
    }));
    result.hands = this.debugHands;

    const twoHands = filtered.length === 2 && (usable[1].quality >= HAND_CONFIG.TRACK_KEEP_CONFIDENCE);
    if (twoHands) {
      const other = filtered[1][9];
      const handDistance = Math.hypot(palm.x - other.x, palm.y - other.y);
      this.zoomDistance = handDistance;
      result.zoomDistance = handDistance;
      if (this.zoomPhase === 'NONE' || this.zoomPhase === 'ZOOM_END') {
        this.zoomPhase = 'TWO_HAND_CANDIDATE';
        this.zoomCandidateAt = now;
        this.zoomPausedAt = 0;
      } else if (this.zoomPhase === 'TWO_HAND_CANDIDATE' && now - this.zoomCandidateAt >= HAND_CONFIG.ZOOM_STABILIZE_MS) {
        this.zoomPhase = 'ZOOM_ACTIVE';
        this.zoomStartDistance = Math.max(handDistance, 0.04);
        this.zoomStartScale = context.scale;
        this.zoomRendered = context.scale;
        this.zoomPausedAt = 0;
      } else if (this.zoomPhase === 'ZOOM_ACTIVE') {
        if (this.zoomPausedAt) {
          this.zoomStartDistance = Math.max(handDistance, 0.04);
          this.zoomStartScale = this.zoomRendered;
          this.zoomPausedAt = 0;
        }
        const ratio = handDistance / Math.max(this.zoomStartDistance, 0.04);
        this.zoomRatio = ratio;
        const desired = Math.abs(ratio - 1) < HAND_CONFIG.ZOOM_DEAD_ZONE
          ? this.zoomRendered
          : clamp(this.zoomStartScale * ratio, HAND_CONFIG.MIN_ZOOM, HAND_CONFIG.MAX_ZOOM);
        this.zoomRendered += (desired - this.zoomRendered) * HAND_CONFIG.ZOOM_SMOOTH;
      }
      if (this.zoomPhase === 'ZOOM_ACTIVE' || this.zoomPhase === 'TWO_HAND_CANDIDATE') {
        result.zoom = this.zoomPhase === 'ZOOM_ACTIVE' ? this.zoomRendered : context.scale;
        result.zoomRatio = this.zoomRatio;
        result.zoomStartDistance = this.zoomStartDistance;
        result.dragDelta = zero();
        result.navStep = 0;
        this.navAccum = 0;
        this.navLocked = true;
        this.state = 'ZOOM';
        this.mode = 'ZOOM';
        this.pinchState = 'OPEN';
        this.pinchTarget = null;
        this.pinchClicked = true;
        this.pinchArmed = false;
        result.state = this.state;
        result.mode = this.mode;
        result.zoomState = this.zoomPhase;
        result.navLocked = this.navLocked;
        this.previous = { ...palm };
        this.pushHistory(now, pointer, liveTarget, usable[0].quality);
        return result;
      }
    } else if (this.zoomPhase === 'ZOOM_ACTIVE' || this.zoomPhase === 'TWO_HAND_CANDIDATE') {
      if (!this.zoomPausedAt) this.zoomPausedAt = now;
      result.zoom = this.zoomRendered;
      result.zoomState = this.zoomPhase;
      this.state = 'ZOOM';
      this.mode = 'ZOOM';
      result.dragDelta = zero();
      result.navStep = 0;
      if (now - this.zoomPausedAt > HAND_CONFIG.ZOOM_LOSS_MS) {
        this.zoomPhase = 'ZOOM_END';
        this.state = 'RELEASE';
        this.mode = 'POINTER';
        this.pinchClicked = true;
        this.pinchArmed = false;
        this.pinchState = 'OPEN';
        this.navLocked = false;
        this.navAccum = 0;
      } else {
        result.state = this.state;
        result.mode = this.mode;
        result.navLocked = this.navLocked;
        this.previous = { ...palm };
        this.pushHistory(now, pointer, liveTarget, usable[0].quality);
        return result;
      }
    }

    // ── PINCH (click on release) ───────────────────────────────────────────
    const released = pinchRatio > HAND_CONFIG.PINCH_RELEASE_RATIO;
    const pinchMove = this.pinchOrigin ? distance(palm, this.pinchOrigin) : 0;
    const wantsPinch = pinchRatio < HAND_CONFIG.PINCH_DOWN_RATIO;

    if (released) {
      if (this.pinchArmed && this.pinchTarget) {
        result.clickTarget = this.pinchTarget;
      }
      this.pinchArmed = false;
      this.pinchState = 'OPEN';
      this.pinchTarget = null;
      this.pinchOrigin = null;
      this.pinchClicked = false;
    } else if (wantsPinch && this.pinchState === 'OPEN' && !this.pinchClicked) {
      this.pinchState = 'PINCH_CANDIDATE';
      this.pinchAt = now;
      this.pinchOrigin = { ...palm };
      this.pinchTarget = liveTarget;
      this.pinchArmed = false;
    } else if (wantsPinch && this.pinchState === 'PINCH_CANDIDATE') {
      if (pinchMove > HAND_CONFIG.PINCH_CANCEL_MOVE) {
        this.pinchState = 'OPEN';
        this.pinchClicked = true;
        this.pinchArmed = false;
        this.pinchTarget = null;
        this.pinchOrigin = null;
      } else if (now - this.pinchAt >= HAND_CONFIG.PINCH_STABLE_MS && pinchMove <= HAND_CONFIG.CLICK_MOVE_THRESHOLD) {
        this.pinchState = 'PINCHED';
        this.pinchArmed = !!this.pinchTarget;
      }
    } else if (this.pinchState === 'PINCHED') {
      this.mode = 'PINCH';
      this.state = 'PINCH_CONFIRMED';
    }

    const pinchActive = this.pinchState === 'PINCH_CANDIDATE' || this.pinchState === 'PINCHED';

    // ── MOVE (parallax + one-card snap) ────────────────────────────────────
    let navStep: NavStep = 0;
    const speed = Math.hypot(velocity.x, velocity.y);
    if (pinchActive) {
      result.dragDelta = zero();
      this.navAccum = 0;
    } else if (context.home) {
      const dx = motion.reanchored ? 0 : motion.deltaX;
      result.dragDelta = { x: dx, y: motion.reanchored ? 0 : motion.deltaY, z: 0 };

      if (this.navLocked) {
        const still = Math.abs(dx) <= HAND_CONFIG.DEAD_ZONE && speed < HAND_CONFIG.NAV_UNLOCK_SPEED;
        if (still) {
          this.navIdleFrames++;
          if (this.navIdleFrames >= HAND_CONFIG.NAV_UNLOCK_FRAMES) {
            this.navLocked = false;
            this.navAccum = 0;
            this.navIdleFrames = 0;
          }
        } else {
          this.navIdleFrames = 0;
        }
      } else {
        this.navIdleFrames = 0;
        this.navAccum += dx;
        if (Math.abs(this.navAccum) >= HAND_CONFIG.NAV_THRESHOLD) {
          navStep = (this.navAccum > 0 ? 1 : -1) as NavStep;
          this.navAccum = 0;
          this.navLocked = true;
          this.navIdleFrames = 0;
        }
      }

      if (Math.abs(dx) > HAND_CONFIG.DEAD_ZONE || Math.abs(this.navAccum) > 0.02) {
        this.state = 'MOVE';
        this.mode = 'MOVE';
      } else if (this.pinchState === 'OPEN') {
        this.state = liveTarget ? 'HOVER' : 'POINT';
        this.mode = liveTarget ? 'HOVER' : 'POINTER';
      }
    } else {
      result.dragDelta = zero();
      this.navAccum = 0;
      if (this.pinchState === 'OPEN') {
        this.state = liveTarget ? 'HOVER' : 'POINT';
        this.mode = liveTarget ? 'HOVER' : 'POINTER';
      }
    }

    if (this.pinchState === 'PINCH_CANDIDATE') {
      this.state = 'PINCH_START';
      this.mode = 'PINCH';
      result.progress = Math.min(1, (now - this.pinchAt) / HAND_CONFIG.PINCH_STABLE_MS);
    } else if (this.pinchState === 'PINCHED') {
      this.state = 'PINCH_CONFIRMED';
      this.mode = 'PINCH';
      result.progress = 1;
    }

    result.navStep = navStep;
    result.navLocked = this.navLocked;
    result.capturedTarget = this.pinchTarget;
    result.pinchState = this.pinchState;
    result.state = this.state;
    result.mode = this.mode;
    this.previous = { ...palm };
    this.pushHistory(now, pointer, this.pinchTarget ?? liveTarget, usable[0].quality);
    return result;
  }

  private pushHistory(now: number, pointer: Landmark, target: string | null, quality: number) {
    this.history.push({ timestamp: now, x: pointer.x, y: pointer.y, state: this.state, target, quality });
    while (this.history.length > 64 || (this.history[0] && now - this.history[0].timestamp > 1200)) this.history.shift();
  }
}
