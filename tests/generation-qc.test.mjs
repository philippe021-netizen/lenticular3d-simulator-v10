import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gradeGeneration } from '../modules/generation-qc.js';

const thresholds = { maxSceneCut: 0.18, maxReverseRatio: 0.12, maxCameraShift: 0.025, maxAdjacentJump: 0.22 };

test('Fusion takeover is red', () => {
  const report = gradeGeneration({ sceneCut: 0.8473, reversalRatio: 0.01, availableMetrics: [] }, thresholds, []);
  assert.equal(report.grade, 'red');
  assert.match(report.reasons.join(' '), /scène/i);
});

test('recoverable camera drift is orange', () => {
  const report = gradeGeneration({ sceneCut: 0.02, reversalRatio: 0.01, cameraShift: 0.04, correctedCameraShift: 0.01, availableMetrics: [] }, thresholds, []);
  assert.equal(report.grade, 'orange');
  assert.equal(report.exportAllowed, true);
});

test('missing required hand landmarks cannot be green', () => {
  const report = gradeGeneration({ sceneCut: 0.02, reversalRatio: 0.01, availableMetrics: ['sceneCut'] }, thresholds, ['handIntegrity']);
  assert.equal(report.grade, 'red');
  assert.match(report.reasons.join(' '), /handIntegrity/);
});

test('an oversized adjacent jump is red', () => {
  const qc = gradeGeneration({
    maxAdjacentJump: .31,
    availableMetrics: ['temporalContinuity']
  });
  assert.equal(qc.grade, 'red');
  assert.match(qc.reasons.join(' '), /Discontinuité temporelle/);
});

test('audited Fusion fixture is red while Mimic passes scene continuity', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/pixverse-video-metrics.json', import.meta.url), 'utf8'));
  assert.equal(gradeGeneration({ sceneCut: fixture.fusion.maxSceneCut, reversalRatio: 0 }, thresholds).grade, 'red');
  assert.notEqual(gradeGeneration({ sceneCut: fixture.mimic.maxSceneCut, reversalRatio: 0 }, thresholds).grade, 'red');
});
