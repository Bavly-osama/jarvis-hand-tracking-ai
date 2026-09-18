import { GestureState } from './GestureStateMachine';

export enum GestureTransitionReason {
  ENTER  = 'ENTER',
  HOLD   = 'HOLD',
  EXIT   = 'EXIT',
  FORCED = 'FORCED',
}

export interface ConfidenceData {
  gesture:   GestureState;
  gesture_name: string;
  confidence: number;
  velocity:   number;
  duration:   number;
  hand:       string;
  timestamp:  number;
}

interface GestureRecord {
  data:      ConfidenceData;
  startTime: number;
  entered:   boolean;   // has fired ENTER event
  smoothed:  number;    // EMA-smoothed confidence
}

// ─── Thresholds ────────────────────────────────────────────────────────────

const THRESHOLDS: Record<number, { enter: number; exit: number }> = {
  // IDLE / TRACKING — very low bar
  [GestureState.IDLE]:          { enter: 0.01, exit: 0.0 },
  [GestureState.TRACKING]:      { enter: 0.30, exit: 0.15 },
  // Active gestures
  [GestureState.HOVER]:         { enter: 0.70, exit: 0.50 },
  [GestureState.POINTING]:      { enter: 0.75, exit: 0.55 },
  [GestureState.PINCHING]:      { enter: 0.82, exit: 0.60 },
  [GestureState.GRABBING]:      { enter: 0.78, exit: 0.55 },
  [GestureState.SWIPING_LEFT]:  { enter: 0.72, exit: 0.45 },
  [GestureState.SWIPING_RIGHT]: { enter: 0.72, exit: 0.45 },
  [GestureState.ZOOMING]:       { enter: 0.80, exit: 0.55 },
  [GestureState.ROTATING]:      { enter: 0.75, exit: 0.50 },
  [GestureState.CONFIRMING]:    { enter: 0.88, exit: 0.70 },
  [GestureState.CANCELING]:     { enter: 0.85, exit: 0.65 },
};

// AI ambiguity band: gestures in this confidence range are sent to Gemini
const AI_MIN = 0.45;
const AI_MAX = 0.75;

// EMA alpha for confidence smoothing (higher = faster, lower = more stable)
const EMA_ALPHA = 0.25;

// ─── GestureConfidenceEngine ────────────────────────────────────────────────

export class GestureConfidenceEngine {
  private records: Map<GestureState, GestureRecord> = new Map();

  /**
   * Feed a raw confidence reading for a gesture state.
   * Returns ConfidenceData if the gesture is currently "confirmed" (above enter threshold),
   * or null if it failed thresholds.
   */
  public update(
    gesture:      GestureState,
    rawConfidence: number,
    velocity:     number,
    timestamp:    number,
    hand:         string = 'RIGHT'
  ): ConfidenceData | null {
    let record = this.records.get(gesture);

    if (!record) {
      record = {
        data: {
          gesture,
          gesture_name: GestureState[gesture],
          confidence:   rawConfidence,
          velocity,
          duration:     0,
          hand,
          timestamp
        },
        startTime: timestamp,
        entered:   false,
        smoothed:  rawConfidence
      };
      this.records.set(gesture, record);
    }

    // Exponential moving average smoothing
    record.smoothed = EMA_ALPHA * rawConfidence + (1 - EMA_ALPHA) * record.smoothed;

    const thresh = THRESHOLDS[gesture] ?? { enter: 0.80, exit: 0.60 };

    // Update data fields
    record.data.confidence = record.smoothed;
    record.data.velocity   = velocity;
    record.data.duration   = timestamp - record.startTime;
    record.data.hand       = hand;
    record.data.timestamp  = timestamp;

    if (!record.entered) {
      // Hysteresis: need to cross ENTER threshold
      if (record.smoothed >= thresh.enter) {
        record.entered = true;
        return record.data;
      }
      return null;
    } else {
      // Already entered: check if we drop below EXIT threshold
      if (record.smoothed < thresh.exit) {
        this.records.delete(gesture);
        return null;
      }
      return record.data;
    }
  }

  /**
   * Gestures currently above their enter threshold — send to interaction engine.
   */
  public getConfirmed(): ConfidenceData[] {
    return [...this.records.values()]
      .filter(r => r.entered && r.smoothed >= (THRESHOLDS[r.data.gesture]?.enter ?? 0.80))
      .map(r => r.data);
  }

  /**
   * Gestures in the AI ambiguity band — send context to Gemini.
   */
  public getAmbiguous(): ConfidenceData[] {
    return [...this.records.values()]
      .filter(r => r.smoothed >= AI_MIN && r.smoothed <= AI_MAX && !r.entered)
      .map(r => r.data);
  }

  /**
   * Hard-reset all gesture tracking (e.g. on tracking loss).
   */
  public reset() {
    this.records.clear();
  }

  /**
   * Partial reset — remove a single gesture (e.g. pinch released).
   */
  public clearGesture(gesture: GestureState) {
    this.records.delete(gesture);
  }

  /** Debug snapshot */
  public getSnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [state, rec] of this.records) {
      out[GestureState[state]] = parseFloat(rec.smoothed.toFixed(3));
    }
    return out;
  }
}
