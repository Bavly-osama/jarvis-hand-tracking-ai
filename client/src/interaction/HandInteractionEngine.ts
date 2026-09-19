import type { Landmark } from '../tracking/LandmarkFilter';
import { HandCoordinateNormalizer } from '../tracking/HandCoordinateNormalizer';
import { AdaptiveLandmarkFilter } from '../tracking/AdaptiveLandmarkFilter';
import { HandPresenceManager } from '../tracking/HandPresenceManager';
import { HandPoseAnalyzer } from '../gestures/HandPoseAnalyzer';
import { AirTapRecognizer } from '../gestures/AirTapRecognizer';

export const HAND_CONFIG = {
  DEAD_ZONE:.005, GESTURE_ACTIVATION_DISTANCE:.018,
  PINCH_ON_THRESHOLD:.23, PINCH_OFF_THRESHOLD:.38,
  CLICK_CONFIRM_MS:180, MIN_SCALE:.7, MAX_SCALE:2.5,
  ACTION_CONFIDENCE:.65, END_LOSS_MS:180,
};
export type HandFrame = {timestamp:number; space:'camera'|'logical'; hands:{landmarks:Landmark[];handedness:string;quality?:number}[]};
export type HandContext = {id:string;home:boolean;scale:number};
export type HandGesture = 'IDLE'|'HOVER'|'POINT'|'PINCH_START'|'PINCH_CONFIRMED'|'RELEASE'|'DRAG'|'ZOOM'|'RECOVERING_TRACKING';
const distance=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const zero=()=>({x:0,y:0,z:0});

/** Sole owner of camera gesture decisions. Fixtures use this production path. */
export class HandInteractionEngine {
  readonly normalizer=new HandCoordinateNormalizer();
  readonly presence=new HandPresenceManager();
  readonly history:{timestamp:number;x:number;y:number;state:HandGesture;target:string|null;quality:number}[]=[];
  private filters=[new AdaptiveLandmarkFilter(1),new AdaptiveLandmarkFilter(1)];
  private analyzer=new HandPoseAnalyzer();
  private airTap=new AirTapRecognizer();
  state:HandGesture='IDLE';
  private previous:Landmark|null=null;
  private anchor:Landmark|null=null;
  private primaryRaw:Landmark|null=null;
  private lastSeen=-Infinity;
  private lastTime=-Infinity;
  private gap=true;
  private pinched=false;
  private releaseRequired=false;
  private pinchAt=0;
  private pinchTarget:string|null=null;
  private pinchOrigin:Landmark|null=null;
  private zoomBase:number|null=null;
  private zoomScale=1;
  private context='';
  private stillSince=0;
  private handedness='UNKNOWN';
  private lastCount=0;

  reset() {
    this.airTap.reset();
    this.filters.forEach(f=>f.reset());this.presence.reset();this.history.length=0;
    this.state='IDLE';this.previous=this.anchor=this.primaryRaw=null;this.gap=true;
    this.lastSeen=this.lastTime=-Infinity;this.pinched=false;this.releaseRequired=true;
    this.zoomBase=null;this.pinchTarget=null;this.context='';this.lastCount=0;
  }

