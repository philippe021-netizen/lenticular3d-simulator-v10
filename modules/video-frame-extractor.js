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

let pixversePreviewRAF = 0;
let pixversePreviewFrames = null;
let pixversePreviewEnabled = false;
let pixversePreviewStart = 0;
let pixversePlacementBound = false;
let pixverseLastFrameIndex = -1;

function simulatorTarget() {
  const iframe = document.getElementById('hhApp');
  const doc = iframe?.contentDocument;
  const supportCanvas = doc?.getElementById('supportCanvas');
  const imageWindow = supportCanvas?.parentElement;
  const product = doc?.getElementById('productObject');
  return { doc, imageWindow, product };
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

function currentFrontPlacement(doc) {
  const fit = doc?.getElementById('supportFit')?.value || 'contain';
  const zoom = Number(doc?.getElementById('supportZoom')?.value || 100);
  const x = Number(doc?.getElementById('supportX')?.value || 0);
  const y = Number(doc?.getElementById('supportY')?.value || 0);
  const margin = Number(doc?.getElementById('supportMargin')?.value || 0);
  return { fit, zoom, x, y, margin };
}

function applyPixVersePlacement() {
  const { doc } = simulatorTarget();
  const img = doc?.getElementById('pixverseSimulatorImage');
  if (!doc || !img) return;
  const p = currentFrontPlacement(doc);
  img.style.objectFit = p.fit === 'cover' ? 'cover' : 'contain';
  img.style.objectPosition = 'center';
  let scale = Math.max(0.1, p.zoom / 100);
  if (p.fit === 'preserve') scale *= Math.max(0.55, 1 - p.margin / 100);
  img.style.transformOrigin = '50% 50%';
  img.style.transform = `translate(${p.x * 0.5}%, ${p.y * 0.5}%) scale(${scale})`;
}

function bindPixVersePlacementControls() {
  if (pixversePlacementBound) return;
  const { doc } = simulatorTarget();
  if (!doc) return;
  ['supportFit','supportMargin','supportZoom','supportX','supportY','supportType'].forEach(id => {
    const el = doc.getElementById(id);
    if (!el || el.dataset.pixversePlacementBound === '1') return;
    el.dataset.pixversePlacementBound = '1';
    el.addEventListener('input', applyPixVersePlacement);
    el.addEventListener('change', applyPixVersePlacement);
  });
  pixversePlacementBound = true;
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
      position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain',
      objectPosition: 'center', display: 'none', zIndex: '20', pointerEvents: 'none',
      borderRadius: 'inherit', maxWidth: 'none', maxHeight: 'none', backfaceVisibility: 'hidden'
    });
    imageWindow.appendChild(img);
  }
  let badge = doc.getElementById('pixverseSimulatorBadge');
  if (!badge) {
    badge = doc.createElement('div');
    badge.id = 'pixverseSimulatorBadge';
    Object.assign(badge.style, {
      position: 'absolute', left: '8px', bottom: '8px', zIndex: '21', padding: '4px 7px',
      borderRadius: '999px', background: 'rgba(0,0,0,.72)', color: '#fff', fontSize: '10px',
      fontWeight: '800', display: 'none', pointerEvents: 'none'
    });
    imageWindow.appendChild(badge);
  }
  bindPixVersePlacementControls();
  applyPixVersePlacement();
  return { img, badge };
}

function simulatorSpeedMs(doc) {
  const seconds = Number(doc?.getElementById('supportSpeed')?.value || 5);
  return Math.max(2500, Math.min(8000, seconds * 1000));
}

function simulatorRotation(doc) {
  const deg = Number(doc?.getElementById('supportRot')?.value || 6);
  return Math.max(0, Math.min(8, deg));
}

function stabilizeProductForPixVerse(product) {
  if (!product) return;
  product.classList.remove('support-playing');
  product.style.animation = 'none';
  product.style.willChange = 'transform';
  const shell = product.querySelector('.shell');
  if (shell) shell.style.animation = 'none';
}

