import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhotoForInfiniSplat } from '../modules/photo-input.js';

test('le JPEG iOS déjà compatible est envoyé sans réencodage', async () => {
  const photo = { name: 'portrait.jpg', type: 'image/jpeg' };
  assert.equal(await normalizePhotoForInfiniSplat(photo, {}), photo);
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
