import test from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateMimic, estimatePixVerseCredits } from '../modules/pixverse-client.js';

test('uploads photo and guide then creates Mimic with exact ids', async () => {
  const calls = [];
  const result = await orchestrateMimic({
    imageFile: { name: 'photo.jpg' }, guideFile: { name: 'heart.mp4' }, quality: '720p'
  }, {
    uploadImage: async () => ({ imgId: 11 }),
    uploadMedia: async () => ({ mediaId: 22 }),
    createVideo: async body => (calls.push(body), { videoId: 33 })
  });
  assert.equal(result.videoId, 33);
  assert.deepEqual(calls[0], { mode: 'mimic', imgId: 11, videoMediaId: 22, quality: '720p' });
});

test('Mimic credit estimate follows dedicated per-second rates', () => {
  assert.equal(estimatePixVerseCredits({ mode: 'mimic', quality: '720p', duration: 3 }), 36);
  assert.equal(estimatePixVerseCredits({ mode: 'mimic', quality: '540p', duration: 3 }), 30);
});

test('reuses a cached guide media id without uploading the guide again', async () => {
  let mediaUploads = 0;
  const result = await orchestrateMimic({
    imageFile: { name: 'photo.jpg' }, guideFile: { name: 'heart.mp4' }, guideMediaId: 22, quality: '720p'
  }, {
    uploadImage: async () => ({ imgId: 11 }),
    uploadMedia: async () => { mediaUploads++; return { mediaId: 99 }; },
    createVideo: async body => ({ videoId: 33, body })
  });
  assert.equal(mediaUploads, 0);
  assert.equal(result.body.videoMediaId, 22);
});
