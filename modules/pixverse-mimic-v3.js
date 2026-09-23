import {
  uploadPixVerseImage,
  uploadPixVerseMedia,
  waitForPixVerse,
  proxiedPixVerseVideoUrl
} from './pixverse-client.js';

export const MIMIC_V3_POLICY = Object.freeze({
  mode: 'mimic',
  engine: 'PixVerse Motion Control / Mimic',
  outputViews: 9,
  lpi: 60,
  progression: 'A-to-B-no-return',
  identityReference: 'photo',
  motionReference: 'guide-video'
});

async function readJson(r) {
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data?.error || data?.ErrMsg || data?.message || `Erreur HTTP ${r.status}`);
  if (Number(data?.ErrCode) && Number(data.ErrCode) !== 0) {
    const code = Number(data.ErrCode);
    if (code === 701002) throw new Error('PixVerse Mimic ne détecte pas clairement le sujet dans la photo.');
    if (code === 701003) throw new Error('PixVerse Mimic ne détecte pas une personne principale exploitable dans la vidéo guide.');
    throw new Error(data?.ErrMsg || `Erreur PixVerse ${code}`);
  }
  return data;
}

export function validateMotionGuideFile(file) {
  if (!file) return { ok: false, reason: 'missing-guide' };
  const type = String(file.type || '').toLowerCase();
  const validType = ['video/mp4', 'video/quicktime', 'video/mov', 'video/webm'].includes(type)
    || /\.(mp4|mov|webm)$/i.test(file.name || '');
  if (!validType) return { ok: false, reason: 'unsupported-format' };
  if (Number(file.size) > 100 * 1024 * 1024) return { ok: false, reason: 'too-large' };
  return { ok: true };
}

export function buildMimicRequest({ imgId, videoMediaId, sourceVideoId, quality = '540p' }) {
  const request = {
    img_id: Number(imgId),
    quality: ['360p', '540p', '720p'].includes(quality) ? quality : '540p'
  };
  if (Number(videoMediaId) > 0) request.video_media_id = Number(videoMediaId);
  if (Number(sourceVideoId) > 0) request.source_video_id = Number(sourceVideoId);
  if (!Number.isInteger(request.img_id) || request.img_id <= 0) throw new Error('img_id Mimic invalide.');
  if (!request.video_media_id && !request.source_video_id) throw new Error('Référence vidéo Mimic manquante.');
  if (request.video_media_id && request.source_video_id) throw new Error('Références vidéo Mimic ambiguës.');
  return request;
}

export async function createMimicVideo(args) {
  const body = buildMimicRequest(args);
  const r = await fetch('/api/pixverse-mimic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await readJson(r);
  const videoId = data?.Resp?.video_id ?? data?.video_id ?? data?.data?.video_id;
  if (!Number(videoId)) throw new Error('PixVerse Mimic n’a pas renvoyé de video_id.');
  return { videoId: Number(videoId), raw: data };
}

export async function runMimicMotionGuide(photoFile, motionGuideFile, {
  quality = '540p',
  onStatus
} = {}) {
  if (!photoFile) throw new Error('Photo client manquante.');
  const guideCheck = validateMotionGuideFile(motionGuideFile);
  if (!guideCheck.ok) {
    const labels = {
      'missing-guide': 'Vidéo guide manquante.',
      'unsupported-format': 'Format de vidéo guide non pris en charge.',
      'too-large': 'Vidéo guide supérieure à 100 Mo.'
    };
    throw new Error(labels[guideCheck.reason] || 'Vidéo guide invalide.');
  }

  onStatus?.({ step: 'upload-photo' });
  const { imgId } = await uploadPixVerseImage(photoFile);
  onStatus?.({ step: 'upload-guide' });
  const { mediaId } = await uploadPixVerseMedia(motionGuideFile);

  onStatus?.({ step: 'create-mimic', imgId, mediaId });
  const { videoId, raw } = await createMimicVideo({ imgId, videoMediaId: mediaId, quality });

  onStatus?.({ step: 'processing', videoId });
  const result = await waitForPixVerse(videoId, {
    timeoutMs: 240000,
    onStatus: response => onStatus?.({ step: 'processing', videoId, response })
  });

  const videoUrl = proxiedPixVerseVideoUrl(result.url, videoId);
  onStatus?.({ step: 'done', videoId, videoUrl });
  return {
    videoId,
    imgId,
    videoMediaId: mediaId,
    quality,
    sourceUrl: result.url,
    videoUrl,
    createResponse: raw,
    response: result.raw,
    policy: MIMIC_V3_POLICY
  };
}
