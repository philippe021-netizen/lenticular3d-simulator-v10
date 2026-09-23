import {
  uploadPixVerseImage,
  uploadPixVerseMedia,
  waitForPixVerse,
  proxiedPixVerseVideoUrl
} from './pixverse-client.js';

const MIMIC_RATES = Object.freeze({ '360p': 9, '540p': 10, '720p': 12 });

async function readJson(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.error || data?.ErrMsg || `Erreur HTTP ${response.status}`);
  if (Number(data?.ErrCode) && Number(data.ErrCode) !== 0) {
    throw new Error(data?.ErrMsg || `Erreur PixVerse ${data.ErrCode}`);
  }
  return data;
}

export function estimateMimicCredits({ quality = '540p', duration = 1 } = {}) {
  const rate = MIMIC_RATES[quality];
  if (!rate) return null;
  const seconds = Math.max(1, Number(duration) || 1);
  return Math.ceil(seconds * rate);
}

export function validateMimicInputs(photoFile, guideFile, { quality = '540p' } = {}) {
  if (!photoFile) throw new Error('Photo source manquante.');
  if (!guideFile) throw new Error('Vidéo guide manquante.');
  if (!MIMIC_RATES[quality]) throw new Error('Qualité Mimic non supportée. Utilise 360p, 540p ou 720p.');

  const imageType = String(photoFile.type || '').toLowerCase();
  if (imageType && !['image/png', 'image/jpeg', 'image/webp'].includes(imageType)) {
    throw new Error('Format photo non supporté par PixVerse.');
  }

  const videoType = String(guideFile.type || '').toLowerCase();
  if (videoType && !['video/mp4', 'video/quicktime', 'video/mov'].includes(videoType)) {
    throw new Error('La vidéo guide Mimic doit être en MP4 ou MOV.');
  }

  if (Number(guideFile.size) > 100 * 1024 * 1024) {
    throw new Error('La vidéo guide dépasse la limite Mimic de 100 Mo.');
  }
  return true;
}

export async function getLocalVideoDuration(file) {
  if (!file || typeof document === 'undefined' || typeof URL === 'undefined') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const duration = await new Promise((resolve, reject) => {
      const done = value => { video.onloadedmetadata = null; video.onerror = null; resolve(value); };
      video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
      video.onerror = () => reject(new Error('Impossible de lire la durée de la vidéo guide.'));
      video.src = objectUrl;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function createPixVerseMimic({ imgId, videoMediaId, sourceVideoId, quality = '540p' }) {
  const body = { mode: 'mimic', img_id: imgId, quality };
  if (sourceVideoId) body.source_video_id = sourceVideoId;
  else body.video_media_id = videoMediaId;

  const response = await fetch('/api/pixverse-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await readJson(response);
  const videoId = data?.Resp?.video_id ?? data?.video_id ?? data?.data?.video_id;
  if (!videoId) throw new Error('PixVerse Mimic n’a pas renvoyé de video_id.');
  return { videoId, raw: data, chargedCredits: Number(data?.Resp?.credit ?? 0) || null };
}

export async function runPixVerseMimic(photoFile, guideFile, {
  quality = '540p',
  onStatus,
  timeoutMs = 240000
} = {}) {
  validateMimicInputs(photoFile, guideFile, { quality });

  onStatus?.({ step: 'upload-photo' });
  const { imgId } = await uploadPixVerseImage(photoFile);

  onStatus?.({ step: 'upload-guide' });
  const { mediaId } = await uploadPixVerseMedia(guideFile);

  onStatus?.({ step: 'create', mode: 'mimic' });
  const created = await createPixVerseMimic({ imgId, videoMediaId: mediaId, quality });

  onStatus?.({ step: 'processing', videoId: created.videoId, mode: 'mimic' });
  const result = await waitForPixVerse(created.videoId, {
    timeoutMs,
    onStatus: response => onStatus?.({ step: 'processing', videoId: created.videoId, mode: 'mimic', response })
  });

  const videoUrl = proxiedPixVerseVideoUrl(result.url, created.videoId);
  const duration = await getLocalVideoDuration(guideFile).catch(() => null);
  const estimatedCredits = created.chargedCredits ?? estimateMimicCredits({ quality, duration: duration || 1 });

  const output = {
    modeUsed: 'mimic',
    videoId: created.videoId,
    imgId,
    guideMediaId: mediaId,
    sourceUrl: result.url,
    videoUrl,
    quality,
    guideDuration: duration,
    estimatedCredits,
    createResponse: created.raw,
    response: result.raw
  };
  onStatus?.({ step: 'done', ...output });
  return output;
}
