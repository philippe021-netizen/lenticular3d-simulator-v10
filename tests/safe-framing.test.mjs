import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSafeFrameGeometry } from '../modules/safe-framing.js';

test('adds 14 percent safety without changing aspect ratio', () => {
  const geometry = computeSafeFrameGeometry({ width: 1000, height: 1500, safeMargin: 0.14, anchor: 'center' });
  assert.equal(geometry.outputWidth / geometry.outputHeight, 1000 / 1500);
  assert.ok(geometry.drawWidth < geometry.outputWidth);
  assert.ok(geometry.drawHeight < geometry.outputHeight);
  assert.equal(geometry.scale, 0.72);
  assert.deepEqual({ dx: geometry.dx, dy: geometry.dy }, { dx: 140, dy: 210 });
});

test('rejects unsafe margin values', () => {
  assert.throws(() => computeSafeFrameGeometry({ width: 100, height: 100, safeMargin: 0.6 }), /safeMargin/);
});

test('rejects invalid source dimensions', () => {
  assert.throws(() => computeSafeFrameGeometry({ width: 0, height: 100, safeMargin: 0.1 }), /dimensions/i);
});
