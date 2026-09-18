import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

async function load(name) {
  const path = new URL(`../src/interaction/${name}.ts`, import.meta.url);
  if (!existsSync(path)) return {};
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { NavigationState, ExperienceState } = await load('NavigationState');
function navigation() { assert.equal(typeof NavigationState, 'function', 'Discrete navigation model must exist'); return new NavigationState(10); }

for (const speed of [0.61, 1, 100]) test(`one ${speed} velocity swipe moves exactly one slot, even over many frames`, () => {
  const n = navigation();
  assert.equal(n.swipe(-speed), true);
  for(let i=0;i<300;i++) { n.swipe(-speed); n.observeNeutral(false, 1/60); }
  n.completeTransition();
  for(let i=0;i<300;i++) { n.swipe(-speed); n.observeNeutral(false, 1/60); }
  assert.equal(n.index, 1);
});
test('neutral must be held after animation; elapsed time or tracking loss does not unlock', () => {
  const n=navigation();n.swipe(-1);n.observeNeutral(true,1);n.completeTransition();
  assert.equal(n.swipe(-1),false);
  n.observeNeutral(false,10);assert.equal(n.swipe(-1),false);
  for(let i=0;i<12;i++)n.observeNeutral(true,1/60);
  assert.equal(n.swipe(-1),true);assert.equal(n.index,2);
});
test('swipe right wraps backward and left wraps forward', () => {
  const n=navigation();n.swipe(999);assert.equal(n.index,9);n.completeTransition();
  for(let i=0;i<12;i++)n.observeNeutral(true,1/60);
  n.swipe(-999);assert.equal(n.index,0);
});
test('buttons share the animation lock but do not need a hand reset', () => {
  const n=navigation();assert.equal(n.step(1),true);assert.equal(n.step(1),false);
  n.completeTransition();assert.equal(n.step(1),true);assert.equal(n.index,2);
});
test('invalid swipes cannot corrupt the selected index', () => {
  const n=navigation();for(const value of [NaN,Infinity,-Infinity,0,.001])assert.equal(n.swipe(value),false);
  assert.equal(n.index,0);
});
test('experience lifecycle locks navigation and restores the exact home index', () => {
  assert.equal(typeof ExperienceState,'function','Experience state machine must exist');
  const s=new ExperienceState();assert.equal(s.open(7),true);assert.equal(s.canNavigate,false);
  assert.equal(s.open(2),false);s.enter();assert.equal(s.state,'EXPERIENCE_ACTIVE');
  assert.equal(s.close(),true);assert.equal(s.close(),false);s.home();
  assert.equal(s.index,7);assert.equal(s.state,'MAIN_CAROUSEL');assert.equal(s.canNavigate,true);
});
