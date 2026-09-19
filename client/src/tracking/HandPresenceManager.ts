import type { Landmark } from './LandmarkFilter';
import { HandPresenceState } from './NormalizedHandState';
export class HandPresenceManager {
  private marks: Landmark[] | null = null;
  private seen = -Infinity;
  private missing = true;
  private velocity = {x:0,y:0,z:0};
  private confidence = 0;
  private state = HandPresenceState.HAND_LOST;
  private opacity = 0;
  constructor(private config = {activateConfidence:.65,deactivateConfidence:.45,holdLastMs:150,predictMs:400,fadeMs:700}) {}
  update(landmarks: Landmark[] | null, confidence: number, velocity: Landmark, nowMs: number) {
    const threshold = this.state === HandPresenceState.HAND_LOST ? this.config.activateConfidence : this.config.deactivateConfidence;
    if (landmarks?.length === 21 && Number.isFinite(confidence) && confidence >= threshold) {
      const shouldResetVelocity = this.missing || nowMs-this.seen>150;
      this.marks = landmarks.map(p=>({...p}));this.seen = nowMs; this.missing = false; this.confidence=confidence;
      this.velocity = shouldResetVelocity ? {x:0,y:0,z:0} : velocity;
      this.state = confidence>=this.config.activateConfidence ? HandPresenceState.HAND_VISIBLE : HandPresenceState.HAND_WEAK;
      this.opacity = confidence>=this.config.activateConfidence ? 1 : .7;
      return {state:this.state,landmarks:this.marks,opacity:this.opacity,shouldResetVelocity};
    }
    this.missing=true;return this.sample(nowMs);
  }
  /** Render-only prediction, never used to recognize actions. */
  sample(nowMs: number) {
    const age = nowMs-this.seen;
    if (!this.marks || age>=this.config.fadeMs) {
      this.state=HandPresenceState.HAND_LOST;this.opacity=0;
      return {state:this.state,landmarks:null,opacity:0,shouldResetVelocity:true};
    }
    this.state=age<=65 ? this.state : age<this.config.holdLastMs ? HandPresenceState.HAND_WEAK : HandPresenceState.HAND_PREDICTED;
    this.opacity=age<this.config.predictMs ? (age<65?this.opacity:.7) : .7*Math.max(0,1-(age-this.config.predictMs)/(this.config.fadeMs-this.config.predictMs));
    const dt=Math.max(0,Math.min(age-this.config.holdLastMs,60))/1000;
    const clamp=(v:number)=>Math.max(-.025,Math.min(.025,v));
    const landmarks=this.marks.map(p=>({...p,x:p.x+clamp(this.velocity.x*dt),y:p.y+clamp(this.velocity.y*dt)}));
    return {state:this.state,landmarks,opacity:this.opacity,shouldResetVelocity:false};
  }
  getState(){return this.state;}
  getOpacity(){return this.opacity;}
  getLastConfidence(){return this.confidence;}
  isTracking(){return this.state!==HandPresenceState.HAND_LOST;}
  reset(){this.marks=null;this.seen=-Infinity;this.missing=true;this.state=HandPresenceState.HAND_LOST;this.opacity=0;this.confidence=0;}
}
