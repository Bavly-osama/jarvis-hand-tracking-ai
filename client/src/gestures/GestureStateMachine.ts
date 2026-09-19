export enum GestureState {
  IDLE,
  TRACKING,
  HOVER,
  POINTING,
  TAP_READY,
  TAP_PRESSING,
  TAP_RELEASE,
  PINCHING,
  GRABBING,
  SWIPING_LEFT,
  SWIPING_RIGHT,
  ZOOMING,
  ROTATING,
  CONFIRMING,
  CANCELING,
  RECOVERING_TRACKING,
}

// ─── UI Context for priority adjustment ────────────────────────────────────

export type UIContext = 'MAIN_CAROUSEL' | 'EARTH' | 'GAME' | 'DEFAULT';

// ─── Default priority table (higher = wins conflicts) ──────────────────────
const BASE_PRIORITY: Record<GestureState, number> = {
  [GestureState.IDLE]:                0,
  [GestureState.TRACKING]:            1,
  [GestureState.RECOVERING_TRACKING]: 1,
  [GestureState.HOVER]:               2,
  [GestureState.POINTING]:            3,
  [GestureState.TAP_READY]:           4,
  [GestureState.TAP_PRESSING]:        5,
  [GestureState.TAP_RELEASE]:         5,
  [GestureState.SWIPING_LEFT]:        4,
  [GestureState.SWIPING_RIGHT]:       4,
  [GestureState.ROTATING]:            5,
  [GestureState.PINCHING]:            6,
  [GestureState.GRABBING]:            7,
  [GestureState.ZOOMING]:             8,
  [GestureState.CONFIRMING]:          9,
  [GestureState.CANCELING]:           9,
};

// Context-specific priority overrides
const CONTEXT_OVERRIDES: Record<UIContext, Partial<Record<GestureState, number>>> = {
  'MAIN_CAROUSEL': {
    [GestureState.SWIPING_LEFT]:  6,  // Swipe is important
    [GestureState.SWIPING_RIGHT]: 6,
    [GestureState.TAP_PRESSING]:  7,
    [GestureState.TAP_RELEASE]:   7,
  },
  'EARTH': {
    [GestureState.GRABBING]:      8,  // Grab/zoom are important
    [GestureState.ZOOMING]:       9,
    [GestureState.SWIPING_LEFT]:  2,  // Swipe is deprioritized
    [GestureState.SWIPING_RIGHT]: 2,
  },
  'GAME': {
    [GestureState.POINTING]:      6,  // Point/tap are important
    [GestureState.TAP_PRESSING]:  8,
    [GestureState.TAP_RELEASE]:   8,
  },
  'DEFAULT': {},
};

// ─── Which transitions are always allowed regardless of priority ───────────
const FORCED_TARGETS = new Set<GestureState>([
  GestureState.IDLE,
  GestureState.TRACKING,
  GestureState.CANCELING,
  GestureState.RECOVERING_TRACKING,
]);

// ─── Which states block swiping when active ────────────────────────────────
const SWIPE_BLOCKERS = new Set<GestureState>([
  GestureState.PINCHING,
  GestureState.GRABBING,
  GestureState.ZOOMING,
  GestureState.ROTATING,
  GestureState.TAP_PRESSING,
]);

// ─── Incompatible state pairs ──────────────────────────────────────────────
const TAP_STATES = new Set<GestureState>([
  GestureState.TAP_READY,
  GestureState.TAP_PRESSING,
  GestureState.TAP_RELEASE,
]);

type StateChangeCallback = (from: GestureState, to: GestureState) => void;

export class GestureStateMachine {
  private state: GestureState = GestureState.IDLE;
  private context: UIContext = 'DEFAULT';

  // State enter timestamps (for duration tracking)
  private enterTime: number = Date.now();

  // Callbacks
  private onEnterCallbacks: Partial<Record<GestureState, StateChangeCallback[]>> = {};
  private onExitCallbacks:  Partial<Record<GestureState, StateChangeCallback[]>> = {};

  // ── Context ────────────────────────────────────────────────────────────────

  public setContext(context: UIContext): void {
    this.context = context;
  }

  public getContext(): UIContext {
    return this.context;
  }

  private getPriority(state: GestureState): number {
    const override = CONTEXT_OVERRIDES[this.context]?.[state];
    return override ?? BASE_PRIORITY[state];
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  public getState(): GestureState {
    return this.state;
  }

  public getStateName(): string {
    return GestureState[this.state];
  }

  public getStateDuration(): number {
    return Date.now() - this.enterTime;
  }

  public is(state: GestureState): boolean {
    return this.state === state;
  }

  public isInTapSequence(): boolean {
    return TAP_STATES.has(this.state);
  }

  // ── Transition ─────────────────────────────────────────────────────────────

  /**
   * Attempt a state transition.
   * Returns true if transition was accepted.
   */
  public transition(newState: GestureState): boolean {
    if (this.state === newState) return false;

    // Conflict: swipe cannot interrupt high-priority states
    if (
      (newState === GestureState.SWIPING_LEFT || newState === GestureState.SWIPING_RIGHT) &&
      SWIPE_BLOCKERS.has(this.state)
    ) {
      return false;
    }

    // Don't interrupt tap sequence with lower-priority gestures
    if (TAP_STATES.has(this.state) && !TAP_STATES.has(newState) &&
        !FORCED_TARGETS.has(newState) && this.getPriority(newState) <= this.getPriority(this.state)) {
      return false;
    }

    // Forced transitions always pass
    if (FORCED_TARGETS.has(newState)) {
      this._doTransition(newState);
      return true;
    }

    // Priority gating (context-aware)
    if (this.getPriority(newState) >= this.getPriority(this.state)) {
      this._doTransition(newState);
      return true;
    }

    return false;
  }

  /**
   * Force a transition regardless of priority (e.g. tracking loss recovery).
   */
  public forceTransition(newState: GestureState): void {
    this._doTransition(newState);
  }

  // ── Callbacks ──────────────────────────────────────────────────────────────

  public onEnter(state: GestureState, cb: StateChangeCallback): void {
    if (!this.onEnterCallbacks[state]) this.onEnterCallbacks[state] = [];
    this.onEnterCallbacks[state]!.push(cb);
  }

  public onExit(state: GestureState, cb: StateChangeCallback): void {
    if (!this.onExitCallbacks[state]) this.onExitCallbacks[state] = [];
    this.onExitCallbacks[state]!.push(cb);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _doTransition(newState: GestureState): void {
    const old = this.state;

    // Fire exit callbacks
    if (this.onExitCallbacks[old]) {
      for (const cb of this.onExitCallbacks[old]!) cb(old, newState);
    }

    this.state     = newState;
    this.enterTime = Date.now();

    // Fire enter callbacks
    if (this.onEnterCallbacks[newState]) {
      for (const cb of this.onEnterCallbacks[newState]!) cb(old, newState);
    }
  }
}
