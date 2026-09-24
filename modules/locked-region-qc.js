function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function normalizeLockedRegion(region = {}) {
  const x = clamp01(region.x);
  const y = clamp01(region.y);
  const width = Math.max(0.04, Math.min(1 - x, Number(region.width) || 0));
  const height = Math.max(0.04, Math.min(1 - y, Number(region.height) || 0));
  if (width < 0.04 || height < 0.04) throw new Error('Zone verrouillée trop petite.');
  return { x, y, width, height };
}

function regionPixels(region, width, height) {
  const r = normalizeLockedRegion(region);
  const x = Math.round(r.x * width);
  const y = Math.round(r.y * height);
  const w = Math.max(1, Math.round(r.width * width));
  const h = Math.max(1, Math.round(r.height * height));
  return {
    x: Math.max(0, Math.min(width - 1, x)),
    y: Math.max(0, Math.min(height - 1, y)),
    width: Math.max(1, Math.min(width - x, w)),
    height: Math.max(1, Math.min(height - y, h))
  };
}

async function bitmapFromFrame(frame) {
  if (!frame?.blob) throw new Error('Image de vue manquante pour le contrôle verrouillé.');
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap indisponible.');
  return createImageBitmap(frame.blob);
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponible.');
  return { canvas, ctx };
}

function grayscaleSample(bitmap, region, size = 56) {
  const { canvas, ctx } = makeCanvas(size, size);
  const src = regionPixels(region, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, src.x, src.y, src.width, src.height, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function wholeFrameSample(bitmap, size = 64) {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function shiftedMae(reference, candidate, size, sx, sy) {
  let total = 0;
  let count = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = x + sx;
    const cy = y + sy;
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
    total += Math.abs(reference[y * size + x] - candidate[cy * size + cx]);
    count++;
  }
  return count ? total / (count * 255) : 1;
}

export function bestAlignedDrift(reference, candidate, size, maxShift = 3) {
  if (!reference || !candidate || reference.length !== size * size || candidate.length !== size * size) {
    throw new Error('Signatures verrouillées invalides.');
  }
  let best = { drift: Infinity, dx: 0, dy: 0 };
  for (let sy = -maxShift; sy <= maxShift; sy++) for (let sx = -maxShift; sx <= maxShift; sx++) {
    const drift = shiftedMae(reference, candidate, size, sx, sy);
    if (drift < best.drift) best = { drift, dx: -sx / size, dy: -sy / size };
  }
  return { ...best, drift: Number(best.drift.toFixed(6)) };
}

function borderDrift(reference, candidate, size, borderRatio = 0.1) {
  const border = Math.max(1, Math.round(size * borderRatio));
  let total = 0;
  let count = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x >= border && x < size - border && y >= border && y < size - border) continue;
    const i = y * size + x;
    total += Math.abs(reference[i] - candidate[i]);
    count++;
  }
  return count ? total / (count * 255) : 0;
}

export async function measureLockedSequence(frames, region, {
  sampleSize = 56,
  maxShift = 3,
  borderRatio = 0.1
} = {}) {
  if (!Array.isArray(frames) || frames.length < 2) throw new Error('Au moins deux vues sont requises.');
  const bitmaps = [];
  try {
    for (const frame of frames) bitmaps.push(await bitmapFromFrame(frame));
    const referenceHead = grayscaleSample(bitmaps[0], region, sampleSize);
    const referenceFrame = wholeFrameSample(bitmaps[0], 64);
    const head = [];
    const background = [];
    for (let i = 0; i < bitmaps.length; i++) {
      const currentHead = grayscaleSample(bitmaps[i], region, sampleSize);
      const aligned = bestAlignedDrift(referenceHead, currentHead, sampleSize, maxShift);
      head.push({ index: i + 1, ...aligned });
      const currentFrame = wholeFrameSample(bitmaps[i], 64);
      background.push({ index: i + 1, drift: Number(borderDrift(referenceFrame, currentFrame, 64, borderRatio).toFixed(6)) });
    }
    const maxHeadDrift = Math.max(...head.map(item => item.drift));
    const meanHeadDrift = head.reduce((sum, item) => sum + item.drift, 0) / head.length;
    const maxBackgroundDrift = Math.max(...background.map(item => item.drift));
    return {
      region: normalizeLockedRegion(region),
      head,
      background,
      maxHeadDrift: Number(maxHeadDrift.toFixed(6)),
      meanHeadDrift: Number(meanHeadDrift.toFixed(6)),
      maxBackgroundDrift: Number(maxBackgroundDrift.toFixed(6))
    };
  } finally {
    bitmaps.forEach(bitmap => bitmap.close?.());
  }
}