function animatePixVersePreview(now) {
  if (!pixversePreviewEnabled || !pixversePreviewFrames?.length) return;
  const { doc, product } = simulatorTarget();
  const img = doc?.getElementById('pixverseSimulatorImage');
  const badge = doc?.getElementById('pixverseSimulatorBadge');
  if (!doc || !img || !badge) {
    pixversePreviewRAF = requestAnimationFrame(animatePixVersePreview);
    return;
  }
  stabilizeProductForPixVerse(product);
  const period = simulatorSpeedMs(doc);
  const elapsed = Math.max(0, now - pixversePreviewStart);
  const phase = (elapsed % period) / period;
  const sweep = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  if (product) {
    const rot = simulatorRotation(doc);
    const angle = -rot + sweep * rot * 2;
    const shift = -4 + sweep * 8;
    product.style.transform = `perspective(620px) rotateY(${angle.toFixed(3)}deg) translateX(${shift.toFixed(2)}px)`;
  }
  const idx = Math.max(0, Math.min(pixversePreviewFrames.length - 1, Math.round(sweep * (pixversePreviewFrames.length - 1))));
  if (idx !== pixverseLastFrameIndex) {
    pixverseLastFrameIndex = idx;
    const frame = pixversePreviewFrames[idx];
    img.src = frame.url;
    badge.textContent = `PIXVERSE ${frame.index || idx + 1}/${pixversePreviewFrames.length}`;
  }
  pixversePreviewRAF = requestAnimationFrame(animatePixVersePreview);
}

export function stopPixVerseSimulatorPreview(clearFrames = false) {
  if (pixversePreviewRAF) cancelAnimationFrame(pixversePreviewRAF);
  pixversePreviewRAF = 0;
  pixversePreviewEnabled = false;
  pixverseLastFrameIndex = -1;
  const { doc, product } = simulatorTarget();
  const img = doc?.getElementById('pixverseSimulatorImage');
  const badge = doc?.getElementById('pixverseSimulatorBadge');
  const btn = doc?.getElementById('pixverseSimulatorToggle');
  if (img) img.style.display = 'none';
  if (badge) badge.style.display = 'none';
  if (product) {
    product.style.transform = '';
    product.style.animation = '';
    product.style.willChange = '';
    const shell = product.querySelector('.shell');
    if (shell) shell.style.animation = '';
  }
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
  if (pixversePreviewRAF) cancelAnimationFrame(pixversePreviewRAF);
  const { product } = simulatorTarget();
  stabilizeProductForPixVerse(product);
  pixversePreviewEnabled = true;
  pixversePreviewStart = performance.now();
  pixverseLastFrameIndex = 0;
  overlay.img.src = frames[0].url;
  overlay.img.style.display = 'block';
  overlay.badge.textContent = `PIXVERSE 1/${frames.length}`;
  overlay.badge.style.display = 'block';
  applyPixVersePlacement();
  if (controls) {
    controls.disabled = false;
    controls.textContent = 'Aperçu PixVerse : ON';
  }
  pixversePreviewRAF = requestAnimationFrame(animatePixVersePreview);
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
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const tick = () => {
        if (done) return;
        if (performance.now() - started > 900) return finish();
        video.requestVideoFrameCallback((_now, meta) => {
          const mediaTime = Number(meta?.mediaTime);
          if (Number.isFinite(mediaTime) && Math.abs(mediaTime - targetTime) <= 0.065) finish();
          else requestAnimationFrame(tick);
        });
      };
      tick();
    });
  } else await delay(90);
}

