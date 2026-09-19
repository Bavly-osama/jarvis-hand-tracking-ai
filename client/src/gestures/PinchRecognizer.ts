import { Landmark } from '../tracking/LandmarkFilter';

export class PinchRecognizer {
  private isPinchingState: boolean = false;
  private lastPinchTime: number = 0;
  private pinchMidpoint: Landmark = { x: 0, y: 0, z: 0 };
  
  update(
    thumbTip: Landmark,
    indexTip: Landmark,
    handSize: number,
    nowMs: number
  ): { isPinching: boolean; pinchEdge: 'start' | 'hold' | 'release' | 'none'; pinchDistance: number; pinchMidpoint: Landmark } {
    
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = thumbTip.z - indexTip.z;
    const rawDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    const normalizedDistance = rawDistance / (handSize || 1);
    
    let pinchEdge: 'start' | 'hold' | 'release' | 'none' = 'none';
    const timeSinceLastPinch = nowMs - this.lastPinchTime;
    
    if (this.isPinchingState) {
      if (normalizedDistance >= 0.22) {
        this.isPinchingState = false;
        pinchEdge = 'release';
        this.lastPinchTime = nowMs;
      } else {
        pinchEdge = 'hold';
      }
    } else {
      if (normalizedDistance < 0.16 && timeSinceLastPinch > 220) {
        this.isPinchingState = true;
        pinchEdge = 'start';
      }
    }
    
    this.pinchMidpoint = {
      x: (thumbTip.x + indexTip.x) / 2,
      y: (thumbTip.y + indexTip.y) / 2,
      z: (thumbTip.z + indexTip.z) / 2,
    };
    
    return {
      isPinching: this.isPinchingState,
      pinchEdge,
      pinchDistance: normalizedDistance,
      pinchMidpoint: this.pinchMidpoint
    };
  }
  
  reset(): void {
    this.isPinchingState = false;
    this.lastPinchTime = 0;
    this.pinchMidpoint = { x: 0, y: 0, z: 0 };
  }
}
