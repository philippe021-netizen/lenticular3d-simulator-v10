export const DEFAULT_QC_THRESHOLDS = Object.freeze({
  maxSceneCut: 0.18,
  maxReverseRatio: 0.12,
  maxCameraShift: 0.025,
  maxAdjacentJump: 0.22,
  maxHeadDrift: 0.035,
  maxBackgroundDrift: 0.06
});

export function gradeGeneration(metrics = {}, thresholds = {}, requirements = []) {
  const limits = { ...DEFAULT_QC_THRESHOLDS, ...thresholds };
  const available = new Set(metrics.availableMetrics || []);
  const missing = requirements.filter(name => !available.has(name));
  const reasons = [];
  if (missing.length) reasons.push(`Mesures requises indisponibles : ${missing.join(', ')}.`);
  if (Number(metrics.sceneCut || 0) > limits.maxSceneCut) reasons.push('Rupture de scène ou remplacement du sujet détecté.');
  if (Number(metrics.reversalRatio || 0) > limits.maxReverseRatio) reasons.push('Retour de mouvement B→A détecté.');
  if (Number(metrics.maxAdjacentJump || 0) > limits.maxAdjacentJump) reasons.push('Discontinuité temporelle majeure détectée.');
  if (metrics.subjectReplacement) reasons.push('Remplacement du sujet détecté.');
  if (metrics.unrecoverableCrop) reasons.push('Cadrage irrécupérable : un élément utile sort de l’image.');
  if (metrics.discontinuity && !reasons.includes('Discontinuité temporelle majeure détectée.')) reasons.push('Discontinuité temporelle majeure détectée.');
  if (metrics.handIntegrity === false) reasons.push('Déformation mains/doigts détectée.');
  if (metrics.objectIntegrity === false) reasons.push('Déformation ou remplacement de l’objet détecté.');
  if (metrics.clothingConsistency === false) reasons.push('Changement de vêtements détecté.');
  if (reasons.length) return { grade: 'red', exportAllowed: false, reasons, corrections: [], metrics };

  const corrections = [];
  if (Number(metrics.cameraShift || 0) > limits.maxCameraShift && Number(metrics.correctedCameraShift) <= limits.maxCameraShift) corrections.push('translation');
  if (Number(metrics.backgroundDrift || 0) > limits.maxBackgroundDrift && Number(metrics.correctedBackgroundDrift) <= limits.maxBackgroundDrift) corrections.push('background-lock');
  if (corrections.length) {
    return { grade: 'orange', exportAllowed: true, reasons: ['Dérive récupérable corrigée par MicroPlayer.'], corrections, metrics };
  }
  return { grade: 'green', exportAllowed: true, reasons: [], corrections: [], metrics };
}