async function seek(video, time) {
  const duration = Number(video.duration) || 0;
  const target = Math.max(0, Math.min(Math.max(0, duration - 0.001), time));
  if (Math.abs((Number(video.currentTime) || 0) - target) < 0.003) {
    await waitForDecodedFrame(video, target);
    return target;
  }
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
  const sample = document.createElement('canvas');
  sample.width = 128;
  sample.height = 96;
  const sampleCtx = sample.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!sampleCtx) return '';
  sampleCtx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, sample.width, sample.height);
  const pixels = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < pixels.length; i += 4) {
    h ^= pixels[i];
    h = Math.imul(h, 16777619) >>> 0;
    h ^= pixels[i + 1];
    h = Math.imul(h, 16777619) >>> 0;
    h ^= pixels[i + 2];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function currentActionHint() {
  const custom = document.getElementById('customAction');
  const family = document.getElementById('family')?.value || '';
  const actionSelect = document.getElementById('action');
  const actionText = actionSelect?.selectedOptions?.[0]?.textContent || '';
  const customText = custom?.value?.trim() || '';
  const promptText = document.getElementById('prompt')?.textContent || '';
  return [family, customText || actionText, promptText].filter(Boolean).join(' · ').toLowerCase().slice(0, 1400);
}

function actionSensitivity(hint) {
  const subtle = /(clin d.?œil|wink|blink|sourire|smile|regard|look|yeux|eyes|oreille|ear|langue|tongue|bouche|mouth|kiss|bisou|cheek)/i.test(hint);
  const large = /(danse|dance|bras|hands up|tourne|rotate|rotation|avance|move|walk|saute|jump|explod|explode|démont|teardown)/i.test(hint);
  return subtle ? 0.72 : large ? 1.18 : 1;
}

function sampleSignature(ctx, width, height) {
  const sx = 32, sy = 24;
  const out = new Float32Array(sx * sy);
  let n = 0;
  for (let y = 0; y < sy; y++) {
    for (let x = 0; x < sx; x++) {
      const px = Math.min(width - 1, Math.round((x + 0.5) * width / sx));
      const py = Math.min(height - 1, Math.round((y + 0.5) * height / sy));
      const d = ctx.getImageData(px, py, 1, 1).data;
      out[n++] = 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
    }
  }
  return out;
}

function signatureDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length * 255);
}

function median(values) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Keep the first complete one-way action. PixVerse can ignore the prompt's
 * final hold and restart the animation inside the same two-second clip. A
 * global maximum is therefore unsafe: it can select the second pass.
 */
export function selectFirstProgressivePass(samples, {
  start = samples?.[0]?.time ?? 0,
  end = samples?.[samples.length - 1]?.time ?? start,
  medianMotion = 0,
  threshold = 0
} = {}) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return { actionStartIndex: 0, actionEndIndex: 0, peakIndex: 0, returnIndex: -1, returnDetected: false };
  }

  const overallMax = Math.max(...samples.map(sample => Number(sample.fromStart) || 0));
  const activityFloor = Math.max(0.004, medianMotion * 1.15, overallMax * 0.08);
  let actionStartIndex = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].fromStart >= activityFloor || samples[i].stepMotion >= threshold) {
      // Keep one quiet sample before the first detected motion so view 1 is
      // the real source pose, including when the analysis grid is sparse.
      actionStartIndex = Math.max(0, i - 2);
      break;
    }
  }

  const armedFloor = Math.max(0.008, medianMotion * 1.4, overallMax * 0.16);
  let peakIndex = actionStartIndex;
  let peakDistance = samples[peakIndex].fromStart || 0;
  let returnIndex = -1;
  let reversalRun = 0;

  for (let i = actionStartIndex + 1; i < samples.length; i++) {
    const sample = samples[i];
    const previousPeak = peakDistance;
    if (sample.fromStart > peakDistance) {
      peakDistance = sample.fromStart;
      peakIndex = i;
    }
    if (previousPeak < armedFloor) continue;

    const drop = previousPeak - sample.fromStart;
    const hardReturn = sample.fromStart <= Math.max(0.003, previousPeak * 0.32)
      && sample.stepMotion >= Math.max(0.008, medianMotion * 1.15);
    const meaningfulReversal = sample.fromStart <= previousPeak * 0.58
      && drop >= Math.max(0.008, medianMotion * 1.5);
    reversalRun = meaningfulReversal ? reversalRun + 1 : 0;

    if (hardReturn || reversalRun >= 2) {
      returnIndex = i;
      break;
    }
  }

  const cycleLimit = returnIndex >= 0 ? returnIndex : samples.length;
  peakIndex = actionStartIndex;
  peakDistance = samples[peakIndex].fromStart || 0;
  for (let i = actionStartIndex + 1; i < cycleLimit; i++) {
    if (samples[i].fromStart > peakDistance) {
      peakDistance = samples[i].fromStart;
      peakIndex = i;
    }
  }

  // Stop when the first pass has essentially reached its final state. This
  // removes a long final hold without drifting into a later restart.
  let actionEndIndex = peakIndex;
  const completionFloor = peakDistance * 0.94;
  for (let i = actionStartIndex + 1; i <= peakIndex; i++) {
    if (samples[i].fromStart >= completionFloor) {
      actionEndIndex = i;
      break;
    }
  }

  const minSpan = Math.max(0.28, (end - start) * 0.14);
  while (actionEndIndex < peakIndex && samples[actionEndIndex].time - samples[actionStartIndex].time < minSpan) {
    actionEndIndex++;
  }

  return {
    actionStartIndex,
    actionEndIndex,
    peakIndex,
    returnIndex,
    returnDetected: returnIndex >= 0,
    peakDistance
  };
}

