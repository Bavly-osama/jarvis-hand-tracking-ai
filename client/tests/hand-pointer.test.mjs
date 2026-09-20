import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {hand} from './hand-fixtures.mjs';

function stubDom(width=800,height=600){
  const body={children:[],appendChild(c){this.children.push(c);return c;},removeChild(c){this.children=this.children.filter(x=>x!==c);}};
  function element(tag='div'){
    const classSet=new Set();
    const el={
      tagName:tag.toUpperCase(),id:'',className:'',textContent:'',style:{},children:[],
      classList:{add:(...c)=>c.forEach(x=>classSet.add(x)),remove:(...c)=>c.forEach(x=>classSet.delete(x)),
        contains:c=>classSet.has(c),toggle:(c,on)=>{if(on===false)classSet.delete(c);else if(on===true)classSet.add(c);else classSet.has(c)?classSet.delete(c):classSet.add(c);}},
      appendChild(c){this.children.push(c);c.parentNode=this;return c;},
      remove(){this.parentNode?.removeChild?.(this);},
      getBoundingClientRect:()=>({left:0,top:0,width,height,right:width,bottom:height}),
    };
    Object.defineProperty(el,'className',{get:()=>[...classSet].join(' '),set(v){classSet.clear();String(v).split(/\s+/).filter(Boolean).forEach(c=>classSet.add(c));}});
    return el;
  }
  globalThis.document={body,createElement:element,getElementById:()=>null};
  globalThis.window={innerWidth:width,innerHeight:height,addEventListener(){},removeEventListener(){}};
  globalThis.requestAnimationFrame=()=>0;
  globalThis.cancelAnimationFrame=()=>{};
  return {body,stage:Object.assign(element('div'),{id:'app-container'})};
}

const pointerPath=new URL('../src/ui/HandPointer.ts',import.meta.url);
test('HandPointer module exists',()=>{assert.equal(existsSync(pointerPath),true,'HandPointer.ts must exist');});

let HandPointer,mapIndexTipToScreen;
if(existsSync(pointerPath)){
  const result=buildSync({entryPoints:[fileURLToPath(pointerPath)],bundle:true,write:false,format:'esm',platform:'node'});
  ({HandPointer,mapIndexTipToScreen}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')));
}

function pointer(){
  assert.equal(typeof HandPointer,'function','HandPointer class must exist');
  const {stage}=stubDom();
  const p=new HandPointer(stage,{autoLoop:false});
  return p;
}

test('pointer shows when a hand exists with no pinch, hover, or Gemini',()=>{
  const p=pointer();
  const tip=hand(.4,.35).landmarks[8];
  p.setTarget(tip.x*800,tip.y*600,1000);
  p.tick(1000,16);
  assert.equal(p.visible,true);
  assert.equal(p.state,'TRACKING');
  assert.ok(p.opacity>0.9);
  p.dispose();
});

test('missing two frames keeps the pointer visible; missing 400ms still holds; missing 1.2s hides it',()=>{
  const p=pointer();
  p.setTarget(400,300,1000);
  p.tick(1000,16);
  p.tick(1033,16);
  p.tick(1066,16);
  assert.equal(p.visible,true,'must hold through two missed tracking frames');
  p.tick(1400,16);
  assert.equal(p.visible,true,'must still hold at 400ms (grace)');
  p.tick(2300,16);
  assert.equal(p.visible,false,'must hide after sustained loss');
  assert.equal(p.state,'LOST');
  p.dispose();
});

test('fast motion reaches a step sooner than slow motion',()=>{
  const slow=pointer();
  slow.setTarget(0,0,0);slow.tick(0,16);slow.setTarget(12,0,16);
  let slowFrames=0,slowNow=16;
  while(slow.x<10.8 && slowFrames<40){slowNow+=16;slow.tick(slowNow,16);slowFrames++;}
  const fast=pointer();
  fast.setTarget(0,0,0);fast.tick(0,16);fast.setTarget(400,0,16);
  let fastFrames=0,fastNow=16;
  while(fast.x<360 && fastFrames<40){fastNow+=16;fast.tick(fastNow,16);fastFrames++;}
  assert.ok(fastFrames<slowFrames,`fast ${fastFrames} frames should beat slow ${slowFrames}`);
  slow.dispose();fast.dispose();
});

test('index tip mapping uses cameraToScreenCoordinates and stage rect',()=>{
  stubDom();
  assert.equal(typeof mapIndexTipToScreen,'function');
  const rect={left:10,top:20,width:800,height:600};
  const p=mapIndexTipToScreen(.25,.4,{space:'camera',mirror:true,stageRect:rect});
  assert.ok(Math.abs(p.x-.75)<1e-6);
  assert.ok(Math.abs(p.screenX-(10+0.75*800))<1e-6);
  assert.ok(Math.abs(p.screenY-(20+0.4*600))<1e-6);
});
