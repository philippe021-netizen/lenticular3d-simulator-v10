import assert from 'node:assert/strict';
import test from 'node:test';
import { PRINTER_PRESETS, evaluatePrintSetup } from '../modules/microplayer-print-planner.js';

test('Canon and Epson keep distinct manufacturer maximum droplet resolutions', () => {
  const canon = PRINTER_PRESETS.find(p => p.id === 'canon-pro-200s');
  const epson = PRINTER_PRESETS.find(p => p.id === 'epson-et-2850');
  assert.deepEqual([canon.maxPrinterDpiX, canon.maxPrinterDpiY], [4800, 2400]);
  assert.deepEqual([epson.maxPrinterDpiX, epson.maxPrinterDpiY], [5760, 1440]);
});

test('600 DPI and 50 LPI give 12 source pixels per lenticule', () => {
  const plan = evaluatePrintSetup({ printerId: 'canon-pro-200s', rasterDpi: 600, nominalLpi: 50, calibratedLpi: 50, widthMm: 150, heightMm: 100 });
  assert.equal(plan.pixelsPerLens, 12);
  assert.equal(plan.candidates.find(x => x.viewCount === 9).pixelsPerView, 12 / 9);
  assert.equal(plan.existingEngineSupportsNineViews, true);
});

test('at 1440/60 exactly 8 and 12 views fit integer stripes, at 1440/50 not', () => {
  const exact = evaluatePrintSetup({ printerId: 'roland-custom', rasterDpi: 1440, nominalLpi: 60, calibratedLpi: 60 });
  assert.equal(exact.pixelsPerLens, 24);
  assert.equal(exact.candidates.find(x => x.viewCount === 8).exactIntegerStripes, true);
  assert.equal(exact.candidates.find(x => x.viewCount === 12).exactIntegerStripes, true);
  const fractional = evaluatePrintSetup({ printerId: 'roland-custom', rasterDpi: 1440, nominalLpi: 50, calibratedLpi: 50 });
  assert.ok(Math.abs(fractional.pixelsPerLens - 28.8) < 1e-10);
  assert.ok(fractional.candidates.every(x => !x.exactIntegerStripes));
});

test('calibrated pitch is used, not nominal material LPI', () => {
  const result = evaluatePrintSetup({ calibratedLpi: 50.2, nominalLpi: 50, rasterDpi: 600 });
  assert.equal(result.pixelsPerLens, 600 / 50.2);
  assert.equal(result.candidates.find(x => x.viewCount === 9).exactIntegerStripes, false);
});

test('high resolution A4 warns about memory and does not promise legacy support', () => {
  const big = evaluatePrintSetup({ printerId: 'roland-custom', rasterDpi: 1440, nominalLpi: 60, calibratedLpi: 60, widthMm: 210, heightMm: 297 });
  assert.ok(big.totalPixels > 100_000_000);
  assert.ok(big.recommendations.some(x => x.includes('mémoire')));
  assert.equal(big.existingEngineSupportsNineViews, false);
});

test('interlacing axis follows the lens direction', () => {
  assert.equal(evaluatePrintSetup({ lensOrientation: 'vertical' }).axisOfInterlace, 'horizontal (X)');
  assert.equal(evaluatePrintSetup({ lensOrientation: 'horizontal' }).axisOfInterlace, 'vertical (Y)');
});

test('invalid numerical and physical inputs are refused', () => {
  assert.throws(() => evaluatePrintSetup({ rasterDpi: 0 }), /résolution raster ou pitch/i);
  assert.throws(() => evaluatePrintSetup({ widthMm: -1 }), /dimensions physiques/i);
  assert.throws(() => evaluatePrintSetup({ calibratedLpi: Number.NaN }), /numériques/i);
});