export function planProgressiveFrameTimes(samples, startIndex, endIndex, count = 9) {
  const frameCount = Math.max(2, Math.round(count));
  const segment = samples.slice(startIndex, endIndex + 1);
  if (segment.length < 2) return Array.from({ length: frameCount }, () => segment[0]?.time ?? 0);

  const monotoneProgress = [];
  let runningMax = Number(segment[0].fromStart) || 0;
  for (const sample of segment) {
    runningMax = Math.max(runningMax, Number(sample.fromStart) || 0);
    monotoneProgress.push(runningMax);
  }
  const firstProgress = monotoneProgress[0];
  const lastProgress = monotoneProgress[monotoneProgress.length - 1];
  const usableProgress = lastProgress - firstProgress;
  const firstTime = segment[0].time;
  const lastTime = segment[segment.length - 1].time;

  if (usableProgress < 0.004) {
    return Array.from({ length: frameCount }, (_, i) => firstTime + (lastTime - firstTime) * i / (frameCount - 1));
  }

  return Array.from({ length: frameCount }, (_, i) => {
    if (i === 0) return firstTime;
    if (i === frameCount - 1) return lastTime;
    const target = firstProgress + usableProgress * i / (frameCount - 1);
    let upper = 1;
    while (upper < monotoneProgress.length - 1 && monotoneProgress[upper] < target) upper++;
    const lower = Math.max(0, upper - 1);
    const lowProgress = monotoneProgress[lower];
    const highProgress = monotoneProgress[upper];
    const ratio = highProgress > lowProgress ? (target - lowProgress) / (highProgress - lowProgress) : 1;
    return segment[lower].time + (segment[upper].time - segment[lower].time) * Math.max(0, Math.min(1, ratio));
  });
}

