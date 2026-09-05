import {
  extractVideoFrames as baseExtractVideoFrames,
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
} from './video-frame-extractor.js?v=409';

function makeVideo(src) {
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.playsInline = true;
  v.crossOrigin = 'anonymous';
  v.style.display = 'none';
  v.src = src;
  document.body.appendChild(v);
  return v;
}

function destroyVideo(v) {
  if (!v) return;
  try { v.pause(); } catch (_) {}
  v.removeAttribute('src');
  try { v.load(); } catch (_) {}
  v.remove();
}

async function extractFromVideo(video, options = {}) {
  const duration = Number(video?.duration);
  const shortPixVerseClip = Number.isFinite(duration) && duration > 0 && duration <= 2.35;
  const tuned = shortPixVerseClip
    ? {
        ...options,
        count: options.count ?? 9,
        edgePaddingSeconds: 0.04,
        actionAware: true,
        progressiveOnly: true,
        analysisSamples: Math.max(36, Number(options.analysisSamples) || 0)
      }
    : options;

  const result = await baseExtractVideoFrames(video, tuned);
  const finalDuration = Number(video?.duration);
  const finalShort = Number.isFinite(finalDuration) && finalDuration > 0 && finalDuration <= 2.35;
  if (finalShort) {
    result.extractionWindow = {
      ...result.extractionWindow,
      mode: 'pixverse-2s-action-targeted-progressive',
      targetDuration: 2,
      calculatedBeforeExtraction: true,
      progressiveOnly: true,
      actionAware: true
    };
  }
  return result;
}

/**
 * HappyHolo PixVerse short-clip extractor.
 * Accepte soit un HTMLVideoElement, soit une URL PixVerse.
 * Pour une URL, on tente d'abord le CDN PixVerse directement (CORS anonyme).
 * Si Safari/iPad refuse cette lecture, on retente automatiquement via le proxy HappyHolo.
 */
export async function extractVideoFrames(videoOrUrl, options = {}) {
  if (typeof videoOrUrl !== 'string') return extractFromVideo(videoOrUrl, options);

  const source = String(videoOrUrl || '').trim();
  if (!source) throw new Error('URL vidéo PixVerse manquante.');

  const sameOrigin = source.startsWith(location.origin) || source.startsWith('/');
  const candidates = sameOrigin
    ? [source]
    : [source, `/api/pixverse-video?url=${encodeURIComponent(source)}`];

  let lastError = null;
  for (const src of candidates) {
    let video = null;
    try {
      video = makeVideo(src);
      return await extractFromVideo(video, options);
    } catch (e) {
      lastError = e;
    } finally {
      destroyVideo(video);
    }
  }

  throw lastError || new Error('Lecture de la vidéo PixVerse impossible.');
}

export {
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
};
