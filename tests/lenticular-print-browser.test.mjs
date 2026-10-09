import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExactSizePdf,
  buildPrintManifest,
  calculateCropRect,
  calculateSafeArea,
  createRenderSignature,
  renderInterlacedPng,
  sortNineViewFiles
} from '../modules/lenticular-print-browser.js';

test('view files sort by two-digit view number and reject incomplete series', () => {
  const files = ['vue-09.png', 'vue-01.png', 'vue-08.png', 'vue-02.png', 'vue-07.png', 'vue-03.png', 'vue-06.png', 'vue-04.png', 'vue-05.png']
    .map(name => ({ name }));
  assert.deepEqual(sortNineViewFiles(files).map(file => file.name), Array.from({ length: 9 }, (_, i) => `vue-0${i + 1}.png`));
  assert.throws(() => sortNineViewFiles(files.slice(1)), /exactement 9/i);
  assert.throws(() => sortNineViewFiles([...files.slice(1), { name: 'vue-08-copy.png' }]), /unique/i);
});

test('shared crop keeps the print ratio and pan/zoom remain inside the source image', () => {
  const base = calculateCropRect(2400, 1600, 2 / 3);
  assert.ok(Math.abs(base.width / base.height - 2 / 3) < 0.000001);
  const zoomed = calculateCropRect(2400, 1600, 2 / 3, { zoom: 1.5, panX: 1, panY: -1 });
  assert.ok(zoomed.x >= 0 && zoomed.y >= 0);
  assert.ok(zoomed.x + zoomed.width <= 2400.0001);
  assert.ok(zoomed.y + zoomed.height <= 1600.0001);
  assert.ok(Math.abs(zoomed.width / zoomed.height - 2 / 3) < 0.000001);
});

test('safety guide is inset by 3 mm while the canvas edge remains the exact cut line', () => {
  const spec = { width: 2362, height: 3543, targetWidthMm: 100, targetHeightMm: 150 };
  assert.deepEqual(calculateSafeArea(spec), { left: 70.86, top: 70.86, right: 2291.14, bottom: 3472.14 });
});

test('view series rejects incompatible aspect ratios rather than applying different crops', async () => {
  const { validateSharedAspectRatio } = await import('../modules/lenticular-print-browser.js');
  const matching = Array.from({ length: 9 }, (_, index) => ({ naturalWidth: index ? 1200 : 2400, naturalHeight: index ? 800 : 1600 }));
  const mismatching = matching.map(image => ({ ...image }));
  mismatching[8] = { naturalWidth: 1600, naturalHeight: 1200 };
  assert.equal(validateSharedAspectRatio(matching), true);
  assert.throws(() => validateSharedAspectRatio(mismatching), /ratios différents/i);
});

test('strip renderer aborts when its generation is superseded', async () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
  try {
    await assert.rejects(renderInterlacedPng(
      Array.from({ length: 9 }, () => ({ naturalWidth: 2, naturalHeight: 3 })),
      { width: 2, height: 3, dpi: 600, calibratedLpi: 50, lensOrientation: 'vertical', phasePx: 0, reverseOrder: false },
      {}, () => {}, { getContext: () => ({}) }, () => false
    ), /superseded/i);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('render signature changes when pitch, orientation, order, or crop changes', () => {
  const base = { width: 2362, height: 3543, dpi: 600, nominalLpi: 50, calibratedLpi: 50, lensOrientation: 'vertical', phasePx: 0, reverseOrder: false };
  const crop = { zoom: 1, panX: 0, panY: 0 };
  const signature = createRenderSignature(base, crop);
  assert.equal(createRenderSignature({ ...base }, { ...crop }), signature);
  for (const change of [
    [{ ...base, calibratedLpi: 50.1 }, crop],
    [{ ...base, orientation: 'landscape' }, crop],
    [{ ...base, reverseOrder: true }, crop],
    [base, { ...crop, zoom: 1.2 }]
  ]) assert.notEqual(createRenderSignature(...change), signature);
});

test('manifest preserves exact physical target and calibrated print settings', () => {
  const manifest = buildPrintManifest({
    width: 3543, height: 2362, targetWidthMm: 150, targetHeightMm: 100,
    dpi: 600, nominalLpi: 50, calibratedLpi: 50.13,
    lensOrientation: 'vertical', phasePx: 0.25, reverseOrder: true,
    viewCount: 9, orientation: 'landscape'
  }, { viewOrder: [9, 8, 7, 6, 5, 4, 3, 2, 1], sourceNames: ['vue-01.png'] });
  assert.equal(manifest.physicalSize.widthMm, 150);
  assert.equal(manifest.physicalSize.heightMm, 100);
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.aspectRatioLabel, '3:2');
  assert.equal(manifest.lpi.nominal, 50);
  assert.equal(manifest.lpi.calibrated, 50.13);
  assert.equal(manifest.viewCount, 9);
  assert.deepEqual(manifest.viewOrder, [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.match(manifest.generatedAt, /^20\d\d-/);
});

test('exact-size lossless PDF uses a physical 100 × 150 mm page without scaling the ratio', () => {
  const pdf = buildExactSizePdf(new Uint8Array([1, 2, 3, 4]), {
    pixelWidth: 2362, pixelHeight: 3543, widthMm: 100, heightMm: 150
  });
  const text = new TextDecoder().decode(pdf);
  assert.match(text, /\/MediaBox \[0 0 283\.4645669 425\.1968504\]/);
  assert.match(text, /\/Width 2362 \/Height 3543/);
  assert.match(text, /\/Filter \/FlateDecode/);
  assert.match(text, /\/Predictor 1 \/Colors 3 \/BitsPerComponent 8 \/Columns 2362/);
});