export function assessProgressiveFrames(frames) {
  if (!Array.isArray(frames) || frames.length < 2) {
    return { passed: false, reason: 'not-enough-frames', distinctFrames: frames?.length || 0, returnDetected: false };
  }
  const distinctFrames = new Set(frames.map(frame => frame.fingerprint)).size;
  const baseline = frames[0].signature;
  const progress = frames.map(frame => signatureDistance(baseline, frame.signature));
  let runningPeak = 0;
  let returnDetected = false;
  for (let i = 1; i < progress.length; i++) {
    runningPeak = Math.max(runningPeak, progress[i - 1]);
    // Only an unmistakable reset remains blocking. Small backward variations
    // are normal with faces, fur, reflections and compressed PixVerse frames.
    if (runningPeak >= 0.018 && progress[i] <= runningPeak * 0.25 && runningPeak - progress[i] >= 0.012) {
      returnDetected = true;
      break;
    }
  }
  const finalProgress = progress[progress.length - 1];
  const enoughMotion = Math.max(...progress) >= 0.002;
  const repeatedFrames = Math.max(0, frames.length - distinctFrames);
  const warning = repeatedFrames > 0 ? 'similar-frames' : enoughMotion ? null : 'subtle-motion';
  // Similar frames and subtle motion are advisory: the user can still export.
  // A confirmed hard reset is the sole content-quality blocker.
  const passed = !returnDetected;
  return {
    passed,
    reason: returnDetected ? 'return-detected' : null,
    warning,
    distinctFrames,
    repeatedFrames,
    returnDetected,
    finalProgress: Number(finalProgress.toFixed(5)),
    peakProgress: Number(Math.max(...progress).toFixed(5))
  };
}

async function analyzeActionWindow(video, ctx, canvas, start, end, hint, sampleCount = 26, onProgress) {
  const count = Math.max(14, Math.min(42, Math.round(sampleCount)));
  const samples = [];
  let previousSig = null;
  let baselineSig = null;
  for (let i = 0; i < count; i++) {
    const r = count === 1 ? 0 : i / (count - 1);
    const time = start + (end - start) * r;
    onProgress?.({ phase: 'analysis', index: i, count, time });
    const actualTime = await seek(video, time);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const sig = sampleSignature(ctx, canvas.width, canvas.height);
    if (!baselineSig) baselineSig = sig;
    const stepMotion = previousSig ? signatureDistance(previousSig, sig) : 0;
    const fromStart = signatureDistance(baselineSig, sig);
    samples.push({ time: actualTime, sig, stepMotion, fromStart });
    previousSig = sig;
  }

  const motions = samples.slice(1).map(s => s.stepMotion);
  const med = median(motions);
  const deviations = motions.map(v => Math.abs(v - med));
  const mad = median(deviations) || 0.001;
  const sensitivity = actionSensitivity(hint);
  const threshold = med + mad * 0.85 * sensitivity;

  const selected = selectFirstProgressivePass(samples, { start, end, medianMotion: med, threshold });
  const { peakIndex, actionStartIndex, actionEndIndex } = selected;

  const minSpan = Math.max(0.34, (end - start) * 0.22);
  let selectedStart = samples[actionStartIndex]?.time ?? start;
  let selectedEnd = samples[actionEndIndex]?.time ?? samples[peakIndex]?.time ?? end;
  if (selectedEnd - selectedStart < minSpan) {
    selectedStart = Math.max(start, (samples[peakIndex]?.time ?? end) - minSpan);
    selectedEnd = Math.min(end, selectedStart + minSpan);
  }
  if (selectedEnd <= selectedStart) selectedEnd = Math.min(end, selectedStart + minSpan);

  return {
    start: selectedStart,
    end: selectedEnd,
    peak: samples[peakIndex]?.time ?? selectedEnd,
    peakIndex,
    actionStartIndex,
    actionEndIndex,
    returnIndex: selected.returnIndex,
    returnDetected: selected.returnDetected,
    threshold,
    medianMotion: med,
    sensitivity,
    sampleCount: count,
    hint: hint || null,
    samples
  };
}

