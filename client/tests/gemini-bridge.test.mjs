import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/ai/GeminiIntentBridge.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {GeminiIntentBridge}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('uncorrelated and duplicate AI responses never execute',()=>{
 const sent=[];const b=new GeminiIntentBridge({isConnected:()=>true,requestAIIntent:p=>sent.push(p)});
 let actions=0;const scene={activate:()=>actions++,isHome:true};const sm={getState:()=> 'POINTING'};
 const response={requestId:'one',stateVersion:1,intent:'SELECT',confidence:.9};
 b.handleResponse(response,sm,scene,1);assert.equal(actions,0);
 b.requestIntent({requestId:'one',stateVersion:1});b.handleResponse(response,sm,scene,1);b.handleResponse(response,sm,scene,1);assert.equal(actions,1);
});
test('offline requests do not accumulate',()=>{const b=new GeminiIntentBridge({isConnected:()=>false,requestAIIntent:()=>assert.fail()});b.requestIntent({requestId:'offline'});assert.equal(b.pendingCount,0);});
