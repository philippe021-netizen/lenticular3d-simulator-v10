import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionExportManifest } from '../modules/pixverse-export.js';

const frames = Array.from({ length: 9 }, (_, i) => ({ index: i + 1, time: i / 8, blob: new Blob(['frame']) }));

test('creates a LentiPrint-compatible manifest with exact 01-to-09 production paths', () => {
  const manifest = createMotionExportManifest(frames, { passed: true }, { lpi: 60 });
  assert.equal(manifest.view_count, 9);
  assert.equal(manifest.view_order, 'left-to-right');
  assert.equal(manifest.view_files[0], 'views/view_01.png');
  assert.equal(manifest.view_files[8], 'views/view_09.png');
  assert.equal(manifest.lpi, 60);
});

test('refuses export when identity QC failed or nine sequential frames are unavailable', () => {
  assert.throws(() => createMotionExportManifest(frames, { passed: false }), /QC identité/i);
  assert.throws(() => createMotionExportManifest(frames.slice(0, 8), { passed: true }), /9 vues/i);
});
