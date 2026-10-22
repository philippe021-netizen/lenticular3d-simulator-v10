import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePixVerseUpload, MAX_PIXVERSE_UPLOAD_BYTES } from '../modules/pixverse-upload-image.js';

test('small original is passed through without changing its pixels', async () => {
  const file = new Blob(['photo'], { type: 'image/png' });
  assert.equal(await preparePixVerseUpload(file), file);
});

test('large print image becomes a bounded copy, with framing preserved and original untouched', async () => {
  const file = new Blob([new Uint8Array(6000000)], { type: 'image/png' });
  let closed = false;
  const draws = [];
  const canvas = { getContext: () => ({ fillRect() {}, drawImage: (...args) => draws.push(args) }),
    toBlob: callback => callback(new Blob([new Uint8Array(200000)], { type: 'image/jpeg' })) };
  const result = await preparePixVerseUpload(file, {
    decode: async () => ({ width: 3543, height: 2362, close() { closed = true; } }),
    makeCanvas: () => canvas
  });
  assert.ok(result.size <= MAX_PIXVERSE_UPLOAD_BYTES);
  assert.equal(result.type, 'image/jpeg');
  assert.deepEqual([canvas.width, canvas.height], [2048, 1365]);
  assert.equal(draws[0].length, 5);
  assert.equal(file.size, 6000000);
  assert.equal(closed, true);
});

test('failed encoding stops before upload instead of sending oversized original', async () => {
  const file = new Blob([new Uint8Array(6000000)]);
  await assert.rejects(preparePixVerseUpload(file, {
    decode: async () => ({ width: 100, height: 100, close() {} }),
    makeCanvas: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: cb => cb(null) })
  }), /préparer/);
});