export async function extractVideoFrames(video, {
  count = 9,
  edgePaddingSeconds = 0.05,
  progressiveOnly = true,
  type = 'image/jpeg',
  quality = 0.96,
  actionAware = true,
  actionHint = '',
  analysisSamples = 26,
  onProgress
} = {}) {
  if (!video) throw new Error('Vidéo PixVerse introuvable.');
  await ensureMetadata(video);
  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durée vidéo PixVerse invalide.');
  if (!video.videoWidth || !video.videoHeight) throw new Error('Dimensions vidéo PixVerse indisponibles.');

  const frameCount = Math.max(2, Math.round(count));
  const pad = Math.min(Math.max(0, edgePaddingSeconds), duration * 0.12);
  const fullStart = pad;
  const fullEnd = Math.max(fullStart, duration - pad);
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error('Canvas d’extraction indisponible.');

  const wasPaused = video.paused;
  const originalTime = Number(video.currentTime) || 0;
  video.pause();
  const hint = (actionHint || currentActionHint()).trim();
  let analysis = null;
  let start = fullStart;
  let end = fullEnd;
  const frames = [];
  let plannedTimes = null;

  try {
    if (actionAware && fullEnd - fullStart > 0.45) {
      analysis = await analyzeActionWindow(video, ctx, canvas, fullStart, fullEnd, hint, analysisSamples, onProgress);
      start = analysis.start;
      end = progressiveOnly ? Math.min(analysis.end, analysis.peak || analysis.end) : analysis.end;
      if (end - start < 0.28) end = Math.min(fullEnd, start + 0.28);
      plannedTimes = planProgressiveFrameTimes(analysis.samples, analysis.actionStartIndex, analysis.actionEndIndex, frameCount);
      start = plannedTimes[0];
      end = plannedTimes[plannedTimes.length - 1];
    }

    const span = Math.max(0, end - start);
    for (let i = 0; i < frameCount; i++) {
      const ratio = frameCount === 1 ? 0.5 : i / (frameCount - 1);
      const requestedTime = plannedTimes?.[i] ?? (start + span * ratio);
      onProgress?.({ phase: 'extract', index: i, count: frameCount, time: requestedTime });
      const actualTime = await seek(video, requestedTime);
      await delay(20);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const fingerprint = fingerprintCanvas(ctx, canvas.width, canvas.height);
      const signature = sampleSignature(ctx, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, type, quality);
      const url = URL.createObjectURL(blob);
      frames.push({ index: i + 1, time: actualTime, requestedTime, fingerprint, signature, blob, url, width: canvas.width, height: canvas.height });
    }
  } finally {
    try { await seek(video, Math.min(originalTime, Math.max(0, duration - 0.001))); } catch (_) {}
    if (!wasPaused) { try { await video.play(); } catch (_) {} }
  }

  const qualityGate = assessProgressiveFrames(frames);
  const result = {
    duration,
    width: canvas.width,
    height: canvas.height,
    frames,
    distinctFingerprints: qualityGate.distinctFrames,
    qualityGate,
    extractionWindow: {
      mode: actionAware ? 'action-aware-progressive' : (progressiveOnly ? 'progressive-one-way' : 'full-duration'),
      start,
      end,
      originalStart: fullStart,
      originalEnd: fullEnd,
      actionPeak: analysis?.peak ?? null,
      returnDetected: analysis?.returnDetected ?? false,
      returnTime: analysis?.returnIndex >= 0 ? analysis.samples[analysis.returnIndex]?.time ?? null : null,
      plannedBeforeExtraction: Boolean(plannedTimes),
      plannedTimes: plannedTimes?.map(time => Number(time.toFixed(3))) || null,
      actionHint: hint || null,
      analysis: analysis ? {
        sampleCount: analysis.sampleCount,
        medianMotion: Number(analysis.medianMotion.toFixed(5)),
        threshold: Number(analysis.threshold.toFixed(5)),
        sensitivity: analysis.sensitivity
      } : null
    },
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
  const subtype = frame?.blob?.type?.split('/')?.[1]?.replace('jpeg', 'jpg') || 'jpg';
  a.download = `${prefix}-vue-${String(frame.index).padStart(2, '0')}.${subtype}`;
  a.click();
}
