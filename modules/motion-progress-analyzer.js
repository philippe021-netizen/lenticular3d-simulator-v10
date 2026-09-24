const DEFAULT_QUANTILES = [0, .125, .25, .375, .5, .625, .75, .875, 1];

function numericValue(sample) {
  const value = Number(sample?.value ?? sample?.fromStart ?? sample?.progress ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeMotionProgress(samples, { count = 9 } = {}) {
  if (!Array.isArray(samples) || samples.length < Math.max(2, count)) {
    throw new Error(`Au moins ${Math.max(2, count)} échantillons sont requis.`);
  }
  const values = samples.map(numericValue);
  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const positiveTotal = deltas.reduce((sum, delta) => sum + Math.max(0, delta), 0);
  const negativeTotal = deltas.reduce((sum, delta) => sum + Math.max(0, -delta), 0);
  const epsilon = Math.max(1e-6, positiveTotal * 0.004);
  const firstMotionDelta = deltas.findIndex(delta => delta > epsilon);
  const startIndex = Math.max(0, firstMotionDelta < 0 ? 0 : firstMotionDelta);

  let peakIndex = startIndex;
  let peak = values[startIndex];
  let returnIndex = -1;
  for (let index = startIndex + 1; index < values.length; index++) {
    if (values[index] > peak) {
      peak = values[index];
      peakIndex = index;
      continue;
    }
    const drop = peak - values[index];
    if (peak > values[startIndex] && drop >= Math.max((peak - values[startIndex]) * 0.18, epsilon * 3)) {
      returnIndex = index;
      break;
    }
  }
  const endIndex = returnIndex >= 0 ? Math.max(startIndex + 1, returnIndex - 1) : peakIndex;
  const segmentValues = values.slice(startIndex, endIndex + 1);
  let running = segmentValues[0];
  const monotone = segmentValues.map(value => (running = Math.max(running, value)));
  const range = Math.max(Number.EPSILON, monotone.at(-1) - monotone[0]);
  const progression = monotone.map(value => (value - monotone[0]) / range);
  const absSteps = deltas.map(Math.abs);
  const discontinuityThreshold = Math.max(epsilon * 6, median(absSteps) * 4);
  const discontinuities = deltas.map((delta, index) => ({ index: index + 1, score: Math.abs(delta) }))
    .filter(item => item.score > discontinuityThreshold);
  return {
    samples,
    usefulWindow: { startIndex, endIndex, startTime: samples[startIndex].time, endTime: samples[endIndex].time },
    progression,
    discontinuities,
    maxAdjacentJump: absSteps.length ? Math.max(...absSteps) : 0,
    reversalRatio: positiveTotal > 0 ? negativeTotal / positiveTotal : 0,
    returnIndex,
    peakIndex
  };
}

export function selectNineProgressStates(analysis, { count = 9 } = {}) {
  const { samples, usefulWindow, progression } = analysis;
  const quantiles = count === 9 ? DEFAULT_QUANTILES : Array.from({ length: count }, (_, index) => index / (count - 1));
  const segmentLength = usefulWindow.endIndex - usefulWindow.startIndex + 1;
  if (segmentLength < 2) throw new Error('La fenêtre utile ne contient pas assez de mouvement.');
  return quantiles.map(target => {
    let upper = progression.findIndex(value => value >= target);
    if (upper < 0) upper = progression.length - 1;
    const lower = Math.max(0, upper - 1);
    const lowProgress = progression[lower];
    const highProgress = progression[upper];
    const ratio = highProgress > lowProgress ? (target - lowProgress) / (highProgress - lowProgress) : (target === 0 ? 0 : 1);
    const lowIndex = usefulWindow.startIndex + lower;
    const highIndex = usefulWindow.startIndex + upper;
    const time = Number(samples[lowIndex].time) + (Number(samples[highIndex].time) - Number(samples[lowIndex].time)) * ratio;
    return {
      time,
      sampleIndex: lowIndex + (highIndex - lowIndex) * ratio,
      progress: target,
      score: 1,
      reasons: ['visual-progress-quantile'],
      selected: true
    };
  });
}
