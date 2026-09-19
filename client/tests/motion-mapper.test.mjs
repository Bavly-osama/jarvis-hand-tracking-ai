import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
const path=new URL('../src/interaction/PointerMotionMapper.ts',import.meta.url);
assert.equal(existsSync(path),true,'PointerMotionMapper must exist');
const result=buildSync({entryPoints:[fileURLToPath(path)],bundle:true,write:false,format:'esm',platform:'node'});
const {PointerMotionMapper,MOTION_CONFIG}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

function run(xs,dt=33){
 const mapper=new PointerMotionMapper();
 let t=0;const out=[];
 for(const x of xs){t+=dt;out.push(mapper.sample(x,.5,t));}
 return out;
}

test('slow right stays nearly 1:1 and never jumps',()=>{
 const samples=run([.40,.405,.41,.415,.42,.425]);
 const dx=samples.reduce((a,s)=>a+s.deltaX,0);
 assert.ok(dx>0);assert.ok(dx<0.06);assert.ok(Math.max(...samples.map(s=>Math.abs(s.deltaX)))<0.02);
});
test('fast right is faster than slow and clamped to MAX_POINTER_SPEED',()=>{
 const slow=run([.40,.405,.41,.415,.42,.425]);
 const fast=run([.40,.48,.58,.68]);
 const slowDx=slow.reduce((a,s)=>a+s.deltaX,0);
 const fastDx=fast.reduce((a,s)=>a+s.deltaX,0);
 assert.ok(fastDx>slowDx);
 for(const s of fast)assert.ok(Math.hypot(s.velocityX,s.velocityY)<=MOTION_CONFIG.MAX_POINTER_SPEED+1e-6);
});
test('implausible spike reanchors with zero movement',()=>{
 const samples=run([.40,.42,.43,.90,.44]);
 assert.equal(samples[3].reanchored,true);
 assert.equal(samples[3].deltaX,0);
});
test('30 and 60 FPS produce similar travelled distance',()=>{
 const xs=[.40,.42,.44,.46,.48,.50];
 const a=run(xs,33).reduce((s,v)=>s+v.deltaX,0);
 const b=run(xs,16.7).reduce((s,v)=>s+v.deltaX,0);
 assert.ok(Math.abs(a-b)<0.04);
});
