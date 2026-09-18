export class OrbitGame {
  targets = Array.from({length:12},()=>({active:false,x:0,y:0,radius:3,angle:0}));
  score=0; combo=0; integrity=100; remaining=60; over=false;
  private spawn=0; private sequence=0;
  reset(){this.score=0;this.combo=0;this.integrity=100;this.remaining=60;this.over=false;this.spawn=0;this.sequence=0;this.targets.forEach(t=>t.active=false);}
  update(dt:number){
    if(this.over)return;
    dt=Math.max(0,Math.min(dt,1));this.remaining=Math.max(0,this.remaining-dt);this.spawn-=dt;
    if(this.spawn<=0){const t=this.targets.find(t=>!t.active);if(t){t.active=true;t.radius=3;t.angle=this.sequence++*2.39996;t.x=Math.cos(t.angle)*3;t.y=Math.sin(t.angle)*3;}this.spawn=.85;}
    for(const t of this.targets){if(!t.active)continue;t.radius-=dt*(.27+(60-this.remaining)*.003);t.x=Math.cos(t.angle)*t.radius;t.y=Math.sin(t.angle)*t.radius;if(t.radius<.48){t.active=false;this.integrity=Math.max(0,this.integrity-10);this.combo=0;}}
    this.over=this.remaining<=0||this.integrity<=0;
  }
  fire(x:number,y:number){
    if(this.over)return false;
    const target=this.targets.filter(t=>t.active&&Math.hypot(t.x-x,t.y-y)<.42).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
    if(!target){this.combo=0;return false;}
    target.active=false;this.combo++;this.score+=100*Math.min(this.combo,5);return true;
  }
}
