function median(values) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function analyzeMotionProgress(progress = [], { hardReturnRatio = 0.32, jumpMultiplier = 4 } = {}) {
  const values = progress.map(v => Number(v) || 0);
  if (values.length < 2) return { ok: false, reason: 'not-enough-samples', returnDetected: false, jumpDetected: false };

  const steps = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const medStep = median(steps) || 1e-6;
  let peak = values[0];
  let peakIndex = 0;
  let returnIndex = -1;
  let jumpIndex = -1;
  let regressions = 0;

  for (let i = 1; i < values.length; i++) {
    const step = Math.abs(values[i] - values[i - 1]);
    if (step > Math.max(0.035, medStep * jumpMultiplier)) jumpIndex = jumpIndex < 0 ? i : jumpIndex;
    if (values[i] > peak) { peak = values[i]; peakIndex = i; }
    if (peak >= 0.02 && values[i] <= peak * hardReturnRatio && peak - values[i] >= 0.015) {
      returnIndex = i;
      break;
    }
    if (values[i] + 0.003 < values[i - 1]) regressions++;
  }

  const final = values.at(-1);
  const monotonicity = 1 - regressions / Math.max(1, values.length - 1);
  return {
    ok: returnIndex < 0,
    returnDetected: returnIndex >= 0,
    returnIndex,
    jumpDetected: jumpIndex >= 0,
    jumpIndex,
    peak,
    peakIndex,
    final,
    medianStep: medStep,
    monotonicity: Number(monotonicity.toFixed(4))
  };
}

export function selectNineProgressiveIndices(progress = [], count = 9) {
  const values = progress.map(v => Number(v) || 0);
  if (!values.length) return [];
  const n = Math.max(2, Math.round(count));
  const running = [];
  let max = values[0];
  for (const v of values) { max = Math.max(max, v); running.push(max); }
  const lo = running[0];
  const hi = Math.max(...running);
  if (hi - lo < 1e-6) return Array.from({ length: n }, (_, i) => Math.round(i * (values.length - 1) / (n - 1)));

  const out = [];
  for (let i = 0; i < n; i++) {
    const target = lo + (hi - lo) * i / (n - 1);
    let idx = running.findIndex(v => v >= target);
    if (idx < 0) idx = running.length - 1;
    if (out.length && idx < out.at(-1)) idx = out.at(-1);
    out.push(idx);
  }
  return out;
}