  process(frame:HandFrame,hitTest:(x:number,y:number)=>string|null,context:HandContext) {
    const now=frame.timestamp;
    const wasDragging=this.state==='DRAG';
    const result={state:this.state,pointer:null as Landmark|null,raw:null as Landmark[]|null,
      landmarks:null as Landmark[]|null,presence:this.presence.sample(now),target:null as string|null,
      clickTarget:null as string|null,dragDelta:zero(),dragStart:false,dragEnd:false,zoom:null as number|null,
      pinchDistance:1,progress:0,velocity:zero(),quality:0,handedness:this.handedness,handCount:0,pose:'UNKNOWN',openness:0};
    if(!Number.isFinite(now)||now<=this.lastTime)return result;
    this.lastTime=now;
    if(this.context && this.context!==context.id){this.state='IDLE';this.anchor=this.previous=null;this.zoomBase=null;this.releaseRequired=true;this.pinchTarget=null;result.dragEnd=wasDragging;}
    this.context=context.id;
    const valid=frame.hands.slice(0,2).filter(h=>h.landmarks.length===21&&h.landmarks.every(p=>[p.x,p.y,p.z].every(Number.isFinite))&&distance(h.landmarks[0],h.landmarks[9])>.015)
      .map(h=>({...h,landmarks:this.normalizer.landmarks(h.landmarks,frame.space)}));
    // Match spatial continuity rather than array order or fluctuating handedness.
    if(this.primaryRaw && valid.length===2 && distance(valid[1].landmarks[9],this.primaryRaw)<distance(valid[0].landmarks[9],this.primaryRaw))valid.reverse();
    const quality=valid[0]?.quality??(valid.length?1:0);result.quality=quality;result.handCount=valid.length;
    if(!valid.length || quality<HAND_CONFIG.ACTION_CONFIDENCE || !Number.isFinite(quality)) {
      this.gap=true;this.releaseRequired=true;this.pinchTarget=null;
      if(now-this.lastSeen>150)this.airTap.reset();
      result.presence=this.presence.update(null,0,zero(),now);
      if(valid.length&&quality>=.45&&quality<.65){
        const pose=this.analyzer.analyze(valid[0].landmarks);
        result.target=hitTest(valid[0].landmarks[8].x,valid[0].landmarks[8].y);
        result.pose=pose.pose;result.pinchDistance=pose.pinchDistance;
      }
      if(now-this.lastSeen>HAND_CONFIG.END_LOSS_MS){result.dragEnd=wasDragging;this.state='RECOVERING_TRACKING';this.zoomBase=null;this.anchor=this.previous=null;}
      if(result.presence.state==='HAND_LOST')this.state='IDLE';
      result.state=this.state;return result;
    }
    const changedHand=!!this.primaryRaw && distance(valid[0].landmarks[9],this.primaryRaw)>.3;
    const reanchor=this.gap||changedHand||now-this.lastSeen>150||valid.length!==this.lastCount;
    if(reanchor){this.filters.forEach(f=>f.reset());this.previous=this.anchor=null;this.zoomBase=null;this.pinchTarget=null;if(changedHand)this.releaseRequired=true;}
    const raw=valid[0].landmarks;
    const filtered=valid.map((h,i)=>this.filters[i].filter([h.landmarks],now/1000).filtered[0]);
    const marks=filtered[0],palm=marks[9],pointer=marks[8];
    const dt=Math.max(.001,(now-this.lastSeen)/1000);
    const velocity=this.previous&&!reanchor?{x:(palm.x-this.previous.x)/dt,y:(palm.y-this.previous.y)/dt,z:(palm.z-this.previous.z)/dt}:zero();
    this.primaryRaw={...raw[9]};this.lastSeen=now;this.gap=false;this.lastCount=valid.length;
    if(reanchor||this.handedness==='UNKNOWN')this.handedness=this.normalizer.handedness(valid[0].handedness,frame.space);
    const pose=this.analyzer.analyze(marks);
    const target=hitTest(pointer.x,pointer.y);
    const pinch=pose.pinchDistance;
    Object.assign(result,{raw,landmarks:marks,pointer,target,pinchDistance:pinch,velocity,handedness:this.handedness,pose:pose.pose,openness:pose.openness});
    result.presence=this.presence.update(marks,quality,velocity,now);
    if(!this.anchor)this.anchor={...palm};
    if(filtered.length===2 && (valid[1].quality??1)>=HAND_CONFIG.ACTION_CONFIDENCE) {
      const d=Math.hypot(palm.x-filtered[1][9].x,palm.y-filtered[1][9].y);
      if(this.zoomBase===null){this.zoomBase=Math.max(d,.04);this.zoomScale=context.scale;}
      result.zoom=Math.max(HAND_CONFIG.MIN_SCALE,Math.min(HAND_CONFIG.MAX_SCALE,this.zoomScale*d/this.zoomBase));
      result.dragEnd=wasDragging;this.state='ZOOM';this.releaseRequired=true;this.pinchTarget=null;
    } else {
      if(this.state==='ZOOM'){this.state='RELEASE';this.releaseRequired=true;this.anchor={...palm};}
      this.zoomBase=null;
      const starts=!this.pinched&&pinch<HAND_CONFIG.PINCH_ON_THRESHOLD;
      const releases=pinch>HAND_CONFIG.PINCH_OFF_THRESHOLD;
      if(releases){this.pinched=false;this.releaseRequired=false;this.pinchTarget=null;}
      if(starts){this.pinched=true;this.pinchAt=now;this.pinchOrigin={...palm};this.pinchTarget=target;}
      const displacement=distance(palm,this.anchor);
      const pinchMove=this.pinchOrigin?distance(palm,this.pinchOrigin):0;
      const canPush=context.home && pose.openness>.6 && !pose.fingers.slice(2).every(f=>!f.extended);
      const canGrab=!pose.fingers[1].extended&&pose.fingers.slice(1).filter(f=>!f.extended).length>=3;
      const dragIntent=(canPush||canGrab||this.pinched)&&displacement>HAND_CONFIG.GESTURE_ACTIVATION_DISTANCE;
      if(this.state==='DRAG'||dragIntent||(this.pinched&&pinchMove>HAND_CONFIG.GESTURE_ACTIVATION_DISTANCE)) {
        if(!wasDragging){result.dragStart=true;this.stillSince=now;}
        this.state='DRAG';this.releaseRequired=true;this.pinchTarget=null;
        if(!reanchor && this.previous)result.dragDelta={x:palm.x-this.previous.x,y:palm.y-this.previous.y,z:0};
        if(Math.hypot(velocity.x,velocity.y)>.06)this.stillSince=now;
        if((!canPush&&!canGrab&&!this.pinched)||now-this.stillSince>180){this.state='RELEASE';result.dragEnd=true;this.anchor={...palm};}
      } else if(this.pinched && !this.releaseRequired) {
        this.state='PINCH_START';
        if(target!==this.pinchTarget)this.releaseRequired=true;
        result.progress=Math.min(1,(now-this.pinchAt)/HAND_CONFIG.CLICK_CONFIRM_MS);
        if(target && !this.releaseRequired && now-this.pinchAt>=HAND_CONFIG.CLICK_CONFIRM_MS){result.clickTarget=target;this.state='PINCH_CONFIRMED';this.releaseRequired=true;}
      } else if(this.pinched) {this.state='PINCH_CONFIRMED';}
      else {this.state=target?'HOVER':'POINT';}
    }
    if(!this.pinched && (this.state==='POINT'||this.state==='HOVER')){
      const tap=this.airTap.sample({timestamp:now,target,pointing:pose.fingers[1].extended&&!pose.fingers[2].extended,
        palmSize:pose.handSize,depth:marks[8].z-marks[5].z,curl:pose.fingerCurls[1],
        projectedLength:Math.hypot(marks[8].x-marks[5].x,marks[8].y-marks[5].y),palmSpeed:Math.hypot(velocity.x,velocity.y)});
      result.progress=tap.progress;
      if(tap.event)result.clickTarget=target;
    }else this.airTap.reset();
    this.previous={...palm};result.state=this.state;
    this.history.push({timestamp:now,x:pointer.x,y:pointer.y,state:this.state,target,quality});
    while(this.history.length>64 || (this.history[0]&&now-this.history[0].timestamp>1200))this.history.shift();
    return result;
  }
}
