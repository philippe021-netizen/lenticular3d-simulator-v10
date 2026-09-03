import {
  extractVideoFrames as baseExtractVideoFrames,
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
} from './video-frame-extractor.js?v=407';

/**
 * HappyHolo PixVerse short-clip extractor.
 * PixVerse actions are generated at 2 s. For these clips we deliberately
 * ignore the unstable first/last ~150 ms and spread the 9 lenticular views
 * across the whole useful motion (about 0.15 s -> 1.85 s on a 2.00 s clip).
 */
export async function extractVideoFrames(video, options = {}) {
  const duration = Number(video?.duration);
  const shortPixVerseClip = Number.isFinite(duration) && duration > 0 && duration <= 2.35;

  const tuned = shortPixVerseClip
    ? {
        edgePaddingSeconds: 0.15,
        progressiveOnly: false,
        progressiveEndRatio: 1,
        ...options,
        // Keep the 2 s profile authoritative even when older callers still
        // carry the previous progressive-only defaults.
        edgePaddingSeconds: 0.15,
        progressiveOnly: false,
        progressiveEndRatio: 1
      }
    : options;

  const result = await baseExtractVideoFrames(video, tuned);
  if (shortPixVerseClip) {
    result.extractionWindow = {
      ...result.extractionWindow,
      mode: 'pixverse-2s-full-motion',
      targetDuration: 2,
      expectedStart: 0.15,
      expectedEnd: Math.max(0.15, duration - 0.15)
    };
  }
  return result;
}

export {
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
};
