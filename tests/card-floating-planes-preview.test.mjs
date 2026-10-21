import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCardPlane, multiplyColumnMajor } from '../modules/card-floating-planes-preview.js';

test('depth projects into visible vertical height even when the camera faces forward', () => {
  const rear = projectCardPlane(-70, 0, 520, 330, 1.8);
  const front = projectCardPlane(70, 0, 520, 330, 1.8);
  assert.ok(Math.abs(rear.x) < 1e-9);
  assert.ok(Math.abs(front.x) < 1e-9);
  assert.ok(front.y < rear.y, 'front plane should rise above the rear plane');
  assert.ok(front.scale > rear.scale, 'front plane should appear slightly larger');
});

test('camera angle adds opposing lateral parallax while preserving height separation', () => {
  const left = projectCardPlane(60, -36, 520, 330, 1.8);
  const right = projectCardPlane(60, 36, 520, 330, 1.8);
  assert.ok(left.x > 0);
  assert.ok(right.x < 0);
  assert.ok(left.y < 0);
  assert.ok(right.y < 0);
});

test('visual relief control scales plane separation', () => {
  const normal = projectCardPlane(60, 0, 520, 330, 1);
  const exaggerated = projectCardPlane(60, 0, 520, 330, 3);
  assert.ok(Math.abs(exaggerated.y) > Math.abs(normal.y) * 2.9);
});

test('3D projection keeps the card in front of the camera (WebGL column-major math)', () => {
  // Looking towards a card 3.5 units away: clip-space W must remain positive.
  const perspective = new Float32Array([2,0,0,0, 0,3,0,0, 0,0,-1.01,-1, 0,0,-.201,0]);
  const view = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-3.5,1]);
  const combined = multiplyColumnMajor(perspective,view);
  const clipW = combined[15]; // projection of the card origin [0,0,0,1]
  assert.ok(clipW > 3 && clipW < 4, 'card should be visible, not clipped');
  assert.ok(Math.abs(combined[14] / clipW) < 1, 'card must lie inside the view frustum');
});
