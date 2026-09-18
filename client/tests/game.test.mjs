import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
const path=new URL('../src/experiences/OrbitGame.ts',import.meta.url);
const exports=existsSync(path)?await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText).toString('base64')):{};
function game(){assert.equal(typeof exports.OrbitGame,'function','A playable game model must exist');return new exports.OrbitGame();}
test('hit awards score, consumes exactly one target and advances combo',()=>{const g=game();g.update(1);const t=g.targets.find(t=>t.active);assert.ok(t);assert.equal(g.fire(t.x,t.y),true);assert.equal(g.score,100);assert.equal(g.combo,1);assert.equal(t.active,false);});
test('miss resets combo; timer ends round; replay resets state',()=>{const g=game();g.update(1);const t=g.targets.find(t=>t.active);g.fire(t.x,t.y);assert.equal(g.fire(100,100),false);assert.equal(g.combo,0);for(let i=0;i<610;i++)g.update(.1);assert.equal(g.over,true);assert.equal(g.fire(0,0),false);g.reset();assert.equal(g.score,0);assert.equal(g.remaining,60);assert.equal(g.over,false);});
test('target pool is bounded and missed threats damage the core',()=>{const g=game();for(let i=0;i<300;i++)g.update(.1);assert.equal(g.targets.length,12);assert.ok(g.integrity<100);});
