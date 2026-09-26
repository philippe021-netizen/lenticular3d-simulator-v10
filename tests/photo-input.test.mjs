import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPhotoFrameMatch, normalizePhotoForInfiniSplat } from '../modules/photo-input.js';

test('réencode un JPEG iPhone en intégrant son orientation EXIF dans les pixels', async () => {
  const calls = [];
  const photo = { name: 'IMG_2805.jpeg', type: 'image/jpeg' };
  const bitmap = { width: 1536, height: 3024, close() { calls.push(['close']); } };
  class FakeFile {
    constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; }
  }
  const canvas = {
    getContext: () => ({ drawImage: (...args) => calls.push(['draw', ...args]) }),
    toBlob: (callback, type, quality) => {
      calls.push(['encode', type, quality]);
      callback(new Blob(['oriented jpeg'], { type }));
    }
  };
  const env = {
    createImageBitmap: async (...args) => { calls.push(['bitmap', ...args]); return bitmap; },
    File: FakeFile,
    document: { createElement: tag => { calls.push(['element', tag]); return canvas; } }
  };
  const result = await normalizePhotoForInfiniSplat(photo, env);

  assert.deepEqual(calls[0], ['bitmap', photo, { imageOrientation: 'from-image' }]);
  assert.equal(canvas.width, 1536);
  assert.equal(canvas.height, 3024);
  assert.deepEqual(calls.find(([name]) => name === 'draw'), ['draw', bitmap, 0, 0, 1536, 3024]);
  assert.deepEqual(calls.find(([name]) => name === 'encode'), ['encode', 'image/jpeg', 0.98]);
  assert.equal(result.name, 'IMG_2805.jpg');
  assert.equal(result.type, 'image/jpeg');
  assert.deepEqual(calls.at(-1), ['close']);
});

test('signale un scene.ply paysage issu d’une photo portrait sans cacher la perte de cadrage', () => {
  const result = assessPhotoFrameMatch({ width: 1152, height: 1536 }, { width: 1536, height: 1152 });
  assert.equal(result.warning, true);
  assert.match(result.message, /cadrage différent/i);
});

test('accepte des dimensions PLY différentes lorsque le ratio portrait est conservé', () => {
  const result = assessPhotoFrameMatch({ width: 1152, height: 1536 }, { width: 900, height: 1200 });
  assert.equal(result.warning, false);
});

test('HEIC retombe sur le décodeur Image natif si createImageBitmap échoue', async () => {
  const calls = [];
  class FakeImage {
    constructor() { this.naturalWidth = 120; this.naturalHeight = 80; }
    set src(value) { calls.push(['src', value]); queueMicrotask(() => this.onload()); }
  }
  class FakeFile {
    constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; }
  }
  const env = {
    createImageBitmap: async () => { throw new Error('HEIC unsupported by bitmap decoder'); },
    Image: FakeImage,
    File: FakeFile,
    URL: { createObjectURL: () => 'blob:photo', revokeObjectURL: value => calls.push(['revoke', value]) },
    document: { createElement: () => ({
      getContext: () => ({ drawImage: (...args) => calls.push(['draw', ...args]) }),
      toBlob: (callback, type) => callback(new Blob(['jpeg'], { type }))
    }) }
  };
  const result = await normalizePhotoForInfiniSplat({ name: 'portrait.HEIC', type: 'image/heic' }, env);
  assert.equal(result.name, 'portrait.jpg');
  assert.equal(result.type, 'image/jpeg');
  assert.deepEqual(calls.filter(([name]) => name === 'revoke'), [['revoke', 'blob:photo']]);
  assert.equal(calls.some(([name]) => name === 'draw'), true);
});
