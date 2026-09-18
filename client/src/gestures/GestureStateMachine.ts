export enum GestureState {
  IDLE,
  TRACKING,
  HOVER,
  POINTING,
  PINCHING,
  GRABBING,
  SWIPING_LEFT,
  SWIPING_RIGHT,
  ZOOMING,
  ROTATING,
  CONFIRMING,
  CANCELING,
}

// ─── Priority table (higher = wins conflicts) ─────────────────────────────
const PRIORITY: Record<GestureState, number> = {
  [GestureState.IDLE]:          0,
  [GestureState.TRACKING]:      1,
  [GestureState.HOVER]:         2,
  [GestureState.POINTING]:      3,
  [GestureState.SWIPING_LEFT]:  4,
  [GestureState.SWIPING_RIGHT]: 4,
  [GestureState.ROTATING]:      5,
  [GestureState.PINCHING]:      6,
  [GestureState.GRABBING]:      7,
  [GestureState.ZOOMING]:       8,
  [GestureState.CONFIRMING]:    9,
  [GestureState.CANCELING]:     9,
};

// ─── Which transitions are always allowed regardless of priority ───────────
const FORCED_TARGETS = new Set<GestureState>([
  GestureState.IDLE,
  GestureState.TRACKING,
  GestureState.CANCELING,
]);

// ─── Which states block swiping when active ────────────────────────────────
const SWIPE_BLOCKERS = new Set<GestureState>([
  GestureState.PINCHING,
  GestureState.GRABBING,
  GestureState.ZOOMING,
  GestureState.ROTATING,
]);

type StateChangeCallback = (from: GestureState, to: GestureState) => void;

export class GestureStateMachine {
  private state: GestureState = GestureState.IDLE;

  // State enter timestamps (for duration tracking)
  private enterTime: number = Date.now();

  // Callbacks
  private onEnterCallbacks: Partial<Record<GestureState, StateChangeCallback[]>> = {};
  private onExitCallbacks:  Partial<Record<GestureState, StateChangeCallback[]>> = {};

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

    // Forced transitions always pass
    if (FORCED_TARGETS.has(newState)) {
      this._doTransition(newState);
      return true;
    }

    // Priority gating
    if (PRIORITY[newState] >= PRIORITY[this.state]) {
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
