import { HandMotionHistory } from '../tracking/HandMotionHistory';

export class SwipeRecognizer {
  private consumed: boolean = false;
  private neutralDuration: number = 0;
  
  update(
    velocity: { x: number, y: number, z: number },
    smoothedVelocity: { x: number, y: number, z: number },
    isHandOpen: boolean,
    isFist: boolean,
    history: HandMotionHistory,
    nowMs: number
  ): { isSwipe: boolean; direction: 'left' | 'right' | null; velocity: number; consumed: boolean } {
    
    let isSwipe = false;
    let direction: 'left' | 'right' | null = null;
    let swipeVelocity = 0;
    
    if (this.consumed) {
      return { isSwipe: false, direction: null, velocity: 0, consumed: true };
    }
    
    const isSwipeHorizontal = Math.abs(smoothedVelocity.x) > 1.3 * Math.abs(smoothedVelocity.y);
    const speed = Math.abs(smoothedVelocity.x);
    
    if (isSwipeHorizontal && speed > 0.25 && isHandOpen && !isFist) {
      isSwipe = true;
      swipeVelocity = smoothedVelocity.x;
      direction = swipeVelocity > 0 ? 'right' : 'left';
      this.consumed = true;
    }
    
    return {
      isSwipe,
      direction,
      velocity: swipeVelocity,
      consumed: this.consumed
    };
  }
  
  observeNeutral(speed: number, dt: number): void {
    if (speed < 0.08) {
      this.neutralDuration += dt;
      if (this.neutralDuration > 150) {
        this.consumed = false;
      }
    } else {
      this.neutralDuration = 0;
    }
  }
  
  reset(): void {
    this.consumed = false;
    this.neutralDuration = 0;
  }
}
