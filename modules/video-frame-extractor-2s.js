import {
  extractVideoFrames as baseExtractVideoFrames,
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
} from './video-frame-extractor.js?v=407';

/**
 * HappyHolo PixVerse short-clip extractor.
 * PixVerse actions are generated at about 2 s, but the useful action can occupy
 * only a fraction of the clip. We therefore analyze the clip first, locate the
 * progressive action window, stop before any return/repetition, and only then
 * calculate the 9 lenticular views inside that useful window.
 */
export async function extractVideoFrames(video, options = {}) {
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
  if (shortPixVerseClip) {
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

export {
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
};
