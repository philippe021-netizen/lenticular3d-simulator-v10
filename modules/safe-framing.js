function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function normalizeBox(box = {}) {
  const x = clamp(Number(box.x) || 0, 0, 1);
  const y = clamp(Number(box.y) || 0, 0, 1);
  const w = clamp(Number(box.w) || 0, 0, 1 - x);
  const h = clamp(Number(box.h) || 0, 0, 1 - y);
  return { x, y, w, h };
}

export function computeSafeFraming(box, { margin = 0.08, maxScale = 1, minScale = 0.55 } = {}) {
  const b = normalizeBox(box);
  if (b.w <= 0 || b.h <= 0) return { ok: false, reason: 'empty-subject-box' };
  const m = clamp(Number(margin) || 0, 0, 0.3);
  const available = Math.max(0.05, 1 - 2 * m);
  const scale = clamp(Math.min(available / b.w, available / b.h, Number(maxScale) || 1), minScale, maxScale);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const tx = 0.5 - cx;
  const ty = 0.5 - cy;
  const left = cx - (b.w * scale) / 2;
  const right = cx + (b.w * scale) / 2;
  const top = cy - (b.h * scale) / 2;
  const bottom = cy + (b.h * scale) / 2;
  const clearance = Math.min(left, 1 - right, top, 1 - bottom);
  return {
    ok: clearance >= m - 1e-6,
    scale: Number(scale.toFixed(4)),
    translateX: Number(tx.toFixed(4)),
    translateY: Number(ty.toFixed(4)),
    requestedMargin: m,
    estimatedClearance: Number(clearance.toFixed(4)),
    box: b
  };
}

export function framingRisk(box, margin = 0.08) {
  const b = normalizeBox(box);
  const clearance = Math.min(b.x, b.y, 1 - (b.x + b.w), 1 - (b.y + b.h));
  if (clearance < 0.015) return 'critical';
  if (clearance < margin) return 'warning';
  return 'ok';
}

export function computeSafeFrameGeometry({ width, height, safeMargin = 0.14, anchor = 'center' }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Dimensions source invalides.');
  }
  if (!Number.isFinite(safeMargin) || safeMargin < 0 || safeMargin > 0.3) {
    throw new Error('safeMargin doit être compris entre 0 et 0.3.');
  }
  const scale = Number((1 - 2 * safeMargin).toFixed(6));
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  const dx = Math.round((width - drawWidth) / 2);
  const defaultDy = Math.round((height - drawHeight) / 2);
  const dy = anchor === 'top'
    ? Math.round(height * safeMargin * 0.6)
    : anchor === 'bottom'
      ? Math.round(height - drawHeight - height * safeMargin * 0.6)
      : defaultDy;
  return { outputWidth: width, outputHeight: height, drawWidth, drawHeight, dx, dy, scale, anchor };
}

function safeFrameCanvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Encodage safe framing impossible.')),
      'image/jpeg',
      0.94
    );
  });
}

export async function prepareSafeFramedImage(file, framing = {}) {
  if (!file) throw new Error('Image source manquante pour le safe framing.');
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return { file, geometry: null, warnings: ['Safe framing indisponible dans cet environnement.'] };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const geometry = computeSafeFrameGeometry({
      width: bitmap.width,
      height: bitmap.height,
      safeMargin: Number(framing.safeMargin ?? 0.14),
      anchor: framing.anchor || 'center'
    });

    const canvas = document.createElement('canvas');
    canvas.width = geometry.outputWidth;
    canvas.height = geometry.outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas safe framing indisponible.');

    ctx.save();
    ctx.filter = `blur(${Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * 0.018))}px)`;
    ctx.drawImage(
      bitmap,
      -geometry.dx,
      -geometry.dy,
      canvas.width + geometry.dx * 2,
      canvas.height + geometry.dy * 2
    );
    ctx.restore();

    ctx.drawImage(bitmap, geometry.dx, geometry.dy, geometry.drawWidth, geometry.drawHeight);

    const blob = await safeFrameCanvasBlob(canvas);
    const prepared = new File(
      [blob],
      `safe-${file.name || 'microplayer.jpg'}`,
      { type: blob.type, lastModified: Date.now() }
    );
    const warnings = geometry.scale < 0.62
      ? ['Marge importante : vérifier que le sujet reste assez grand.']
      : [];
    return { file: prepared, geometry, warnings };
  } finally {
    bitmap.close?.();
  }
}

