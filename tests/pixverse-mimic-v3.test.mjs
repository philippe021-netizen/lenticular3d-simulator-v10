import assert from 'node:assert/strict';
import { buildMimicRequest, validateMotionGuideFile, MIMIC_V3_POLICY } from '../modules/pixverse-mimic-v3.js';

{
  const request = buildMimicRequest({ imgId: 12, videoMediaId: 34, quality: '720p' });
  assert.deepEqual(request, { img_id: 12, video_media_id: 34, quality: '720p' });
}
{
  const request = buildMimicRequest({ imgId: 12, sourceVideoId: 56, quality: '1080p' });
  assert.deepEqual(request, { img_id: 12, source_video_id: 56, quality: '540p' });
}
assert.throws(() => buildMimicRequest({ imgId: 12 }), /Référence vidéo Mimic manquante/);
assert.throws(() => buildMimicRequest({ imgId: 12, videoMediaId: 1, sourceVideoId: 2 }), /ambiguës/);

{
  const ok = validateMotionGuideFile({ name: 'guide.mp4', type: 'video/mp4', size: 2_000_000 });
  assert.equal(ok.ok, true);
}
{
  const bad = validateMotionGuideFile({ name: 'guide.avi', type: 'video/x-msvideo', size: 2_000_000 });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'unsupported-format');
}
{
  const bad = validateMotionGuideFile({ name: 'guide.mp4', type: 'video/mp4', size: 101 * 1024 * 1024 });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'too-large');
}

assert.equal(MIMIC_V3_POLICY.outputViews, 9);
assert.equal(MIMIC_V3_POLICY.lpi, 60);
assert.equal(MIMIC_V3_POLICY.progression, 'A-to-B-no-return');

console.log('pixverse mimic v3 tests: ok');