function canvasToBlob(canvas, type = 'image/png', quality = 1) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Encodage de la vue verrouillée impossible.')), type, quality);
  });
}

function applyFeatheredReference(ctx, reference, region, width, height, featherRatio) {
  const r = regionPixels(region, width, height);
  const feather = Math.max(2, Math.round(Math.min(r.width, r.height) * Math.max(0.02, Math.min(0.25, featherRatio))));
  const { canvas: patch, ctx: pctx } = makeCanvas(r.width, r.height);
  const src = regionPixels(region, reference.width, reference.height);
  pctx.drawImage(reference, src.x, src.y, src.width, src.height, 0, 0, r.width, r.height);
  const image = pctx.getImageData(0, 0, r.width, r.height);
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const edge = Math.min(x, y, r.width - 1 - x, r.height - 1 - y);
    const alpha = Math.max(0, Math.min(1, edge / feather));
    image.data[(y * r.width + x) * 4 + 3] = Math.round(255 * alpha);
  }
  pctx.putImageData(image, 0, 0);
  ctx.drawImage(patch, r.x, r.y);
}

export async function recomposeLockedRegion(frames, region, {
  featherRatio = 0.1,
  type = 'image/png',
  quality = 1
} = {}) {
  if (!Array.isArray(frames) || frames.length < 2) throw new Error('Au moins deux vues sont requises.');
  const normalized = normalizeLockedRegion(region);
  const bitmaps = [];
  const output = [];
  try {
    for (const frame of frames) bitmaps.push(await bitmapFromFrame(frame));
    const reference = bitmaps[0];
    for (let i = 0; i < bitmaps.length; i++) {
      const current = bitmaps[i];
      const { canvas, ctx } = makeCanvas(current.width, current.height);
      ctx.drawImage(current, 0, 0, current.width, current.height);
      if (i > 0) applyFeatheredReference(ctx, reference, normalized, current.width, current.height, featherRatio);
      const blob = await canvasToBlob(canvas, type, quality);
      const url = URL.createObjectURL(blob);
      output.push({
        ...frames[i],
        blob,
        url,
        width: current.width,
        height: current.height,
        lockedRegion: normalized,
        locked: i > 0
      });
    }
  } finally {
    bitmaps.forEach(bitmap => bitmap.close?.());
  }
  return {
    frames: output,
    region: normalized,
    revoke() { output.forEach(frame => URL.revokeObjectURL(frame.url)); }
  };
}

export function assessLockedRegionMetrics(before, after, {
  maxCorrectableHeadDrift = 0.16
} = {}) {
  if (!before || !after) {
    return {
      availableMetrics: [],
      headDrift: null,
      backgroundDrift: null,
      preHeadDrift: null,
      correctionTooLarge: true
    };
  }
  return {
    availableMetrics: ['headDrift', 'backgroundDrift', 'preHeadDrift'],
    headDrift: after.maxHeadDrift,
    backgroundDrift: after.maxBackgroundDrift,
    preHeadDrift: before.maxHeadDrift,
    correctionTooLarge: before.maxHeadDrift > maxCorrectableHeadDrift
  };
}
