import {test} from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';import {fileURLToPath} from 'node:url';
const b=buildSync({entryPoints:[fileURLToPath(new URL('../src/tracking/HandTracker.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {HandTracker}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
function environment(getMedia){
 let instance;globalThis.Hands=class{constructor(){instance=this;this.sent=0;}setOptions(){}onResults(cb){this.results=cb;}async send(){this.sent++;this.results({multiHandLandmarks:[]});}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:getMedia}}});globalThis.cancelAnimationFrame=()=>{};
 const callbacks=new Map();let id=0;
 const video={srcObject:null,currentTime:1,readyState:4,play:async()=>{},requestVideoFrameCallback:cb=>{callbacks.set(++id,cb);return id;},cancelVideoFrameCallback:id=>callbacks.delete(id)};
 return {video,callbacks,model:()=>instance,run:async()=>{const [id,cb]=callbacks.entries().next().value;callbacks.delete(id);await cb(performance.now(),{presentedFrames:1});}};
}
function stream(){let stops=0;const track={stop:()=>stops++,addEventListener:()=>{}};return {getTracks:()=>[track],getVideoTracks:()=>[track],stops:()=>stops};}
test('camera frames are deduplicated and stop cancels acquisition',async()=>{const s=stream(),e=environment(async()=>s),t=new HandTracker();let results=0;t.onUpdate(()=>results++);await t.start(e.video);await e.run();await e.run();assert.equal(e.model().sent,1);assert.equal(results,1);t.stop();assert.equal(s.stops(),1);assert.equal(e.callbacks.size,0);});
test('late permission result after stop is disposed, never starts a loop',async()=>{let resolve;const s=stream(),e=environment(()=>new Promise(r=>resolve=r)),t=new HandTracker();const starting=t.start(e.video);t.stop();resolve(s);await starting;assert.equal(s.stops(),1);assert.equal(e.callbacks.size,0);});
test('camera denial has a stable recoverable error',async()=>{const e=environment(async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});}),t=new HandTracker();await assert.rejects(t.start(e.video),/CAMERA_DENIED/);assert.equal(e.callbacks.size,0);});
