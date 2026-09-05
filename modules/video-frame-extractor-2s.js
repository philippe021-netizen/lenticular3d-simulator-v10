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

async function fetchAsObjectUrl(src) {
  const r = await fetch(src, { cache: 'no-store' });
  if (!r.ok) {
    const msg = await r.text().catch(()=>'');
    throw new Error(`Chargement vidéo HTTP ${r.status}${msg ? ` — ${msg.slice(0,120)}` : ''}`);
  }
  const blob = await r.blob();
  if (!blob.size) throw new Error('Vidéo vide reçue depuis HappyHolo.');
  return URL.createObjectURL(blob);
}

/**
 * HappyHolo PixVerse short-clip extractor.
 * Pour une URL same-origin, on télécharge d'abord le MP4 complet puis on crée
 * un objectURL local. Safari lit alors loadedmetadata sur un fichier déjà présent,
 * et non sur un CDN PixVerse encore instable.
 */
export async function extractVideoFrames(videoOrUrl, options = {}) {
  if (typeof videoOrUrl !== 'string') return extractFromVideo(videoOrUrl, options);

  const source = String(videoOrUrl || '').trim();
  if (!source) throw new Error('URL vidéo PixVerse manquante.');

  const sameOrigin = source.startsWith(location.origin) || source.startsWith('/');
  const candidates = sameOrigin
    ? [source]
    : [`/api/pixverse-video?url=${encodeURIComponent(source)}`, source];

  let lastError = null;
  for (const src of candidates) {
    let video = null;
    let objectUrl = '';
    try {
      if (src.startsWith('/') || src.startsWith(location.origin)) {
        objectUrl = await fetchAsObjectUrl(src);
        video = makeVideo(objectUrl);
      } else {
        video = makeVideo(src);
        video.crossOrigin = 'anonymous';
      }
      return await extractFromVideo(video, options);
    } catch (e) {
      lastError = e;
    } finally {
      destroyVideo(video);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  throw lastError || new Error('Lecture de la vidéo PixVerse impossible.');
}

export {
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
};
