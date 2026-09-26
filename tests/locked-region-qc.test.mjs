import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLockedRegion, bestAlignedDrift, assessLockedRegionMetrics } from '../modules/locked-region-qc.js';
import { evaluateGenerationQC } from '../modules/generation-qc.js';

test('locked region is normalized and constrained', () => {
  assert.deepEqual(normalizeLockedRegion({ x: .2, y: .1, width: .3, height: .4 }), {
    x: .2, y: .1, width: .3, height: .4
  });
  const clipped = normalizeLockedRegion({ x: .9, y: .9, width: .5, height: .5 });
  assert.equal(clipped.width, .1);
  assert.equal(clipped.height, .1);
  assert.deepEqual(clipped, { x: .9, y: .9, width: .1, height: .1 });
  const edge = normalizeLockedRegion({ x: .12345678, y: .23456789, width: 1, height: 1 });
  assert.ok(edge.x + edge.width <= 1);
  assert.ok(edge.y + edge.height <= 1);
});

test('aligned drift detects a small translation without reporting identity drift', () => {
  const size = 8;
  const ref = new Float32Array(size * size);
  const shifted = new Float32Array(size * size);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) ref[y * size + x] = 220;
  for (let y = 2; y < 6; y++) for (let x = 3; x < 7; x++) shifted[y * size + x] = 220;
  const result = bestAlignedDrift(ref, shifted, size, 2);
  assert.ok(result.drift < 0.001);
  assert.ok(Math.abs(result.dx) > 0);
});

test('QC fails closed when identity confirmation and locked metrics are required', () => {
  const result = evaluateGenerationQC(
    { returnDetected: false },
    { requireIdentityConfirmation: true, requireHeadDrift: true, requireBackgroundDrift: true }
  );
  assert.equal(result.passed, false);
  assert.ok(result.hardFailures.includes('identity-confirmed'));
  assert.ok(result.hardFailures.includes('head-drift'));
  assert.ok(result.hardFailures.includes('background'));
});

test('QC passes only after controlled lock metrics and human identity confirmation', () => {
  const result = evaluateGenerationQC(
    {
      identityConfirmed: true,
      headDrift: 0.01,
      preHeadDrift: 0.06,
      backgroundDrift: 0.02,
      returnDetected: false
    },
    { requireIdentityConfirmation: true, requireHeadDrift: true, requireBackgroundDrift: true }
  );
  assert.equal(result.passed, true);
  assert.equal(result.status, 'pass');
});

test('an excessive pre-lock drift remains blocking even if recomposition looks stable', () => {
  const metrics = assessLockedRegionMetrics(
    { maxHeadDrift: 0.22 },
    { maxHeadDrift: 0.005, maxBackgroundDrift: 0.02 },
    { maxCorrectableHeadDrift: 0.16 }
  );
  const result = evaluateGenerationQC(
    { ...metrics, identityConfirmed: true, returnDetected: false },
    { requireIdentityConfirmation: true, requireHeadDrift: true, requireBackgroundDrift: true }
  );
  assert.equal(metrics.correctionTooLarge, true);
  assert.equal(result.passed, false);
  assert.ok(result.hardFailures.includes('head-correction'));
});
