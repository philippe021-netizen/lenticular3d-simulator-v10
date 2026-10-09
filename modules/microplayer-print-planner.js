// Pure analysis for the MicroPlayer print setup page.
// IMPORTANT: manufacturers' headline inkjet DPI are drop-addressing figures,
// not necessarily the raster resolution accepted unmodified by the driver/RIP.
export const PRINTER_PRESETS = Object.freeze([
  { id: 'canon-pro-200s', label: 'Canon PIXMA PRO-200S', maxPrinterDpiX: 4800, maxPrinterDpiY: 2400, kind: 'photo', verified: true },
  { id: 'epson-et-2850', label: 'Epson EcoTank ET-2850', maxPrinterDpiX: 5760, maxPrinterDpiY: 1440, kind: 'photo', verified: true },
  { id: 'roland-custom', label: 'Roland (modèle / RIP à préciser)', maxPrinterDpiX: null, maxPrinterDpiY: null, kind: 'rip', verified: false },
  { id: 'hp-custom', label: 'HP (modèle à préciser)', maxPrinterDpiX: null, maxPrinterDpiY: null, kind: 'photo', verified: false },
  { id: 'other-custom', label: 'Autre imprimante / laboratoire', maxPrinterDpiX: null, maxPrinterDpiY: null, kind: 'custom', verified: false }
]);

export const VIEW_CANDIDATES = Object.freeze([6, 8, 9, 12]);

export function evaluatePrintSetup(input = {}) {
  const printerId = String(input.printerId || 'canon-pro-200s');
  const preset = PRINTER_PRESETS.find(p => p.id === printerId);
  if (!preset) throw new RangeError('Imprimante non reconnue.');
  const rasterDpi = Number(input.rasterDpi ?? 600);
  const nominalLpi = Number(input.nominalLpi ?? 50);
  const calibratedLpi = Number(input.calibratedLpi ?? nominalLpi);
  const widthMm = Number(input.widthMm ?? 150);
  const heightMm = Number(input.heightMm ?? 100);
  const lensOrientation = String(input.lensOrientation || 'vertical');
  const effect = String(input.effect || 'relief');
  if (![rasterDpi, nominalLpi, calibratedLpi, widthMm, heightMm].every(Number.isFinite)) {
    throw new RangeError('Les valeurs de résolution, de pitch et de format doivent être numériques.');
  }
  if (!(rasterDpi >= 72 && rasterDpi <= 2400) || !(nominalLpi >= 10 && nominalLpi <= 200) ||
      !(calibratedLpi >= 10 && calibratedLpi <= 200)) {
    throw new RangeError('Résolution raster ou pitch hors limites.');
  }
  if (!(widthMm > 0 && heightMm > 0 && widthMm <= 2000 && heightMm <= 2000)) {
    throw new RangeError('Dimensions physiques hors limites.');
  }
  if (lensOrientation !== 'vertical' && lensOrientation !== 'horizontal') {
    throw new RangeError('Orientation des lentilles invalide.');
  }
  if (effect !== 'relief' && effect !== 'flip') throw new RangeError("Type d'effet invalide.");
  const pixelsPerLens = rasterDpi / calibratedLpi;
  const outWidthPx = Math.round(widthMm * rasterDpi / 25.4);
  const outHeightPx = Math.round(heightMm * rasterDpi / 25.4);
  const totalPixels = outWidthPx * outHeightPx;
  const candidates = VIEW_CANDIDATES.map(viewCount => {
    const pixelsPerView = pixelsPerLens / viewCount;
    const roundedPitch = Math.round(pixelsPerLens);
    const exactIntegerStripes = Math.abs(pixelsPerLens - roundedPitch) < 1e-9 &&
      roundedPitch % viewCount === 0;
    return {
      viewCount,
      pixelsPerView,
      exactIntegerStripes,
      assessment: pixelsPerView >= 2 ? 'confortable' : pixelsPerView >= 1.5 ? 'à tester' : 'fin / risque de perte de détail'
    };
  });
  const recommendations = [];
  if (pixelsPerLens < 9) recommendations.push("Moins de 9 pixels raster par lentille : l'interlacement 9 vues risque une perte de détail.");
  if (totalPixels > 40_000_000) recommendations.push('Raster très volumineux : attention à la mémoire, surtout sur iPad/Safari.');
  if (totalPixels > 100_000_000) recommendations.push("Export direct déconseillé sur tablette ; prévoir une génération sur PC.");
  if (Math.abs(calibratedLpi - nominalLpi) > 1) recommendations.push('Écart de pitch important : vérifier la feuille et la mesure.');
  if (!preset.verified) recommendations.push('Renseigner le modèle exact et le mode RIP/pilote avant toute recommandation de production.');
  recommendations.push("Le DPI constructeur (gouttelettes) ne garantit pas un raster accepté sans rééchantillonnage. Contrôler le pilote ou le RIP puis mesurer sur tirage.");
  recommendations.push("À 100 % / taille réelle : désactiver toute mise à l'échelle automatique, puis confirmer le pitch et la phase avec une mire imprimée.");
  const currentEngineCompatible = rasterDpi === 600 && nominalLpi === 50 || rasterDpi === 600 && nominalLpi === 60;
  const isPostal = (Math.abs(widthMm - 150) < 0.01 && Math.abs(heightMm - 100) < 0.01) ||
                   (Math.abs(widthMm - 100) < 0.01 && Math.abs(heightMm - 150) < 0.01);
  return {
    printer: preset,
    printerModel: String(input.printerModel || preset.label).trim().slice(0, 120),
    rasterDpi, nominalLpi, calibratedLpi, widthMm, heightMm, lensOrientation, effect,
    axisOfInterlace: lensOrientation === 'vertical' ? 'horizontal (X)' : 'vertical (Y)',
    pixelsPerLens, outWidthPx, outHeightPx, totalPixels,
    candidates,
    existingEngineSupportsNineViews: currentEngineCompatible && isPostal,
    recommendations
  };
}
