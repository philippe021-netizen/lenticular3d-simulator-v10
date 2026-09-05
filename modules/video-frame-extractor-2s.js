import {
  extractVideoFrames as baseExtractVideoFrames,
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
} from './video-frame-extractor.js?v=409';

/**
 * HappyHolo PixVerse short-clip extractor.
 * Accepte soit un HTMLVideoElement, soit une URL vidéo PixVerse.
 * Dans le second cas on crée un élément vidéo local et on passe par le proxy
 * HappyHolo pour éviter les problèmes CORS/Safari avant l'extraction des 9 vues.
 */
export async function extractVideoFrames(videoOrUrl, options = {}) {
  let video = videoOrUrl;
  let ownedVideo = null;

  if (typeof videoOrUrl === 'string') {
    const source = String(videoOrUrl || '').trim();
    if (!source) throw new Error('URL vidéo PixVerse manquante.');
    ownedVideo = document.createElement('video');
    ownedVideo.preload = 'auto';
    ownedVideo.muted = true;
    ownedVideo.playsInline = true;
    ownedVideo.crossOrigin = 'anonymous';
    ownedVideo.style.display = 'none';
    const sameOrigin = source.startsWith(location.origin) || source.startsWith('/');
    ownedVideo.src = sameOrigin ? source : `/api/pixverse-video?url=${encodeURIComponent(source)}`;
    document.body.appendChild(ownedVideo);
    video = ownedVideo;
  }

  try {
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
  } finally {
    if (ownedVideo) {
      try { ownedVideo.pause(); } catch (_) {}
      ownedVideo.removeAttribute('src');
      try { ownedVideo.load(); } catch (_) {}
      ownedVideo.remove();
    }
  }
}

export {
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
};
