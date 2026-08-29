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

let pixversePreviewTimer = null;
let pixversePreviewFrames = null;
let pixversePreviewIndex = 0;
let pixversePreviewDirection = 1;
let pixversePreviewEnabled = false;

function simulatorTarget() {
  const iframe = document.getElementById('hhApp');
  const doc = iframe?.contentDocument;
  const supportCanvas = doc?.getElementById('supportCanvas');
  const imageWindow = supportCanvas?.parentElement;
  return { doc, imageWindow };
}

function ensurePixVersePreviewControls() {
  const { doc } = simulatorTarget();
  if (!doc) return null;
  let btn = doc.getElementById('pixverseSimulatorToggle');
  if (btn) return btn;
  const supportControls = doc.querySelector('.support-controls');
  if (!supportControls) return null;
  btn = doc.createElement('button');
  btn.id = 'pixverseSimulatorToggle';
  btn.type = 'button';
  btn.className = 'secondary';
  btn.style.width = '100%';
  btn.style.marginTop = '8px';
  btn.textContent = 'Aperçu PixVerse : indisponible';
  btn.disabled = true;
  supportControls.appendChild(btn);
  btn.addEventListener('click', () => {
    if (!pixversePreviewFrames?.length) return;
    if (pixversePreviewEnabled) stopPixVerseSimulatorPreview(false);
    else showPixVerseFramesInSimulator(pixversePreviewFrames);
  });
  return btn;
}

function ensurePixVerseOverlay() {
  const { doc, imageWindow } = simulatorTarget();
  if (!doc || !imageWindow) return null;
  if (getComputedStyle(imageWindow).position === 'static') imageWindow.style.position = 'relative';
  let img = doc.getElementById('pixverseSimulatorImage');
  if (!img) {
    img = doc.createElement('img');
    img.id = 'pixverseSimulatorImage';
    Object.assign(img.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      objectFit: 'cover', objectPosition: 'center', display: 'none',
      zIndex: '20', pointerEvents: 'none', borderRadius: 'inherit'
    });
    imageWindow.appendChild(img);
  }
  let badge = doc.getElementById('pixverseSimulatorBadge');
  if (!badge) {
    badge = doc.createElement('div');
    badge.id = 'pixverseSimulatorBadge';
    Object.assign(badge.style, {
      position: 'absolute', left: '8px', bottom: '8px', zIndex: '21',
      padding: '4px 7px', borderRadius: '999px', background: 'rgba(0,0,0,.72)',
      color: '#fff', fontSize: '10px', fontWeight: '800', display: 'none',
      pointerEvents: 'none'
    });
    imageWindow.appendChild(badge);
  }
  return { img, badge };
}

export function stopPixVerseSimulatorPreview(clearFrames = false) {
  if (pixversePreviewTimer) {
    clearInterval(pixversePreviewTimer);
    pixversePreviewTimer = null;
  }
  pixversePreviewEnabled = false;
  const { doc } = simulatorTarget();
  const img = doc?.getElementById('pixverseSimulatorImage');
  const badge = doc?.getElementById('pixverseSimulatorBadge');
  const btn = doc?.getElementById('pixverseSimulatorToggle');
  if (img) img.style.display = 'none';
  if (badge) badge.style.display = 'none';
  if (btn) {
    btn.textContent = pixversePreviewFrames?.length ? 'Aperçu PixVerse : OFF' : 'Aperçu PixVerse : indisponible';
    btn.disabled = !pixversePreviewFrames?.length;
  }
  if (clearFrames) pixversePreviewFrames = null;
}

export function showPixVerseFramesInSimulator(frames) {
  if (!Array.isArray(frames) || frames.length < 2) return false;
  pixversePreviewFrames = frames;
  const controls = ensurePixVersePreviewControls();
  const overlay = ensurePixVerseOverlay();
  if (!overlay) return false;
  if (pixversePreviewTimer) clearInterval(pixversePreviewTimer);
  pixversePreviewIndex = 0;
  pixversePreviewDirection = 1;
  pixversePreviewEnabled = true;
  overlay.img.src = frames[0].url;
  overlay.img.style.display = 'block';
  overlay.badge.textContent = `PIXVERSE 1/${frames.length}`;
  overlay.badge.style.display = 'block';
  if (controls) {
    controls.disabled = false;
    controls.textContent = 'Aperçu PixVerse : ON';
  }
  pixversePreviewTimer = setInterval(() => {
    if (!pixversePreviewEnabled || !pixversePreviewFrames?.length) return;
    pixversePreviewIndex += pixversePreviewDirection;
    if (pixversePreviewIndex >= pixversePreviewFrames.length - 1) {
      pixversePreviewIndex = pixversePreviewFrames.length - 1;
      pixversePreviewDirection = -1;
    } else if (pixversePreviewIndex <= 0) {
      pixversePreviewIndex = 0;
      pixversePreviewDirection = 1;
    }
    const frame = pixversePreviewFrames[pixversePreviewIndex];
    overlay.img.src = frame.url;
    overlay.badge.textContent = `PIXVERSE ${frame.index || pixversePreviewIndex + 1}/${pixversePreviewFrames.length}`;
  }, 125);
  return true;
}

async function ensureMetadata(video) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0) return;
  await once(video, 'loadedmetadata');
}

async function waitForDecodedFrame(video, targetTime) {
  if (typeof video.requestVideoFrameCallback === 'function') {
    await new Promise(resolve => {
      const started = performance.now();
      let stopped = false;
      const finish = () => { if (!stopped) { stopped = true; resolve(); } };
      const poll = () => {
        if (stopped) return;
        if (performance.now() - started > 1400) return finish();
        video.requestVideoFrameCallback((_now, meta) => {
          if (stopped) return;
          const mediaTime = Number(meta?.mediaTime);
          if (Number.isFinite(mediaTime) && Math.abs(mediaTime - targetTime) <= 0.055) finish();
          else requestAnimationFrame(poll);
        });
      };
      poll();
    });
  } else await delay(140);
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
      frames.push({ index: i + 1, time: actualTime, requestedTime, fingerprint, duplicateRetry, blob, url, width: canvas.width, height: canvas.height });
      previousFingerprint = fingerprint;
    }
  } finally {
    try { await seek(video, Math.min(originalTime, Math.max(0, duration - 0.001))); } catch (_) {}
    if (!wasPaused) { try { await video.play(); } catch (_) {} }
  }

  const result = {
    duration,
    width: canvas.width,
    height: canvas.height,
    frames,
    distinctFingerprints: new Set(frames.map(frame => frame.fingerprint)).size,
    revoke() {
      stopPixVerseSimulatorPreview(true);
      frames.forEach(frame => URL.revokeObjectURL(frame.url));
    }
  };
  try { showPixVerseFramesInSimulator(frames); } catch (_) {}
  return result;
}

export function downloadExtractedFrame(frame, prefix = 'happyholo-pixverse') {
  const a = document.createElement('a');
  a.href = frame.url;
  a.download = `${prefix}-vue-${String(frame.index).padStart(2, '0')}.jpg`;
  a.click();
}
