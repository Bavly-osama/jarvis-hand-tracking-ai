export interface TapSample {
  timestamp:number;target:string|null;pointing:boolean;palmSize:number;
  depth:number;curl:number;projectedLength:number;palmSpeed:number;
}
/** Secondary selection gesture: depth alone can never trigger an action. */
export class AirTapRecognizer {
  private state:'IDLE'|'READY'|'PRESS'|'CONTACT'|'RELEASE'='IDLE';
  private baseline:TapSample|null=null;
  private started=0;
  private peak=0;
  private id=0;
  reset(){this.state='IDLE';this.baseline=null;this.peak=0;}
  sample(s:TapSample){
    let event=false,progress=0,confidence=0;
    if(!s.target||!s.pointing||s.palmSpeed>.45||(this.baseline&&s.target!==this.baseline.target)){this.reset();return {state:this.state,event,progress,confidence,tapId:this.id};}
    if(!this.baseline){this.baseline={...s};this.started=s.timestamp;this.state='READY';}
    const b=this.baseline,age=s.timestamp-this.started;
    const depth=(b.depth-s.depth)/Math.max(.04,s.palmSize);
    const curl=Math.max(0,s.curl-b.curl);
    const geometry=Math.max(0,(b.projectedLength-s.projectedLength)/Math.max(.04,s.palmSize));
    const shape=Math.max(curl/.28,geometry/.15);
    confidence=.3*Math.min(1,depth/.2)+.25*(age>=150?1:0)+.2+.15*Math.min(1,shape)+.1*(s.palmSpeed<.25?1:0);
    if(this.state==='READY'&&age>=150&&depth>.035&&shape>.15){this.state='PRESS';this.started=s.timestamp;}
    if(this.state==='PRESS'){
      progress=Math.max(0,Math.min(1,depth/.2));
      if(depth>.16&&shape>.65&&confidence>=.8){this.state='CONTACT';this.peak=depth;}
      else if(age>900)this.reset();
    }else if(this.state==='CONTACT'){
      this.peak=Math.max(this.peak,depth);progress=1;
      if(this.peak-depth>.08&&depth<.12&&shape<.65){event=true;this.id++;this.state='RELEASE';this.started=s.timestamp;}
      else if(age>900)this.reset();
    }else if(this.state==='RELEASE'&&age>250&&Math.abs(depth)<.04&&shape<.2){this.reset();}
    return {state:this.state,event,progress,confidence,tapId:this.id};
  }
}
