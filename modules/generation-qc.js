function metric(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }

export function evaluateGenerationQC(metrics = {}, thresholds = {}) {
  const limits = {
    identityDriftMax: thresholds.identityDriftMax ?? 0.08,
    backgroundDriftMax: thresholds.backgroundDriftMax ?? 0.035,
    framingLossMax: thresholds.framingLossMax ?? 0.01,
    motionMonotonicityMin: thresholds.motionMonotonicityMin ?? 0.84
  };

  const checks = [];
  const add = (name, value, pass, severity = 'fail') => {
    if (value === null) return;
    checks.push({ name, value, pass, severity: pass ? 'ok' : severity });
  };

  const identityDrift = metric(metrics.identityDrift);
  const backgroundDrift = metric(metrics.backgroundDrift);
  const framingLoss = metric(metrics.framingLoss);
  const monotonicity = metric(metrics.motionMonotonicity);
  add('identity', identityDrift, identityDrift === null ? true : identityDrift <= limits.identityDriftMax);
  add('background', backgroundDrift, backgroundDrift === null ? true : backgroundDrift <= limits.backgroundDriftMax);
  add('framing', framingLoss, framingLoss === null ? true : framingLoss <= limits.framingLossMax);
  add('motion', monotonicity, monotonicity === null ? true : monotonicity >= limits.motionMonotonicityMin);

  if (metrics.returnDetected === true) checks.push({ name: 'return', value: true, pass: false, severity: 'fail' });
  if (metrics.jumpDetected === true) checks.push({ name: 'jump', value: true, pass: false, severity: 'fail' });
  if (metrics.similarFrames === true) checks.push({ name: 'similar-frames', value: true, pass: false, severity: 'warn' });

  const hardFailures = checks.filter(c => !c.pass && c.severity === 'fail');
  const warnings = checks.filter(c => !c.pass && c.severity === 'warn');
  return {
    status: hardFailures.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    passed: hardFailures.length === 0,
    checks,
    hardFailures: hardFailures.map(c => c.name),
    warnings: warnings.map(c => c.name),
    thresholds: limits
  };
}
