const ID_RE = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const ZONE_RE = /^[a-z][a-z0-9_-]{1,47}$/;
const ALLOWED_TARGETS = new Set(['person', 'couple', 'group', 'animal', 'object']);
const ALLOWED_MODES = new Set(['mimic', 'standard', 'transition', 'omni']);

function strings(values, re = null) {
  if (!Array.isArray(values)) return [];
  const out = values.map(v => String(v || '').trim()).filter(Boolean);
  return re ? out.filter(v => re.test(v)) : out;
}

export function normalizeActionPreset(raw = {}) {
  const preset = {
    id: String(raw.id || '').trim().toLowerCase(),
    label: String(raw.label || '').trim(),
    target: ALLOWED_TARGETS.has(raw.target) ? raw.target : 'person',
    preferredMode: ALLOWED_MODES.has(raw.preferredMode) ? raw.preferredMode : 'mimic',
    prompt: String(raw.prompt || '').trim(),
    negativePrompt: String(raw.negativePrompt || '').trim(),
    guideHint: String(raw.guideHint || '').trim(),
    durationSeconds: Math.max(1, Math.min(30, Number(raw.durationSeconds) || 3)),
    mobileZones: strings(raw.mobileZones, ZONE_RE),
    lockedZones: strings(raw.lockedZones, ZONE_RE),
    safeMargin: Math.max(0, Math.min(0.3, Number(raw.safeMargin) || 0.08)),
    finalHoldRatio: Math.max(0, Math.min(0.5, Number(raw.finalHoldRatio) || 0.2))
  };
  return preset;
}

export function validateActionPreset(raw) {
  const preset = normalizeActionPreset(raw);
  const errors = [];
  if (!ID_RE.test(preset.id)) errors.push('id invalide');
  if (!preset.label) errors.push('label manquant');
  if (!preset.prompt) errors.push('prompt manquant');
  if (!preset.mobileZones.length) errors.push('au moins une zone mobile est requise');
  const overlap = preset.mobileZones.filter(z => preset.lockedZones.includes(z));
  if (overlap.length) errors.push(`zones à la fois mobiles et verrouillées: ${overlap.join(', ')}`);
  if (preset.preferredMode === 'mimic' && !['person', 'couple', 'group', 'animal'].includes(preset.target)) {
    errors.push('Mimic n’est pas le mode par défaut pour un objet');
  }
  return { ok: errors.length === 0, errors, preset };
}

export function validateActionCatalog(catalog) {
  const items = Array.isArray(catalog?.actions) ? catalog.actions : [];
  const results = items.map(validateActionPreset);
  const ids = new Set();
  for (const result of results) {
    if (ids.has(result.preset.id)) result.errors.push('id dupliqué');
    ids.add(result.preset.id);
    result.ok = result.errors.length === 0;
  }
  return {
    ok: results.length > 0 && results.every(r => r.ok),
    version: Number(catalog?.version || 0),
    results,
    actions: results.filter(r => r.ok).map(r => r.preset)
  };
}
