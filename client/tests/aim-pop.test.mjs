import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';

const path=new URL('../src/experiences/AimPopPractice.ts',import.meta.url);
test('AimPopPractice exists',()=>assert.equal(existsSync(path),true));

let AimPopPractice;
if(existsSync(path)){
  const result=buildSync({entryPoints:[fileURLToPath(path)],bundle:true,write:false,format:'esm',platform:'node'});
  ({AimPopPractice}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')));
}

test('pinch hit scores and builds combo; miss resets combo',()=>{
  const g=new AimPopPractice();
  const a=g.spawn(0.5,0.5);
  assert.equal(!!g.tryHit(0.5,0.5),true);
  assert.equal(a.alive,false);
  assert.equal(g.score,100);
  assert.equal(g.combo,1);
  g.spawn(0.3,0.3);
  assert.equal(!!g.tryHit(0.3,0.3),true);
  assert.equal(g.combo,2);
  assert.equal(g.score,300);
  assert.equal(g.tryHit(0.9,0.9),null);
  assert.equal(g.combo,0);
});

test('HAND OK after sustained visibility',()=>{
  const g=new AimPopPractice();
  g.update(0.2,1000,true);
  assert.equal(g.handOk,false);
  g.update(0.4,1400,true);
  assert.equal(g.handOk,true);
});
