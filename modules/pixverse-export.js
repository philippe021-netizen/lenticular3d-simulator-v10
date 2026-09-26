export function createMotionExportManifest(frames, identityQc, details = {}) {
  if (identityQc?.passed !== true) throw new Error('QC identité non validé : export refusé.');
  if (!Array.isArray(frames) || frames.length !== 9) throw new Error('L’export de production exige exactement 9 vues.');
  for (let i = 0; i < frames.length; i++) {
    if (Number(frames[i]?.index) !== i + 1 || !frames[i]?.blob) {
      throw new Error('Les 9 vues doivent être présentes dans l’ordre 01 → 09.');
    }
  }
  const viewFiles = frames.map((_, i) => 'views/view_' + String(i + 1).padStart(2, '0') + '.png');
  return {
    schema: 'microplayer-pixverse-v3',
    version: 3,
    created: new Date().toISOString(),
    source_engine: 'pixverse-mimic-v3',
    view_count: 9,
    view_order: 'left-to-right',
    center_view: 5,
    view_files: viewFiles,
    lpi: 60,
    identity_qc: identityQc,
    extraction: details.extraction || null,
    action: details.action || null,
    locked_region: details.lockedRegion || null,
    frames: frames.map((frame, i) => ({ index: i + 1, file: viewFiles[i], time: Number(frame.time) || 0 }))
  };
}
