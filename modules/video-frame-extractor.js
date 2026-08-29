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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ensureMetadata(video) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0) return;
  await once(video, 'loadedmetadata');
}

async function waitForDecodedFrame(video, targetTime) {
  // iPad/Safari peut annoncer `seeked` avant d'avoir remplacé l'image décodée.
  // On attend donc un requestVideoFrameCallback dont mediaTime correspond
  // réellement à la cible. L'ancienne version résolvait trop tôt si le premier
  // callback pointait encore sur l'ancien frame.
  if (typeof video.requestVideoFrameCallback === 'function') {
    await new Promise(resolve => {
      const started = performance.now();
      let stopped = false;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        resolve();
      };
      const poll = () => {
        if (stopped) return;
        if (performance.now() - started > 1400) return finish();
        video.requestVideoFrameCallback((_now, meta) => {
          if (stopped) return;
          const mediaTime = Number(meta?.mediaTime);
          if (Number.isFinite(mediaTime) && Math.abs(mediaTime - targetTime) <= 0.055) {
            finish();
          } else {
            requestAnimationFrame(poll);
          }
        });
      };
      poll();
    });
  } else {
    // Repli pour navigateurs sans requestVideoFrameCallback.
    await delay(140);
  }
}

async function seek(video, time) {
  const duration = Number(video.duration) || 0;
  const target = Math.max(0, Math.min(Math.max(0, duration - 0.001), time));
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

function fingerprintCanvas(ctx, width, height) {
  // Empreinte légère d'un quadrillage de pixels. Elle sert uniquement à détecter
  // le cas Safari où le même frame décodé est recopié plusieurs fois.
  const stepsX = 12;
  const stepsY = 8;
  let h = 2166136261 >>> 0;
  for (let y = 0; y < stepsY; y++) {
    for (let x = 0; x < stepsX; x++) {
      const px = Math.min(width - 1, Math.round((x + 0.5) * width / stepsX));
      const py = Math.min(height - 1, Math.round((y + 0.5) * height / stepsY));
      const d = ctx.getImageData(px, py, 1, 1).data;
      for (let i = 0; i < 3; i++) {
        h ^= d[i];
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, '0');
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
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error('Canvas d’extraction indisponible.');

  const wasPaused = video.paused;
  const originalTime = Number(video.currentTime) || 0;
  video.pause();
  const frames = [];
  let previousFingerprint = null;

  try {
    for (let i = 0; i < frameCount; i++) {
      const ratio = frameCount === 1 ? 0.5 : i / (frameCount - 1);
      const requestedTime = start + span * ratio;
      onProgress?.({ index: i, count: frameCount, time: requestedTime });

      let actualTime = requestedTime;
      let fingerprint = null;
      let duplicateRetry = 0;

      // Si Safari nous rend exactement le même frame que le précédent,
      // on attend puis on resélectionne la cible. Maximum 3 tentatives.
      do {
        actualTime = await seek(video, requestedTime);
        await delay(duplicateRetry ? 120 : 35);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        fingerprint = fingerprintCanvas(ctx, canvas.width, canvas.height);
        if (fingerprint !== previousFingerprint || i === 0) break;
        duplicateRetry++;
        await delay(100 + duplicateRetry * 80);
      } while (duplicateRetry < 3);

      const blob = await canvasToBlob(canvas, type, quality);
      const url = URL.createObjectURL(blob);
      frames.push({
        index: i + 1,
        time: actualTime,
        requestedTime,
        fingerprint,
        duplicateRetry,
        blob,
        url,
        width: canvas.width,
        height: canvas.height
      });
      previousFingerprint = fingerprint;
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
    distinctFingerprints: new Set(frames.map(frame => frame.fingerprint)).size,
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
