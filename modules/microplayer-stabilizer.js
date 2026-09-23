function median(values) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function buildStabilizationPlan(measurements = [], {
  maxTranslation = 0.035,
  maxScaleDrift = 0.04,
  maxRotationDeg = 1.5
} = {}) {
  if (!measurements.length) return [];
  const centersX = measurements.map(m => Number(m.cx) || 0.5);
  const centersY = measurements.map(m => Number(m.cy) || 0.5);
  const scales = measurements.map(m => Number(m.scale) || 1);
  const rotations = measurements.map(m => Number(m.rotationDeg) || 0);
  const target = {
    cx: median(centersX),
    cy: median(centersY),
    scale: median(scales) || 1,
    rotationDeg: median(rotations)
  };
  return measurements.map((m, index) => {
    const cx = Number(m.cx) || target.cx;
    const cy = Number(m.cy) || target.cy;
    const scale = Number(m.scale) || target.scale;
    const rotation = Number(m.rotationDeg) || target.rotationDeg;
    return {
      index,
      translateX: clamp(target.cx - cx, -maxTranslation, maxTranslation),
      translateY: clamp(target.cy - cy, -maxTranslation, maxTranslation),
      scale: clamp(target.scale / scale, 1 - maxScaleDrift, 1 + maxScaleDrift),
      rotateDeg: clamp(target.rotationDeg - rotation, -maxRotationDeg, maxRotationDeg)
    };
  });
}

export function stabilizationSeverity(plan = []) {
  if (!plan.length) return 'none';
  const max = Math.max(...plan.map(p => Math.max(
    Math.abs(p.translateX || 0) / 0.035,
    Math.abs(p.translateY || 0) / 0.035,
    Math.abs((p.scale || 1) - 1) / 0.04,
    Math.abs(p.rotateDeg || 0) / 1.5
  )));
  return max > 0.95 ? 'high' : max > 0.5 ? 'medium' : 'low';
}
