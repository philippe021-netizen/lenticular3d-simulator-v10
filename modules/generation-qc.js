function metric(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }

export function evaluateGenerationQC(metrics = {}, thresholds = {}) {
  const limits = {
    identityDriftMax: thresholds.identityDriftMax ?? 0.08,
    headDriftMax: thresholds.headDriftMax ?? 0.035,
    preHeadDriftMax: thresholds.preHeadDriftMax ?? 0.16,
    backgroundDriftMax: thresholds.backgroundDriftMax ?? 0.06,
    framingLossMax: thresholds.framingLossMax ?? 0.01,
    motionMonotonicityMin: thresholds.motionMonotonicityMin ?? 0.84,
    requireIdentityConfirmation: thresholds.requireIdentityConfirmation === true,
    requireHeadDrift: thresholds.requireHeadDrift === true,
    requireBackgroundDrift: thresholds.requireBackgroundDrift === true
  };

  const checks = [];
  const add = (name, value, pass, severity = 'fail') => {
    if (value === null) return;
    checks.push({ name, value, pass, severity: pass ? 'ok' : severity });
  };
  const missing = name => checks.push({ name, value: null, pass: false, severity: 'fail', reason: 'missing-metric' });

  const identityDrift = metric(metrics.identityDrift);
  const headDrift = metric(metrics.headDrift);
  const preHeadDrift = metric(metrics.preHeadDrift);
  const backgroundDrift = metric(metrics.backgroundDrift);
  const framingLoss = metric(metrics.framingLoss);
  const monotonicity = metric(metrics.motionMonotonicity);

  if (identityDrift !== null) add('identity-drift', identityDrift, identityDrift <= limits.identityDriftMax);
  if (limits.requireIdentityConfirmation) {
    add('identity-confirmed', metrics.identityConfirmed === true ? 1 : 0, metrics.identityConfirmed === true);
  }

  if (headDrift !== null) add('head-drift', headDrift, headDrift <= limits.headDriftMax);
  else if (limits.requireHeadDrift) missing('head-drift');

  if (preHeadDrift !== null) add('head-correction', preHeadDrift, preHeadDrift <= limits.preHeadDriftMax);
  if (metrics.correctionTooLarge === true) checks.push({ name: 'head-correction', value: preHeadDrift, pass: false, severity: 'fail' });

  if (backgroundDrift !== null) add('background', backgroundDrift, backgroundDrift <= limits.backgroundDriftMax);
  else if (limits.requireBackgroundDrift) missing('background');

  add('framing', framingLoss, framingLoss === null ? true : framingLoss <= limits.framingLossMax);
  add('motion', monotonicity, monotonicity === null ? true : monotonicity >= limits.motionMonotonicityMin);

  if (metrics.returnDetected === true) checks.push({ name: 'return', value: true, pass: false, severity: 'fail' });
  if (metrics.jumpDetected === true) checks.push({ name: 'jump', value: true, pass: false, severity: 'fail' });
  if (metrics.subjectReplacement === true) checks.push({ name: 'subject-replacement', value: true, pass: false, severity: 'fail' });
  if (metrics.unrecoverableCrop === true) checks.push({ name: 'crop', value: true, pass: false, severity: 'fail' });
  if (metrics.similarFrames === true) checks.push({ name: 'similar-frames', value: true, pass: false, severity: 'warn' });

  const hardFailures = checks.filter(c => !c.pass && c.severity === 'fail');
  const warnings = checks.filter(c => !c.pass && c.severity === 'warn');
  return {
    status: hardFailures.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    passed: hardFailures.length === 0,
    exportAllowed: hardFailures.length === 0,
    checks,
    hardFailures: hardFailures.map(c => c.name),
    warnings: warnings.map(c => c.name),
    thresholds: limits
  };
}
