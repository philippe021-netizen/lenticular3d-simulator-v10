const FAMILY_SUBJECTS = {
  person: ['person-single'],
  couple: ['couple'],
  group: ['group'],
  animal: ['dog', 'cat'],
  logo: ['object'],
  object: ['object'],
  vehicle: ['vehicle']
};

const DEFAULT_MICROPLAYER = Object.freeze({
  strategy: 'progressive-nine-with-stabilization',
  lpi: 60,
  viewCount: 9
});

const DEFAULT_QC = Object.freeze({
  maxSceneCut: 0.18,
  maxHeadDrift: 0.035,
  maxBackgroundDrift: 0.06,
  maxCameraShift: 0.025,
  maxAdjacentJump: 0.22,
  maxReverseRatio: 0.12
});

function normalizeVariant(variant = {}, defaults = {}) {
  const family = variant.family || 'person';
  const nestedPixVerse = variant.pixverse || {};
  return {
    ...variant,
    compatibleSubjects: variant.compatibleSubjects || FAMILY_SUBJECTS[family] || ['object'],
    pixverse: {
      mode: nestedPixVerse.mode || 'standard',
      fallbackMode: nestedPixVerse.fallbackMode || 'standard',
      model: nestedPixVerse.model || (nestedPixVerse.mode === 'mimic' ? 'mimic' : 'v6'),
      quality: nestedPixVerse.quality || variant.quality || defaults.quality || '540p',
      prompt: nestedPixVerse.prompt || variant.prompt || '',
      negativePrompt: nestedPixVerse.negativePrompt || variant.negativePrompt || '',
      parameters: nestedPixVerse.parameters || {}
    },
    motion: {
      allowedZones: [],
      lockedZones: ['background'],
      finalStateTarget: 0.94,
      minimumUsefulSpan: 0.68,
      ...(variant.motion || {})
    },
    framing: {
      rule: 'keep-full-gesture',
      safeMargin: 0.12,
      fill: 'edge-extend',
      ...(variant.framing || {})
    },
    microplayer: { ...DEFAULT_MICROPLAYER, ...(variant.microplayer || {}) },
    qc: { ...DEFAULT_QC, ...(variant.qc || {}) }
  };
}

export function normalizeActionLibrary(raw) {
  const copy = structuredClone(raw || {});
  const defaults = copy.defaults || {};
  copy.version = 11;
  copy.actions = (copy.actions || []).map(action => ({
    ...action,
    commercialName: action.commercialName || action.label || action.id,
    variants: (action.variants || []).map(variant => normalizeVariant(variant, defaults))
  }));
  return copy;
}

export function validateActionVariant(variant = {}) {
  const errors = [];
  if (!variant.id) errors.push('Identifiant de variante manquant.');
  if (!Array.isArray(variant.compatibleSubjects) || !variant.compatibleSubjects.length) errors.push('Compatibilité sujet manquante.');
  if (variant.pixverse?.mode === 'mimic' && !variant.guide?.url) errors.push('Une vidéo guide est requise pour Mimic.');
  if (variant.microplayer?.lpi !== 60) errors.push('Une animation MicroPlayer doit sortir en 60 LPI.');
  if (variant.microplayer?.viewCount !== 9) errors.push('Une animation MicroPlayer doit contenir exactement 9 vues.');
  return { valid: errors.length === 0, errors };
}

export function resolvePixVerseMode({ requestedMode = 'auto', subjectType, guide, pixverse = {} } = {}) {
  if (requestedMode && requestedMode !== 'auto') return { mode: requestedMode, reason: 'expert-override' };
  const mimicSubjects = new Set(['person-single', 'dog', 'cat']);
  if (guide?.url && mimicSubjects.has(subjectType) && pixverse.mode === 'mimic') {
    return { mode: 'mimic', reason: 'compatible-motion-guide' };
  }
  return { mode: pixverse.fallbackMode || 'standard', reason: 'capability-fallback' };
}
