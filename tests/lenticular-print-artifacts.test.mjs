import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const examples = new URL('../docs/lenticular-print/examples/', import.meta.url);
async function pngInfo(filename) {
  const bytes = await readFile(new URL(filename, examples));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  let physical = null;
  let offset = 8;
  let hasEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'pHYs') {
      physical = {
        x: bytes.readUInt32BE(offset + 8),
        y: bytes.readUInt32BE(offset + 12),
        unit: bytes[offset + 16]
      };
    }
    offset += 12 + length;
    if (type === 'IEND') { hasEnd = true; break; }
  }
  return { width, height, physical, hasEnd };
}

test('example interlaced PNG reopens at 10 × 15 raster dimensions with 600 DPI metadata', async () => {
  const png = await pngInfo('microplayer-10x15-50lpi-demo-interlaced.png');
  assert.deepEqual([png.width, png.height], [2362, 3543]);
  assert.deepEqual(png.physical, { x: 23622, y: 23622, unit: 1 });
  assert.equal(png.hasEnd, true);
});

test('calibration sheet has 11 labelled pitch values and a 600 DPI 15 × 10 cm raster', async () => {
  const png = await pngInfo('microplayer-calibration-50lpi-49.5-to-50.5.png');
  assert.deepEqual([png.width, png.height], [3543, 2362]);
  assert.deepEqual(png.physical, { x: 23622, y: 23622, unit: 1 });
  assert.equal(png.hasEnd, true);
  const manifest = JSON.parse(await readFile(new URL('microplayer-calibration-50lpi-parameters.json', examples), 'utf8'));
  assert.deepEqual(manifest.testPitchLpi, [49.5, 49.6, 49.7, 49.8, 49.9, 50, 50.1, 50.2, 50.3, 50.4, 50.5]);
});

test('exact-size PDF carries lossless RGB and an exact physical page box', async () => {
  const pdf = await readFile(new URL('microplayer-10x15-50lpi-demo-exact.pdf', examples), 'latin1');
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/MediaBox \[0 0 283\.4645669 425\.1968504\]/);
  assert.match(pdf, /\/Filter \/FlateDecode/);
  assert.match(pdf, /\/Predictor 1 \/Colors 3 \/BitsPerComponent 8 \/Columns 2362/);
});
