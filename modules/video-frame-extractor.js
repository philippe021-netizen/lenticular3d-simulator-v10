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

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function ensureMetadata(video) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0) return;
  await once(video, 'loadedmetadata');
}

async function waitForDecodedFrame(video, targetTime) {
  // Safari/iPadOS peut déclencher `seeked` avant que la nouvelle image vidéo
  // soit réellement décodée. requestVideoFrameCallback attend le frame affichable.
  if (typeof video.requestVideoFrameCallback === 'function') {
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const timeout = setTimeout(finish, 800);
      video.requestVideoFrameCallback((_now, meta) => {
        clearTimeout(timeout);
        // mediaTime est le temps du frame effectivement décodé.
        if (Number.isFinite(meta?.mediaTime) && Math.abs(meta.mediaTime - targetTime) > 0.08) {
          requestAnimationFrame(finish);
        } else {
          finish();
        }
      });
    });
  } else {
    await nextFrame();
  }
}

async function seek(video, time) {
  const duration = Number(video.duration) || 0;
  const target = Math.max(0, Math.min(Math.max(0, duration - 0.001), time));

  // Toujours provoquer un vrai seek pour chaque vue. Sur Safari, réutiliser le
  // même currentTime peut laisser le buffer d'affichage sur l'ancien frame.
  const seeked = once(video, 'seeked');
  video.currentTime = target;
  await seeked;
  await waitForDecodedFrame(video, target);
  return target;
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.96) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Impossible de créer une vue extraite.')), type, quality);
  });
}

export async function extractVideoFrames(video, {
  count = 9,
  edgePaddingSeconds = 0.08,
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
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  if (!ctx) throw new Error('Canvas d’extraction indisponible.');

  const wasPaused = video.paused;
  const originalTime = Number(video.currentTime) || 0;
  video.pause();
  const frames = [];

  try {
    for (let i = 0; i < frameCount; i++) {
      const ratio = frameCount === 1 ? 0.5 : i / (frameCount - 1);
      const requestedTime = start + span * ratio;
      onProgress?.({ index: i, count: frameCount, time: requestedTime });
      const actualTime = await seek(video, requestedTime);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, type, quality);
      const url = URL.createObjectURL(blob);
      frames.push({ index: i + 1, time: actualTime, blob, url, width: canvas.width, height: canvas.height });
    }
  } finally {
    try { await seek(video, Math.min(originalTime, Math.max(0, duration - 0.001))); } catch (_) {}
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
