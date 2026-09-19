import {test} from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';import {fileURLToPath} from 'node:url';
const b=buildSync({entryPoints:[fileURLToPath(new URL('../src/tracking/LandmarkFilter.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {OneEuroFilter}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
test('adaptive filter attenuates stationary jitter while following fast movement',()=>{
 const old=new OneEuroFilter(.8,.003,1),adaptive=new OneEuroFilter(1.5,8,2);
 let rawSq=0,filteredSq=0;
 for(let i=0;i<600;i++){const raw=.5+.003*Math.sin(i*2.1);const v=adaptive.filter(raw,i/30);old.filter(raw,i/30);if(i>60){rawSq+=(raw-.5)**2;filteredSq+=(v-.5)**2;}}
 let adaptiveDelay=null,oldDelay=null;
 for(let i=0;i<30;i++){const t=20+i/30;if(adaptive.filter(.75,t)>=.725&&adaptiveDelay===null)adaptiveDelay=i*1000/30;if(old.filter(.75,t)>=.725&&oldDelay===null)oldDelay=i*1000/30;}
 console.log(JSON.stringify({fixture:'30Hz synthetic stationary sine + step',jitterRmsRatio:Math.sqrt(filteredSq/rawSq),adaptiveStep90Ms:adaptiveDelay,previousProfileStep90Ms:oldDelay}));
 assert.ok(filteredSq<rawSq*.5);assert.ok(adaptiveDelay<=100);assert.ok(adaptiveDelay<oldDelay);
});
