import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';

const path=new URL('../src/interaction/HitPad.ts',import.meta.url);
test('HitPad helper exists',()=>{assert.equal(existsSync(path),true);});

let pointInPaddedBox,CARD_HIT_PAD;
if(existsSync(path)){
  const result=buildSync({entryPoints:[fileURLToPath(path)],bundle:true,write:false,format:'esm',platform:'node'});
  ({pointInPaddedBox,CARD_HIT_PAD}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')));
}

test('a point just outside the visual mesh but inside the pad selects the card',()=>{
  assert.equal(typeof pointInPaddedBox,'function');
  assert.ok(CARD_HIT_PAD>=0.12 && CARD_HIT_PAD<=0.15);
  const box={minX:-0.2,maxX:0.2,minY:-0.25,maxY:0.25};
  assert.equal(pointInPaddedBox(0,0,box),true);
  const justOutside=box.maxX+0.001;
  assert.ok(justOutside>box.maxX);
  assert.equal(pointInPaddedBox(justOutside,0,box),true);
  const far=box.maxX+(box.maxX-box.minX)*0.2;
  assert.equal(pointInPaddedBox(far,0,box),false);
});
