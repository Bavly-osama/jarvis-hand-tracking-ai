import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';

const path=new URL('../src/perf/PerformanceProfileManager.ts',import.meta.url);
test('PerformanceProfileManager exists',()=>{assert.equal(existsSync(path),true);});

let PerformanceProfileManager,classifyDevice;
if(existsSync(path)){
  const result=buildSync({entryPoints:[fileURLToPath(path)],bundle:true,write:false,format:'esm',platform:'node'});
  ({PerformanceProfileManager,classifyDevice}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')));
}

test('fake mobile metrics select MOBILE with DPR cap 1.0',()=>{
  assert.equal(typeof classifyDevice,'function');
  const metrics={width:390,height:844,devicePixelRatio:3,hardwareConcurrency:6,deviceMemory:4};
  assert.equal(classifyDevice(metrics),'MOBILE');
  const manager=new PerformanceProfileManager(metrics);
  assert.equal(manager.profile.name,'MOBILE');
  assert.equal(manager.profile.pixelRatioCap,1.0);
  assert.equal(manager.profile.bloom,false);
  assert.equal(manager.profile.fxaa,false);
  assert.equal(manager.profile.visibleCards,3);
  assert.equal(manager.profile.modelComplexity,0);
  assert.ok(manager.profile.globeSegments<=32);
});

test('desktop metrics stay HIGH until FPS hysteresis drops the tier',()=>{
  const metrics={width:1920,height:1080,devicePixelRatio:1,hardwareConcurrency:16,deviceMemory:16};
  assert.equal(classifyDevice(metrics),'HIGH');
  const manager=new PerformanceProfileManager(metrics);
  assert.equal(manager.profile.name,'HIGH');
  assert.equal(manager.profile.pixelRatioCap,1.5);
  for(let t=0;t<=2100;t+=100)manager.sampleFps(20,1000+t);
  assert.ok(['MEDIUM','LOW'].includes(manager.profile.name),'sustained low FPS must drop a tier');
});

test('reclassify to a phone viewport selects MOBILE',()=>{
  const manager=new PerformanceProfileManager({width:1920,height:1080,devicePixelRatio:1,hardwareConcurrency:16,deviceMemory:16});
  manager.reclassify({width:390,height:844,devicePixelRatio:3,hardwareConcurrency:6,deviceMemory:4});
  assert.equal(manager.profile.name,'MOBILE');
  assert.equal(manager.profile.pixelRatioCap,1.0);
});
