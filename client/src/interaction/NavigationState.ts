/** Discrete selection is authoritative; angles are only a rendering concern. */
export class NavigationState {
  index = 0;
  isAnimating = false;
  gestureConsumed = false;
  private neutralTime = 0;
  constructor(public readonly count: number) {}
  swipe(velocity: number): boolean {
    if (!Number.isFinite(velocity) || Math.abs(velocity) < 0.005 || this.gestureConsumed) return false;
    if (!this.step(velocity < 0 ? 1 : -1)) return false;
    this.gestureConsumed = true;
    this.neutralTime = 0;
    return true;
  }
  step(direction: number): boolean { return this.select(this.index + Math.sign(direction)); }
  select(index: number): boolean {
    if (this.isAnimating || !Number.isFinite(index)) return false;
    const next = ((Math.trunc(index) % this.count) + this.count) % this.count;
    if (next === this.index) return false;
    this.index = next;
    this.isAnimating = true;
    return true;
  }
  completeTransition() { this.isAnimating = false; this.neutralTime = 0; }
  observeNeutral(neutral: boolean, dt: number) {
    if (!neutral || this.isAnimating) { this.neutralTime = 0; return; }
    this.neutralTime += Math.min(Math.max(dt, 0), 0.05);
    if (this.neutralTime >= 0.18) this.gestureConsumed = false;
  }
  requireNeutral() { this.gestureConsumed = true; this.neutralTime = 0; }
  /** Pointer-up is a concrete end of a drag, unlike a camera timeout. */
  releasePointer() { this.gestureConsumed = false; this.neutralTime = 0; }
}

export type UIState = 'MAIN_CAROUSEL' | 'CARD_FOCUSED' | 'CARD_OPENING' | 'EXPERIENCE_ACTIVE' | 'EXPERIENCE_CLOSING' | 'RETURNING_HOME';
export class ExperienceState {
  state: UIState = 'MAIN_CAROUSEL';
  index = 0;
  get canNavigate() { return this.state === 'MAIN_CAROUSEL' || this.state === 'CARD_FOCUSED'; }
  open(index: number) {
    if (!this.canNavigate) return false;
    this.index = index; this.state = 'CARD_OPENING'; return true;
  }
  enter() { if (this.state === 'CARD_OPENING') this.state = 'EXPERIENCE_ACTIVE'; }
  close() {
    if (this.state !== 'EXPERIENCE_ACTIVE' && this.state !== 'CARD_OPENING') return false;
    this.state = 'EXPERIENCE_CLOSING'; return true;
  }
  home() { if (this.state === 'EXPERIENCE_CLOSING' || this.state === 'RETURNING_HOME') this.state = 'MAIN_CAROUSEL'; }
}
