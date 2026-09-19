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
for(const [name,sign] of [['moveRight',1],['moveLeft',-1]])test(name+' continuously follows displacement',()=>{
 const {step}=setup();let dx=0,frames=0;for(const x of trajectories[name]){const r=step([hand(x)]);dx+=r.dragDelta.x;if(r.state==='DRAG')frames++;}assert.ok(dx*sign>.03);assert.ok(frames>=2);
});
test('micro jitter cannot drag cards',()=>{const {step}=setup();for(let n=0;n<30;n++)for(const x of trajectories.jitter){const r=step([hand(x)]);assert.equal(r.dragDelta.x,0);assert.notEqual(r.state,'DRAG');}});
test('pinch starts feedback then clicks exactly once until release',()=>{const {step}=setup();for(let n=0;n<8;n++)step([hand()]);let clicks=0,sawStart=false;for(let n=0;n<40;n++){const r=step([hand(.5,.5,.08)]);if(r.state==='PINCH_START')sawStart=true;clicks+=Number(!!r.clickTarget);}assert.ok(sawStart);assert.equal(clicks,1);for(let n=0;n<15;n++)step([hand()]);for(let n=0;n<25;n++)clicks+=Number(!!step([hand(.5,.5,.08)]).clickTarget);assert.equal(clicks,2);});
test('pinch plus translation becomes drag without click',()=>{const {step}=setup();for(let n=0;n<8;n++)step([hand()]);let clicks=0,drag=false;for(let n=0;n<20;n++){const r=step([hand(.5+n*.012,.5,.08)]);clicks+=Number(!!r.clickTarget);drag ||= r.state==='DRAG';}assert.ok(drag);assert.equal(clicks,0);});
for(const [name,sign] of [['zoomIn',1],['zoomOut',-1]])test(name+' scales continuously by distance ratio',()=>{const {step}=setup();let previous=1;for(const d of trajectories[name]){const r=step([hand(.5-d/2),{...hand(.5+d/2),handedness:'LEFT'}]);assert.equal(r.state,'ZOOM');assert.equal(r.clickTarget,null);assert.ok((r.zoom-previous)*sign>=-1e-6);previous=r.zoom;}assert.ok((previous-1)*sign>.2);});
test('short loss reanchors drag without jump or click',()=>{const {step}=setup();step([hand(.4)]);step([hand(.47)]);step([],null);step([],null);const r=step([hand(.8)]);assert.equal(r.dragDelta.x,0);assert.equal(r.clickTarget,null);});
test('low quality pinch and predicted frames never click',()=>{const {step}=setup();step([hand()]);for(let n=0;n<80;n++){const r=step([{...hand(.5,.5,.05),quality:.2}]);assert.equal(r.clickTarget,null);assert.equal(r.dragDelta.x,0);}assert.equal(step([],null,800).presence.state,'HAND_LOST');});
test('no hand from startup remains lost (never predicted null)',()=>{const {step}=setup();assert.equal(step([],null,200).presence.state,'HAND_LOST');});
test('zoom exit while pinched requires release',()=>{const {step}=setup();step([hand(.35,.5,.08),hand(.65,.5,.08)]);for(let n=0;n<30;n++)assert.equal(step([hand(.35,.5,.08)]).clickTarget,null);});
test('target changes cancel click; empty space cannot click active card',()=>{const {step}=setup();step([hand()]);for(let n=0;n<25;n++)assert.equal(step([hand(.5,.5,.08)],n<3?'card-0':'card-1').clickTarget,null);for(let n=0;n<15;n++)step([hand()],null);for(let n=0;n<25;n++)assert.equal(step([hand(.5,.5,.08)],null).clickTarget,null);});
test('history stays bounded over several minutes of synthetic time',()=>{const {engine,step}=setup();for(let n=0;n<7200;n++)step([hand()]);assert.ok(engine.history.length<=64);});
test('unmirrored camera motion maps once to logical right',()=>{const {engine}=setup();let dx=0;for(const [i,x]of [.6,.57,.53,.48,.42].entries()){const h=hand(x);const r=engine.process({hands:[h],timestamp:1000+i*33,space:'camera'},()=>null,{id:'home',home:true,scale:1});dx+=r.dragDelta.x;}assert.ok(dx>0);});
test('swapping result array order preserves primary hand and zoom scale',()=>{const {step}=setup();const a=hand(.3),b={...hand(.7),handedness:'LEFT'};step([a,b]);const r=step([b,a]);assert.equal(r.handedness,'RIGHT');assert.ok(Math.abs(r.zoom-1)<.001);});
test('pinched hand appearing after a long loss cannot click',()=>{const {step}=setup();step([hand()]);step([],null,1000);for(let i=0;i<30;i++)assert.equal(step([hand(.5,.5,.08)]).clickTarget,null);});
test('presence holds, predicts, fades, and terminates without new inference callbacks',()=>{const {engine,step}=setup();step([hand()]);const seen=1033;assert.ok(engine.presence.sample(seen+90).opacity>0);assert.equal(engine.presence.sample(seen+200).state,'HAND_PREDICTED');assert.ok(engine.presence.sample(seen+550).opacity<.7);assert.equal(engine.presence.sample(seen+701).landmarks,null);});
test('UI context change cancels a pending click',()=>{const {step}=setup();step([hand()]);step([hand(.5,.5,.08)]);for(let i=0;i<20;i++)assert.equal(step([hand(.5,.5,.08)],'card-0',33,{id:'different',home:false,scale:1}).clickTarget,null);});
