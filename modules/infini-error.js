export function infiniErrorMessage(error) {
  const raw = String(error?.message || error || 'Erreur inconnue').replace(/\s+/g, ' ').trim();
  const fallback = 'Tu peux relancer plus tard ou charger un scene.ply dans le champ PLY manuel.';
  if (/zerogpu|quota|exceeded.*runs|resource exhausted|too many requests|\b429\b/i.test(raw)) {
    return 'Limite de quota InfiniSplat (ZeroGPU) atteinte. MicroPlayer est disponible ; ' + fallback;
  }
  if (/failed to fetch|network|timeout|timed out|\b5\d\d\b|cors|unavailable|disconnected/i.test(raw)) {
    return 'Le service InfiniSplat est inaccessible ou a expiré. Le chargement local MicroPlayer reste disponible. ' + fallback;
  }
  return 'Échec dans MicroPlayer pendant la préparation ou le transfert de la photo : ' + raw + '. ' + fallback;
}
