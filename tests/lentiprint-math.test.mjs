import test from 'node:test';
import assert from 'node:assert/strict';
import { millimetersToPixels, lenticulePitchPixels, viewIndexForColumn } from '../modules/lentiprint-math.js';

test('physical dimensions include geometric compensation without changing aspect silently', () => {
  assert.equal(millimetersToPixels(85.6, 600, 1), 2022);
  assert.equal(millimetersToPixels(54, 600, 1), 1276);
  assert.equal(millimetersToPixels(85.6, 600, 1.01), 2042);
});

test('50 and 60 LPI use their calibrated pixel pitch at the selected DPI', () => {
  assert.equal(lenticulePitchPixels(600, 50), 12);
  assert.equal(lenticulePitchPixels(600, 60), 10);
});

test('one lenticule traverses views 01 through 09, and reverse order traverses 09 through 01', () => {
  const forward = Array.from({ length: 12 }, (_, x) => viewIndexForColumn(x, 12, 0, false));
  const reverse = Array.from({ length: 12 }, (_, x) => viewIndexForColumn(x, 12, 0, true));
  assert.deepEqual(forward[0], 0);
  assert.deepEqual(forward[11], 8);
  assert.ok(forward.every((value, i) => i === 0 || value >= forward[i - 1]));
  assert.deepEqual(reverse, forward.map(value => 8 - value));
});
