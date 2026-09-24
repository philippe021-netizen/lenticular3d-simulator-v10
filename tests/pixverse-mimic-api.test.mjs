import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPixVerseRequest } from '../api/pixverse-create.js';

test('builds the dedicated Mimic endpoint payload', () => {
  assert.deepEqual(buildPixVerseRequest('mimic', {
    img_id: 12,
    video_media_id: 34,
    quality: '720p'
  }), {
    mode: 'mimic',
    endpoint: '/video/mimic/generate',
    payload: { img_id: 12, video_media_id: 34, quality: '720p' }
  });
});

test('rejects a Mimic request without a guide', () => {
  assert.throws(
    () => buildPixVerseRequest('mimic', { img_id: 12, quality: '720p' }),
    /video_media_id/
  );
});
