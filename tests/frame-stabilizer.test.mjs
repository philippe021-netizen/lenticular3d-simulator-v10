import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStabilizedPlacement, estimateTranslation } from '../modules/frame-stabilizer.js';

function pattern(width, height) {
  return Uint8Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    return (x * 17 + y * 29 + x * y) % 256;
  });
}

function translate(source, width, height, dx, dy) {
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = x - dx;
    const sy = y - dy;
    if (sx >= 0 && sy >= 0 && sx < width && sy < height) output[y * width + x] = source[sy * width + sx];
  }
  return output;
}

test('recovers a small two-pixel camera shift', () => {
  const reference = pattern(24, 24);
  const shifted = translate(reference, 24, 24, 2, -1);
  assert.deepEqual(estimateTranslation(reference, shifted, 24, 24, 4), { dx: -2, dy: 1, confidence: 1 });
});

test('covers translated edges with the smallest symmetric overscan', () => {
  assert.deepEqual(computeStabilizedPlacement(100, 80, -4, 3), {
    x: -8, y: 0, drawWidth: 108, drawHeight: 86
  });
});
