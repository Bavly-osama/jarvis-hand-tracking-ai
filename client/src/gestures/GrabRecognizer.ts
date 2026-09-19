import { HandMotionHistory } from '../tracking/HandMotionHistory';

export class GrabRecognizer {
  private isGrabbingState: boolean = false;
  private grabConfidence: number = 0;
  
  update(
    fingerCurls: number[],
    targetDistance: number | null,
    history: HandMotionHistory,
    nowMs: number
  ): { isGrabbing: boolean; grabConfidence: number; grabEdge: 'start' | 'hold' | 'release' | 'none' } {
    
    let totalCurl = 0;
    for (const curl of fingerCurls) {
      totalCurl += curl;
    }
    const avgCurl = fingerCurls.length > 0 ? totalCurl / fingerCurls.length : 0;
    
    this.grabConfidence = Math.min(1.0, Math.max(0.0, avgCurl));
    
    let grabEdge: 'start' | 'hold' | 'release' | 'none' = 'none';
    
    if (this.isGrabbingState) {
      if (this.grabConfidence < 0.45) {
        this.isGrabbingState = false;
        grabEdge = 'release';
      } else {
        grabEdge = 'hold';
      }
    } else {
      if (this.grabConfidence >= 0.75) {
        this.isGrabbingState = true;
        grabEdge = 'start';
      }
    }
    
    return {
      isGrabbing: this.isGrabbingState,
      grabConfidence: this.grabConfidence,
      grabEdge
    };
  }
  
  reset(): void {
    this.isGrabbingState = false;
    this.grabConfidence = 0;
  }
}
