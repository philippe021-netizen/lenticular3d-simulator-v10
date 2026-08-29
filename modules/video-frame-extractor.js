function once(target, event) {
  return new Promise((resolve, reject) => {
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`Erreur vidéo pendant ${event}.`)); };
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

async function ensureMetadata(video) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0) return;
  await once(video, 'loadedmetadata');
}

async function seek(video, time) {
  const target = Math.max(0, Math.min(Number(video.duration) || 0, time));
  if (Math.abs(video.currentTime - target) < 0.002) return;
  video.currentTime = target;
  await once(video, 'seeked');
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.96) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Impossible de créer une vue extraite.')), type, quality);
  });
}

export async function extractVideoFrames(video, {
  count = 9,
  edgePaddingSeconds = 0.06,
  type = 'image/jpeg',
  quality = 0.96,
  onProgress
} = {}) {
  if (!video) throw new Error('Vidéo PixVerse introuvable.');
  await ensureMetadata(video);

  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durée vidéo PixVerse invalide.');
  if (!video.videoWidth || !video.videoHeight) throw new Error('Dimensions vidéo PixVerse indisponibles.');

  const frameCount = Math.max(2, Math.round(count));
  const pad = Math.min(Math.max(0, edgePaddingSeconds), duration * 0.15);
  const start = pad;
  const end = Math.max(start, duration - pad);
  const span = Math.max(0, end - start);

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas d’extraction indisponible.');

  const wasPaused = video.paused;
  video.pause();
  const frames = [];

  try {
    for (let i = 0; i < frameCount; i++) {
      const ratio = frameCount === 1 ? 0.5 : i / (frameCount - 1);
      const time = start + span * ratio;
      onProgress?.({ index: i, count: frameCount, time });
      await seek(video, time);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, type, quality);
      const url = URL.createObjectURL(blob);
      frames.push({ index: i + 1, time, blob, url, width: canvas.width, height: canvas.height });
    }
  } finally {
    try { await seek(video, start); } catch (_) {}
    if (!wasPaused) {
      try { await video.play(); } catch (_) {}
    }
  }

  return {
    duration,
    width: canvas.width,
    height: canvas.height,
    frames,
    revoke() {
      frames.forEach(frame => URL.revokeObjectURL(frame.url));
    }
  };
}

export function downloadExtractedFrame(frame, prefix = 'happyholo-pixverse') {
  const a = document.createElement('a');
  a.href = frame.url;
  a.download = `${prefix}-vue-${String(frame.index).padStart(2, '0')}.jpg`;
  a.click();
}
