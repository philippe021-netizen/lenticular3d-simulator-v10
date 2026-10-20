import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const window = {};
vm.runInNewContext(readFileSync(new URL('../action-preview-engine.js', import.meta.url), 'utf8'), { window, console: { log() {} } });
const engine = window.HappyHoloActionPreviewEngine;
function rotation(phase) {
  let angle;
  const ctx = {save(){},restore(){},translate(){},scale(){},drawImage(){},rotate(value){angle=value;}};
  engine.renderAction(ctx, {}, {action:'pivot',intensity:75}, phase, 600, 900);
  return angle;
}
test('pivot traverses both sides symmetrically with a neutral midpoint', () => {
  assert.ok(rotation(0) < 0);
  assert.ok(rotation(1) > 0);
  assert.ok(Math.abs(rotation(0) + rotation(1)) < 1e-12);
  assert.ok(Math.abs(rotation(.5)) < 1e-12);
});
test('default preview cycle reaches both sides and closes without a jump', () => {
  const angles = Array.from(engine.PHASES, rotation);
  assert.ok(angles.some(a=>a<0) && angles.some(a=>a>0));
  assert.equal(angles[0], angles.at(-1));
});

function parallaxX(depth, intensity, phase) {
  let offset;
  const ctx = {drawImage(layer,x){offset=x;}};
  engine.renderAction(ctx, {}, {action:'parallax',depth,intensity}, phase, 1000, 700);
  return offset;
}
test('parallax foreground moves more than middle plane without rotating', () => {
  const near = parallaxX(.65,75,1);
  const middle = parallaxX(.48,35,1);
  assert.ok(near > 20);
  assert.ok(middle > 0 && near > middle * 3);
  assert.equal(parallaxX(.65,75,.5),0);
  assert.equal(parallaxX(.65,75,0),-near);
  assert.equal(parallaxX(0,75,1),0);
});
