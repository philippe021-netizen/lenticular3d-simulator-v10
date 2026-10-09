import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addPngPhysicalResolution,
  calibrationPitchValues,
  createPrintSpec,
  interlacePixelRows
} from '../modules/lenticular-print-core.js';

const views = Array.from({ length: 9 }, (_, index) => ({
  width: 16,
  height: 3,
  data: Uint8ClampedArray.from({ length: 16 * 3 * 4 }, (_, offset) =>
    offset % 4 === 0 ? index + 1 : offset % 4 === 3 ? 255 : 0)
}));
const solidViews = (width, height) => Array.from({ length: 9 }, (_, index) => ({
  width,
  height,
  data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, offset) =>
    offset % 4 === 0 ? index + 1 : offset % 4 === 3 ? 255 : 0)
}));

test('10 × 15 cm portrait and landscape keep exact 2:3 ratio at 600 DPI', () => {
  const portrait = createPrintSpec({ orientation: 'portrait' });
  const landscape = createPrintSpec({ orientation: 'landscape' });
  assert.deepEqual([portrait.width, portrait.height], [2362, 3543]);
  assert.deepEqual([landscape.width, landscape.height], [3543, 2362]);
  assert.deepEqual([portrait.targetWidthMm, portrait.targetHeightMm], [100, 150]);
  assert.deepEqual([landscape.targetWidthMm, landscape.targetHeightMm], [150, 100]);
});

test('pitch calibration is independent of nominal 50 and supports the future 60 LPI profile', () => {
  assert.equal(createPrintSpec({ nominalLpi: 50, calibratedLpi: 49 }).calibratedLpi, 49);
  assert.equal(createPrintSpec({ nominalLpi: 50, calibratedLpi: 51 }).calibratedLpi, 51);
  assert.equal(createPrintSpec({ nominalLpi: 60, calibratedLpi: 60.2 }).pixelsPerLens, 600 / 60.2);
  assert.throws(() => createPrintSpec({ nominalLpi: 50, calibratedLpi: 48.99 }), /pitch calibré/i);
});

test('nine equal RGBA views are interlaced by lens pitch without gaps', () => {
  const raster = interlacePixelRows(views, 16, 3, { dpi: 600, calibratedLpi: 50 });
  const pitchPx = 600 / 50;
  for (let x = 0; x < 16; x++) {
    const phase = ((x + 0.5) / pitchPx) % 1;
    const expectedView = Math.min(8, Math.floor(phase * 9));
    assert.equal(raster[(x * 4)], expectedView + 1, `pixel column ${x}`);
    assert.equal(raster[(16 + x) * 4], expectedView + 1, `row 1 column ${x}`);
  }
  assert.equal(raster.length, 16 * 3 * 4);
});

test('view order can be inverted and phase can be shifted independently', () => {
  const rowViews = solidViews(16, 1);
  const normal = interlacePixelRows(rowViews, 16, 1, { dpi: 600, calibratedLpi: 50 });
  const reversed = interlacePixelRows(rowViews, 16, 1, { dpi: 600, calibratedLpi: 50, reverseOrder: true });
  const shifted = interlacePixelRows(rowViews, 16, 1, { dpi: 600, calibratedLpi: 50, phasePx: 1 });
  const shiftedNegative = interlacePixelRows(rowViews, 16, 1, { dpi: 600, calibratedLpi: 50, phasePx: -6 });
  assert.equal(reversed[0], 9 - (normal[0] - 1));
  assert.notDeepEqual([...shifted], [...normal]);
  assert.ok([...shiftedNegative].every((channel, offset) => offset % 4 !== 0 || channel >= 1), 'negative phase must wrap without empty columns');
});

test('calibrated pitch changes the pixel-to-view sequence', () => {
  const rowViews = solidViews(16, 1);
  const at49 = interlacePixelRows(rowViews, 16, 1, { dpi: 600, calibratedLpi: 49 });
  const at51 = interlacePixelRows(rowViews, 16, 1, { dpi: 600, calibratedLpi: 51 });
  assert.notDeepEqual([...at49], [...at51]);
});

test('horizontal lens orientation uses the vertical axis and keeps pitch continuous across row strips', () => {
  const tallViews = solidViews(1, 16);
  const full = interlacePixelRows(tallViews, 1, 16, { dpi: 600, calibratedLpi: 50, lensOrientation: 'horizontal' });
  const first = interlacePixelRows(tallViews.map(view => ({ ...view, height: 7, data: view.data.slice(0, 7 * 4) })), 1, 7, { dpi: 600, calibratedLpi: 50, lensOrientation: 'horizontal' });
  const second = interlacePixelRows(tallViews.map(view => ({ ...view, height: 9, data: view.data.slice(7 * 4) })), 1, 9, { dpi: 600, calibratedLpi: 50, lensOrientation: 'horizontal', axisOffsetPx: 7 });
  assert.deepEqual([...new Uint8Array([...first, ...second])], [...full]);
  assert.ok([...full].filter((_, offset) => offset % 4 === 0).every(value => value >= 1 && value <= 9));
});

test('calibration chart starts with 11 candidates at 0.1 LPI intervals', () => {
  assert.deepEqual(calibrationPitchValues(), [49.5, 49.6, 49.7, 49.8, 49.9, 50, 50.1, 50.2, 50.3, 50.4, 50.5]);
});

test('PNG receives a standards-compliant physical-resolution chunk', () => {
  const input = new Uint8Array(33);
  input.set([137, 80, 78, 71, 13, 10, 26, 10]);
  input.set([0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 16, 0, 0, 0, 3], 8);
  const output = addPngPhysicalResolution(input, 600);
  assert.equal(output.length, input.length + 21);
  assert.deepEqual([...output.slice(37, 41)], [112, 72, 89, 115]); // pHYs
  const ppmX = new DataView(output.buffer, output.byteOffset + 41, 4).getUint32(0, false);
  const ppmY = new DataView(output.buffer, output.byteOffset + 45, 4).getUint32(0, false);
  assert.equal(ppmX, 23622);
  assert.equal(ppmY, 23622);
});
