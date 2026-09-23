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
