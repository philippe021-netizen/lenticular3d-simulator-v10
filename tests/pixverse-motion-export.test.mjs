import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMotionManifest, assertMotionExportable } from '../modules/pixverse-zip-bridge.js';

test('motion manifest is exactly nine views at 60 LPI', () => {
  const manifest = buildMotionManifest({
    action: { id: 'heart_hands', guide: { url: './heart.mp4', sha256: 'abc' } },
    selection: { frames: Array.from({ length: 9 }, (_, index) => ({ time: index / 4, progress: index / 8, reasons: ['visual-progress-quantile'] })) },
    job: { modeUsed: 'mimic', videoId: 77 },
    qc: { grade: 'green' },
    stabilization: { transforms: [] }
  });
  assert.equal(manifest.lpi, 60);
  assert.equal(manifest.effectType, 'motion');
  assert.equal(manifest.views.length, 9);
  assert.notEqual(manifest.pipeline, 'depth-50-lpi');
  assert.equal(manifest.pixverse.mode, 'mimic');
});

test('red QC blocks production ZIP', () => {
  assert.throws(() => assertMotionExportable({ grade: 'red' }), /QC rouge/);
});

test('manifest rejects any count other than nine', () => {
  assert.throws(() => buildMotionManifest({ action: {}, job: {}, selection: { frames: [] }, qc: { grade: 'green' } }), /9 vues/);
});
