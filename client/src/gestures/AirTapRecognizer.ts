import { Landmark } from '../tracking/LandmarkFilter';
import { AirTapEvent } from '../tracking/NormalizedHandState';
import { HandMotionHistory } from '../tracking/HandMotionHistory';

export class AirTapRecognizer {
  private state: 'IDLE' | 'READY' | 'PRESS' | 'CONTACT' | 'RELEASE' | 'COOLDOWN' = 'IDLE';
  private tapId: number = 0;
  private tapConsumed: boolean = false;
  private releaseRequired: boolean = false;
  private stateEnterTime: number = 0;
  private lastZ: number | null = null;
  private initialZ: number | null = null;
  
  private confidence: number = 0;
  private progress: number = 0;
  
  update(
    indexTip: Landmark,
    indexDip: Landmark,
    indexMcp: Landmark,
    wrist: Landmark,
    palmCenter: Landmark,
    velocity: { x: number, y: number, z: number },
    fingerCurl: number,
    isIndexExtended: boolean,
    targetId: string | null,
    history: HandMotionHistory,
    nowMs: number
  ): { state: string; confidence: number; event: AirTapEvent | null; progress: number } {
    
    let event: AirTapEvent | null = null;
    let depthMotion = 0;
    
    if (this.lastZ === null) {
      this.lastZ = indexTip.z;
    }
    const dz = indexTip.z - this.lastZ;
    this.lastZ = indexTip.z;

    const timeInState = nowMs - this.stateEnterTime;

    switch (this.state) {
      case 'IDLE':
        if (isIndexExtended && targetId !== null) {
          this.transition('READY', nowMs);
          this.initialZ = indexTip.z;
        }
        break;

      case 'READY':
        if (!isIndexExtended || targetId === null) {
          this.transition('IDLE', nowMs);
        } else if (timeInState > 150) {
          if (velocity.z < -0.05 || fingerCurl > 0.1) {
             this.transition('PRESS', nowMs);
          }
        }
        break;

      case 'PRESS':
        if (!isIndexExtended) {
          this.transition('IDLE', nowMs);
        } else {
          const zDisplacement = this.initialZ !== null ? this.initialZ - indexTip.z : 0;
          this.progress = Math.min(1.0, Math.max(0, zDisplacement / 0.05));
          depthMotion = Math.min(1.0, Math.max(0, zDisplacement / 0.04));
          
          if (zDisplacement > 0.04 || fingerCurl > 0.3) {
            this.transition('CONTACT', nowMs);
            if (!this.tapConsumed && !this.releaseRequired) {
              this.tapId++;
              const temporalPattern = 1.0;
              const targetStability = targetId ? 1.0 : 0.0;
              const fingerPose = isIndexExtended ? 1.0 : 0.0;
              const velocityPattern = Math.min(1, Math.abs(velocity.z) * 5);
              this.confidence = 0.30 * depthMotion + 0.25 * temporalPattern + 0.20 * targetStability + 0.15 * fingerPose + 0.10 * velocityPattern;

              event = {
                tapId: `tap_${this.tapId}`,
                targetId: targetId || '',
                timestamp: nowMs,
                position: { x: indexTip.x, y: indexTip.y },
                confidence: this.confidence,
              };
              this.tapConsumed = true;
              this.releaseRequired = true;
            }
          }
        }
        break;

      case 'CONTACT':
        if (dz > 0.02 || fingerCurl < 0.2 || timeInState > 300) {
          this.transition('RELEASE', nowMs);
        }
        break;

      case 'RELEASE':
        this.progress = 0;
        this.transition('COOLDOWN', nowMs);
        break;

      case 'COOLDOWN':
        if (timeInState > 300) {
          this.releaseRequired = false;
          this.tapConsumed = false;
          this.transition('IDLE', nowMs);
        }
        break;
    }
    
    let temporalPattern = 1.0;
    let targetStability = targetId ? 1.0 : 0.0;
    let fingerPose = isIndexExtended ? 1.0 : 0.0;
    let velocityPattern = Math.min(1, Math.abs(velocity.z) * 5);
    
    this.confidence = 0.30 * depthMotion + 0.25 * temporalPattern + 0.20 * targetStability + 0.15 * fingerPose + 0.10 * velocityPattern;
    
    return {
      state: this.state,
      confidence: this.confidence,
      event,
      progress: this.progress
    };
  }
  
  private transition(newState: 'IDLE' | 'READY' | 'PRESS' | 'CONTACT' | 'RELEASE' | 'COOLDOWN', nowMs: number) {
    this.state = newState;
    this.stateEnterTime = nowMs;
  }
  
  reset(): void {
    this.state = 'IDLE';
    this.tapId = 0;
    this.tapConsumed = false;
    this.releaseRequired = false;
    this.lastZ = null;
    this.initialZ = null;
    this.confidence = 0;
    this.progress = 0;
  }
  
  getState(): string {
    return this.state;
  }
}
