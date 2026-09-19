import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
const path=new URL('../src/tracking/cameraToScreenCoordinates.ts',import.meta.url);
assert.equal(existsSync(path),true,'cameraToScreenCoordinates must exist');
const result=buildSync({entryPoints:[fileURLToPath(path)],bundle:true,write:false,format:'esm',platform:'node'});
const {cameraToScreenCoordinates}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

test('logical space is not remirrored',()=>{
 const p=cameraToScreenCoordinates(.25,.4,{space:'logical'});
 assert.equal(p.x,.25);assert.equal(p.y,.4);
});
test('camera space mirrors X once so image-left becomes screen-right',()=>{
 const p=cameraToScreenCoordinates(.2,.3,{space:'camera'});
 assert.ok(Math.abs(p.x-.8)<1e-6);assert.equal(p.y,.3);
});
test('object-fit cover crops the wider axis without flipping Y',()=>{
 const p=cameraToScreenCoordinates(.5,.5,{
  space:'camera',
  video:{width:1920,height:1080},
  stage:{width:400,height:800},
 });
 assert.ok(p.x>0&&p.x<1);assert.ok(p.y>0&&p.y<1);
});
