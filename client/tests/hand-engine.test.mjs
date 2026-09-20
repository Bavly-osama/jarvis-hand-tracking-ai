import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {hand,trajectories} from './hand-fixtures.mjs';
const path=new URL('../src/interaction/HandInteractionEngine.ts',import.meta.url);
let HandInteractionEngine;
if(existsSync(path)) {
 const result=buildSync({entryPoints:[fileURLToPath(path)],bundle:true,write:false,format:'esm',platform:'node'});
 ({HandInteractionEngine}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')));
}
function setup(){assert.equal(typeof HandInteractionEngine,'function','production hand engine exists'); const engine=new HandInteractionEngine();let t=1000;return {engine,step:(hands,target='card-0',dt=33,context={id:'home',home:true,scale:1})=>engine.process({hands,timestamp:t+=dt,space:'logical'},()=>target,context)};}

function pinchThenRelease(step, target='card-0'){
  for(let n=0;n<8;n++)step([hand()],target);
  let clicks=0,sawPinched=false;
  for(let n=0;n<30;n++){
    const r=step([hand(.5,.5,.08)],target);
    if(r.pinchState==='PINCHED'||r.state==='PINCH_CONFIRMED')sawPinched=true;
    clicks+=Number(!!r.clickTarget);
  }
  assert.equal(clicks,0,'must not click while fingers stay closed');
  assert.ok(sawPinched,'must reach PINCHED');
  // release
  for(let n=0;n<8;n++){
    const r=step([hand()],target);
    clicks+=Number(!!r.clickTarget);
  }
  return clicks;
}

for(const [name,sign] of [['moveRight',1],['moveLeft',-1]])test(name+' continuously follows displacement',()=>{
 const {step}=setup();let dx=0,moveFrames=0;for(const x of trajectories[name]){const r=step([hand(x)]);dx+=r.dragDelta.x;if(r.state==='MOVE'||Math.abs(r.dragDelta.x)>0)moveFrames++;}assert.ok(dx*sign>.03);assert.ok(moveFrames>=2);
});
test('micro jitter cannot drag cards',()=>{const {step}=setup();for(let n=0;n<30;n++)for(const x of trajectories.jitter){const r=step([hand(x)]);assert.equal(r.dragDelta.x,0);assert.equal(r.navStep,0);assert.notEqual(r.state,'MOVE');}});
test('pinch starts feedback then clicks exactly once on release',()=>{
 const {step}=setup();
 assert.equal(pinchThenRelease(step),1);
 assert.equal(pinchThenRelease(step),1);
});
test('pinch plus translation cancels without click or drag mode',()=>{const {step}=setup();for(let n=0;n<8;n++)step([hand()]);let clicks=0,drag=false;for(let n=0;n<20;n++){const r=step([hand(.5+n*.012,.5,.08)]);clicks+=Number(!!r.clickTarget);drag ||= r.state==='DRAG'||r.mode==='DRAG';}assert.equal(drag,false);assert.equal(clicks,0);});
for(const [name,sign] of [['zoomIn',1],['zoomOut',-1]])test(name+' scales continuously by distance ratio',()=>{const {step}=setup();let previous=1,last=null;for(let n=0;n<6;n++)step([hand(.5-trajectories[name][0]/2),{...hand(.5+trajectories[name][0]/2),handedness:'LEFT'}]);for(const d of trajectories[name]){const r=step([hand(.5-d/2),{...hand(.5+d/2),handedness:'LEFT'}]);assert.equal(r.clickTarget,null);assert.equal(r.navStep,0);if(r.zoom==null)continue;assert.ok((r.zoom-previous)*sign>=-1e-6);previous=r.zoom;last=r;}assert.equal(last.state,'ZOOM');assert.ok((previous-1)*sign>.15);});
test('short loss reanchors drag without jump or click',()=>{const {step}=setup();step([hand(.4)]);step([hand(.47)]);step([],null);step([],null);const r=step([hand(.8)]);assert.equal(r.dragDelta.x,0);assert.equal(r.clickTarget,null);assert.equal(r.navStep,0);});
test('low quality pinch and predicted frames never click',()=>{const {step}=setup();step([hand()]);for(let n=0;n<80;n++){const r=step([{...hand(.5,.5,.05),quality:.2}]);assert.equal(r.clickTarget,null);assert.equal(r.dragDelta.x,0);}const lost=step([],null,800).presence.state;assert.ok(['LOST','HAND_LOST'].includes(lost));});
test('no hand from startup remains lost (never predicted null)',()=>{const {step}=setup();assert.ok(['LOST','HAND_LOST'].includes(step([],null,200).presence.state));});
test('zoom exit while pinched requires release',()=>{const {step}=setup();step([hand(.35,.5,.08),hand(.65,.5,.08)]);for(let n=0;n<30;n++)assert.equal(step([hand(.35,.5,.08)]).clickTarget,null);});
test('empty space cannot click an active card',()=>{const {step}=setup();for(let n=0;n<8;n++)step([hand()],null);for(let n=0;n<25;n++)assert.equal(step([hand(.5,.5,.08)],null).clickTarget,null);for(let n=0;n<8;n++)assert.equal(step([hand()],null).clickTarget,null);});
test('history stays bounded over several minutes of synthetic time',()=>{const {engine,step}=setup();for(let n=0;n<7200;n++)step([hand()]);assert.ok(engine.history.length<=64);});
test('unmirrored camera motion maps once to logical right',()=>{const {engine}=setup();let dx=0;for(const [i,x]of [.6,.57,.53,.48,.42].entries()){const h=hand(x);const r=engine.process({hands:[h],timestamp:1000+i*33,space:'camera'},()=>null,{id:'home',home:true,scale:1});dx+=r.dragDelta.x;}assert.ok(dx>0);});
test('swapping result array order preserves primary hand and zoom scale',()=>{const {step}=setup();const a=hand(.3),b={...hand(.7),handedness:'LEFT'};for(let n=0;n<8;n++)step([a,b]);const r=step([b,a]);assert.equal(r.handedness,'RIGHT');assert.ok(Math.abs((r.zoom??1)-1)<.05);});
test('pinched hand appearing after a long loss cannot click',()=>{const {step}=setup();step([hand()]);step([],null,1000);for(let i=0;i<30;i++)assert.equal(step([hand(.5,.5,.08)]).clickTarget,null);for(let i=0;i<8;i++)assert.equal(step([hand()]).clickTarget,null);});
test('presence holds through grace, then fades without new inference callbacks',()=>{const {engine,step}=setup();step([hand()]);const seen=1033;assert.ok(engine.presence.sample(seen+90).opacity>0);const mid=engine.presence.sample(seen+200);assert.ok(['TEMPORARILY_LOST','UNCERTAIN','HAND_PREDICTED','HAND_WEAK'].includes(mid.state));assert.ok(engine.presence.sample(seen+800).opacity<.7);assert.equal(engine.presence.sample(seen+1200).landmarks,null);});
test('UI context change cancels a pending click',()=>{const {step}=setup();step([hand()]);step([hand(.5,.5,.08)]);for(let i=0;i<20;i++)assert.equal(step([hand(.5,.5,.08)],'card-0',33,{id:'different',home:false,scale:1}).clickTarget,null);});

function twoHands(distance, y=.5, pinch=1){return [hand(.5-distance/2,y,pinch),{...hand(.5+distance/2,y,pinch),handedness:'LEFT'}];}

test('TEST 1 slow right is small controlled movement',()=>{
 const {step}=setup();let dx=0,maxStep=0;
 for(const x of trajectories.slowRight){const r=step([hand(x)]);dx+=r.dragDelta.x;maxStep=Math.max(maxStep,Math.abs(r.dragDelta.x));}
 assert.ok(dx>0,'must move right');
 assert.ok(dx<0.08,'must stay small');
 assert.ok(maxStep<0.03,'no single-frame jump');
});
test('TEST 2 fast right is faster than slow but velocity-clamped',()=>{
 const slow=setup();let slowDx=0;for(const x of trajectories.slowRight)slowDx+=slow.step([hand(x)]).dragDelta.x;
 const {step,engine}=setup();let fastDx=0;const speeds=[];
 for(const x of trajectories.fastRight){const r=step([hand(x)]);fastDx+=r.dragDelta.x;speeds.push(Math.hypot(r.velocity.x,r.velocity.y));}
 assert.ok(fastDx>slowDx,'fast path must outrun slow path');
 const cap=engine.motion?.config?.MAX_POINTER_SPEED ?? 1.2;
 for(const speed of speeds)assert.ok(speed<=cap+1e-6,`velocity ${speed} exceeds ${cap}`);
});
test('TEST 3 tracking spike does not teleport the UI',()=>{
 const {step}=setup();const deltas=[];
 for(const x of trajectories.spike)deltas.push(step([hand(x)]).dragDelta.x);
 assert.ok(Math.abs(deltas[3])<0.02,'0.90 spike must be rejected');
 assert.ok(deltas.slice(0,3).reduce((a,b)=>a+b,0)>0);
 assert.ok(deltas.reduce((a,b)=>a+Math.abs(b),0)<0.2);
});
test('TEST 4 temporary hand loss does not teleport click or reset',()=>{
 const {step,engine}=setup();step([hand(.4)]);step([hand(.47)]);
 step([],null);step([],null);const back=step([hand(.47)]);
 assert.equal(back.dragDelta.x,0);assert.equal(back.clickTarget,null);
 assert.notEqual(engine.state,'IDLE');
});
test('TEST 5 pinch click fires exactly once on release',()=>{
 const {step}=setup();
 assert.equal(pinchThenRelease(step),1);
});
test('TEST 6 held pinch still fires only one click on release',()=>{
 const {step}=setup();for(let n=0;n<8;n++)step([hand()]);
 let clicks=0;for(let n=0;n<Math.ceil(2000/33);n++)clicks+=Number(!!step([hand(.5,.5,.08)]).clickTarget);
 assert.equal(clicks,0);
 for(let n=0;n<10;n++)clicks+=Number(!!step([hand()]).clickTarget);
 assert.equal(clicks,1);
});
test('TEST 7 pinch keeps the captured card when pointer drifts',()=>{
 const {engine}=setup();let t=1000;let clicks=[];
 const hit=x=>x<.55?'card-0':'card-1';
 const feed=(x,pinch)=>{t+=33;const r=engine.process({hands:[hand(x,.5,pinch)],timestamp:t,space:'logical'},()=>hit(x),{id:'home',home:true,scale:1});if(r.clickTarget)clicks.push(r.clickTarget);return r;};
 for(let n=0;n<8;n++)feed(.50,1);
 for(let n=0;n<8;n++)feed(.50,.08);
 for(let n=0;n<16;n++)feed(.52,.08);
 assert.deepEqual(clicks,[]);
 for(let n=0;n<8;n++)feed(.52,1);
 assert.deepEqual(clicks,['card-0']);
});
test('TEST 8 pinch plus large move cancels without click',()=>{
 const {step}=setup();for(let n=0;n<8;n++)step([hand()]);
 let clicks=0,drag=false;for(let n=0;n<20;n++){const r=step([hand(.5+n*.012,.5,.08)]);clicks+=Number(!!r.clickTarget);drag||=r.state==='DRAG';}
 assert.equal(drag,false);assert.equal(clicks,0);
});
test('TEST 9 two-hand zoom in increases scale',()=>{
 const {step}=setup();let previous=1,seen=0;
 for(let n=0;n<6;n++)step(twoHands(.20));
 for(const d of trajectories.zoomInSpec){const r=step(twoHands(d));if(r.zoom==null)continue;assert.ok(r.zoom+1e-6>=previous);previous=r.zoom;seen++;assert.equal(r.clickTarget,null);assert.equal(r.navStep,0);}
 assert.ok(seen>=3);assert.ok(previous>1.15);
});
test('TEST 10 two-hand zoom out decreases scale',()=>{
 const {step}=setup();for(let n=0;n<6;n++)step(twoHands(.45));
 let previous=null,seen=0;
 for(const d of trajectories.zoomOutSpec){const r=step(twoHands(d));if(r.zoom==null)continue;if(previous!=null)assert.ok(r.zoom<=previous+1e-6);previous=r.zoom;seen++;assert.equal(r.navStep,0);}
 assert.ok(seen>=3);assert.ok(previous<1);
});
test('TEST 11 zoom jitter does not change scale',()=>{
 const {step}=setup();for(let n=0;n<8;n++)step(twoHands(.300));
 const scales=[];for(const d of trajectories.zoomJitter){const r=step(twoHands(d));if(r.zoom!=null)scales.push(r.zoom);}
 assert.ok(scales.length>=3);
 assert.ok(Math.max(...scales)-Math.min(...scales)<0.04);
});
test('TEST 12 losing one hand during zoom reanchors without a scale jump',()=>{
 const {step}=setup();for(let n=0;n<6;n++)step(twoHands(.30));
 const active=step(twoHands(.38));assert.ok(active.zoom>1);
 const paused=step([hand(.31)]);assert.equal(paused.clickTarget,null);
 assert.ok(Math.abs((paused.zoom??active.zoom)-active.zoom)<0.04);
 const back=step(twoHands(.38));
 assert.ok(Math.abs((back.zoom??active.zoom)-active.zoom)<0.08);
});

test('navStep RIGHT fires once then locks until hand slows',()=>{
 const {step}=setup();
 for(let n=0;n<8;n++)step([hand(.30)]);
 let steps=[];
 for(let cycle=0;cycle<10;cycle++){
   for(const x of [.30,.34,.38,.42,.46,.50,.54,.58]){
     const r=step([hand(x)]);
     if(r.navStep)steps.push(r.navStep);
   }
   for(let n=0;n<16;n++)step([hand(.58)]);
   for(let n=0;n<6;n++)step([hand(.30)]);
 }
 assert.ok(steps.length>=5,`expected several right snaps, got ${steps.length}: ${steps}`);
 assert.ok(steps.every(s=>s===1),'every snap must be RIGHT (+1)');
});

test('navStep LEFT fires once per unlock cycle',()=>{
 const {step}=setup();
 for(let n=0;n<8;n++)step([hand(.70)]);
 let steps=[];
 for(let cycle=0;cycle<10;cycle++){
   for(const x of [.70,.66,.62,.58,.54,.50,.46,.42]){
     const r=step([hand(x)]);
     if(r.navStep)steps.push(r.navStep);
   }
   for(let n=0;n<16;n++)step([hand(.42)]);
   for(let n=0;n<6;n++)step([hand(.70)]);
 }
 assert.ok(steps.length>=5,`expected several left snaps, got ${steps.length}: ${steps}`);
 assert.ok(steps.every(s=>s===-1));
});

test('zoom clamps between 0.7 and 2.0',()=>{
 const {step}=setup();
 for(let n=0;n<6;n++)step(twoHands(.15));
 let max=1;
 for(let d=.15;d<.9;d+=.05){const r=step(twoHands(d));if(r.zoom!=null)max=Math.max(max,r.zoom);}
 assert.ok(max<=2.0+1e-6);
 for(let n=0;n<6;n++)step(twoHands(.50));
 let min=2;
 for(let d=.50;d>.05;d-=.04){const r=step(twoHands(d));if(r.zoom!=null)min=Math.min(min,r.zoom);}
 assert.ok(min>=0.7-1e-6);
});
