import {
  extractVideoFrames as baseExtractVideoFrames,
  downloadExtractedFrame,
  showPixVerseFramesInSimulator,
  stopPixVerseSimulatorPreview
} from './video-frame-extractor.js?v=409';

const delay = ms => new Promise(r => setTimeout(r, ms));

function makeVideo(src) {
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.playsInline = true;
  v.style.position = 'fixed';
  v.style.left = '-9999px';
  v.style.width = '2px';
  v.style.height = '2px';
  v.src = src;
  document.body.appendChild(v);
  try { v.load(); } catch (_) {}
  return v;
}

function destroyVideo(v) {
  if (!v) return;
  try { v.pause(); } catch (_) {}
  v.removeAttribute('src');
  try { v.load(); } catch (_) {}
  v.remove();
}

function waitEvent(target, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener('error', onErr);
      err ? reject(err) : resolve();
    };
    const onOk = () => finish();
    const onErr = () => finish(new Error(`Erreur vidéo pendant ${event}.`));
    const timer = setTimeout(() => finish(new Error(`Délai dépassé pendant ${event}.`)), timeoutMs);
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

async function ensureMetadata(video) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.videoWidth > 0) return;
  await waitEvent(video, 'loadedmetadata', 10000);
}

async function safeSeek(video, time) {
  const duration = Number(video.duration) || 0;
  const target = Math.max(0, Math.min(Math.max(0, duration - 0.02), time));
  if (Math.abs((Number(video.currentTime) || 0) - target) > 0.004) {
    const p = waitEvent(video, 'seeked', 3500);
    video.currentTime = target;
    await p;
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await delay(35);
}

function canvasDataUrl(video) {
  const w = Math.max(2, video.videoWidth || 0);
  const h = Math.max(2, video.videoHeight || 0);
  if (w <= 2 || h <= 2) throw new Error('Dimensions vidéo invalides.');
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { alpha: false });
  ctx.drawImage(video, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.96);
}

async function extractShortClip(video, options = {}) {
  await ensureMetadata(video);
  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durée vidéo invalide.');

  const count = Math.max(2, Math.min(9, Number(options.count) || 9));
  const edge = Math.min(0.06, Math.max(0.025, duration * 0.02));
  const start = edge;
  const end = Math.max(start, duration - edge);
  const dataUrls = [];
  const frames = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? duration / 2 : start + (end - start) * (i / (count - 1));
    await safeSeek(video, t);
    const dataUrl = canvasDataUrl(video);
    dataUrls.push(dataUrl);
    frames.push({ index: i + 1, time: t, dataUrl, url: dataUrl });
    if (typeof options.onProgress === 'function') options.onProgress({ current: i + 1, total: count, time: t });
  }

  return {
    dataUrls,
    frames,
    duration,
    extractionWindow: {
      mode: 'pixverse-2s-ipad-direct-9',
      start,
      end,
      count,
      progressiveOnly: true,
      calculatedBeforeExtraction: true
    }
  };
}

async function extractFromVideo(video, options = {}) {
  await ensureMetadata(video);
  const duration = Number(video?.duration);
  if (Number.isFinite(duration) && duration > 0 && duration <= 2.35) {
    return extractShortClip(video, { ...options, count: options.count ?? 9 });
  }
  return baseExtractVideoFrames(video, options);
}

async function fetchAsObjectUrl(src) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const r = await fetch(src, { cache: 'no-store', signal: controller.signal });
    if (!r.ok) {
      const msg = await r.text().catch(() => '');
      throw new Error(`Chargement vidéo HTTP ${r.status}${msg ? ` — ${msg.slice(0, 120)}` : ''}`);
    }
    const blob = await r.blob();
    if (!blob.size) throw new Error('Vidéo vide reçue depuis HappyHolo.');
    return URL.createObjectURL(blob);
  } finally {
    clearTimeout(timer);
  }
}

function triggerBusinessCardSimulation() {
  const prepare = document.getElementById('prepare');
  const result = document.getElementById('resultCard');
  if (!prepare || !result) return;
  setTimeout(() => {
    if (prepare.disabled) return;
    prepare.click();
  }, 120);
}

export async function extractVideoFrames(videoOrUrl, options = {}) {
  if (typeof videoOrUrl !== 'string') {
    const result = await extractFromVideo(videoOrUrl, options);
    triggerBusinessCardSimulation();
    return result;
  }

  const source = String(videoOrUrl || '').trim();
  if (!source) throw new Error('URL vidéo PixVerse manquante.');

  const sameOrigin = source.startsWith(location.origin) || source.startsWith('/');
  const candidates = sameOrigin ? [source] : [`/api/pixverse-video?url=${encodeURIComponent(source)}`, source];

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
      const result = await extractFromVideo(video, options);
      triggerBusinessCardSimulation();
      return result;
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
