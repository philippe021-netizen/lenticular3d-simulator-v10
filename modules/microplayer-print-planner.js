// MicroPlayer: printer specification and lenticular output planning.
// Manufacturer resolution, RIP print mode and export raster are NOT interchangeable.
// Physical interlace pitch must be verified with a ruler/moire test on actual hardware.
export const PRINTER_PRESETS = Object.freeze([
  {
    id: 'canon-pro-200s', label: 'Canon PIXMA PRO-200S', kind: 'photo', technology: '8 encres colorantes, jet d’encre photo',
    maxPrinterDpiX: 4800, maxPrinterDpiY: 2400, resolutionLabel: '4 800 × 2 400 dpi maximum (adressage des gouttes)',
    inputRasterLabel: '600 × 600 dpi de départ à vérifier dans le pilote, pas une valeur constructeur garantie',
    printModeLabel: 'Pilote Canon · qualité élevée · mise à l’échelle désactivée',
    maxPrintWidthMm: 329, maxPrintHeightMm: 990.6, areaLabel: 'A3+ et formats personnalisés, jusqu’à 329 × 990,6 mm (bac supérieur)',
    feedLabel: '10 × 15 cm : alimentation supérieure. Alimentation manuelle à partir de 203,2 × 254 mm.',
    mediaLabel: 'Photo jet d’encre, 0,1–0,3 mm bac supérieur ou 0,1–0,6 mm alimentation manuelle, dans les limites du manuel selon le support.',
    limitation: 'En 10 × 15 cm, NE PAS sélectionner le bac manuel. Le bac supérieur doit correspondre au type et à l’épaisseur de la feuille.',
    supportedModes: [{x:600,y:600,label:'600 × 600 dpi · raster MicroPlayer actuel',experimental:false},{x:1200,y:1200,label:'1 200 × 1 200 dpi · expérimental, pilote à vérifier',experimental:true}],
    sourceUrls: ['https://www.usa.canon.com/shop/p/pixma-pro-200s','https://ij.manual.canon/ij/webmanual/Manual/All/PRO-200S%20series/EN/BG/bg_b330.html','https://ij.manual.canon/ij/webmanual/Manual/All/PRO-200S%20series/EN/BG/bg-013.html']
  },
  {
    id: 'roland-lef-20', label: 'Roland VersaUV LEF-20', kind: 'uv', technology: 'UV-LED à plat, CMJN + blanc / vernis selon la configuration des encres',
    maxPrinterDpiX: 1440, maxPrinterDpiY: 720, resolutionLabel: '1 440 × 720 dpi, mode haute qualité ; 720 × 720 dpi également documenté',
    inputRasterLabel: 'VersaWorks/RIP : vérifier l’absence de rééchantillonnage et l’orientation des axes',
    printModeLabel: 'Roland VersaWorks · mode et profil support à confirmer sur la machine',
    maxPrintWidthMm: 508, maxPrintHeightMm: 330, areaLabel: 'Zone imprimable 508 × 330 mm ; support maximal 538 × 360 mm, hauteur 100 mm, poids 5 kg',
    feedLabel: 'Plateau à plat ; position d’origine et hauteur du support à régler au laser / en machine.',
    mediaLabel: 'Impression UV directe PET / objets compatibles ; test d’adhérence et de repérage obligatoire avant tout usage lenticulaire.',
    limitation: 'La Roland ne fonctionne pas comme une imprimante papier classique : prévoir RIP, éventuelle sous-couche blanche, sens miroir et fixation. Les lentilles ne doivent pas être abîmées.',
    supportedModes: [{x:720,y:720,label:'720 × 720 dpi · mode Roland documenté',experimental:false},{x:1440,y:720,label:'1 440 × 720 dpi · mode haute qualité documenté',experimental:false}],
    sourceUrls: ['https://www.rolanddg.co.jp/corporate/news/2013/130924-roland-expands-versauv-line-with-new-larger-benchtop-uv-printer','https://www.rolanddga.com/en-la/company/pressroom/09242013-roland-expands-versauv-line-with-new-20-inch-benchtop-uv-flatbed-printer']
  },
  {
    id: 'hp-officejet-pro-8720', label: 'HP OfficeJet Pro 8720', kind: 'office', technology: 'Jet d’encre thermique, 4 encres pigmentaires',
    maxPrinterDpiX: 4800, maxPrinterDpiY: 1200, resolutionLabel: 'Couleur jusqu’à 4 800 × 1 200 dpi optimisés (entrée 1 200 × 1 200 dpi)',
    inputRasterLabel: '1 200 × 1 200 dpi en entrée pour le meilleur mode photo annoncé (selon papier et pilote)',
    printModeLabel: 'Pilote HP PCL 3 · papier photo · meilleure qualité · sans ajustement automatique',
    maxPrintWidthMm: 215.9, maxPrintHeightMm: 355.6, areaLabel: 'A4 standard / sans marges ; personnalisés jusqu’à 215,9 × 355,6 mm (bac 1)',
    feedLabel: 'Bac papier classique, pas de chemin manuel arrière pour papier épais.',
    mediaLabel: 'Papier photo jusqu’à 300 g/m² selon le guide HP ; vérifier rigidité et entraînement.',
    limitation: 'Résolution optimisée HP ≠ 4 800 dpi de fichier. Ne pas présumer que 260 g/m² passe si le papier est rigide ; privilégier les mires sur papier souple.',
    supportedModes: [{x:600,y:600,label:'600 × 600 dpi · raster de test, non garanti 1:1',experimental:true},{x:1200,y:1200,label:'1 200 × 1 200 dpi · entrée HP annoncée, à vérifier',experimental:true}],
    sourceUrls: ['https://support.hp.com/us-en/product/product-specs/hp-officejet-pro-8720-all-in-one-printer-series/7902032','https://www.hp.com/us-en/shop/pdp/hp-officejet-pro-8720-all-in-one-printer-m9l75a-b1h']
  }
]);

export const VIEW_CANDIDATES = Object.freeze([6,8,9,12]);
const round = number => Math.round(number * 1000000) / 1000000;
function fitsRotated(width,height,limitW,limitH) {
  return (width <= limitW && height <= limitH) || (height <= limitW && width <= limitH);
}

export function evaluatePrintSetup(input={}) {
  const printerId = String(input.printerId || 'canon-pro-200s');
  const printer = PRINTER_PRESETS.find(p=>p.id === printerId);
  if(!printer) throw new RangeError('Imprimante inconnue.');
  const dpiFallback = input.rasterDpi ?? 600;
  const rasterDpiX = Number(input.rasterDpiX ?? dpiFallback);
  const rasterDpiY = Number(input.rasterDpiY ?? dpiFallback);
  const nominalLpi = Number(input.nominalLpi ?? 50);
  const calibratedLpi = Number(input.calibratedLpi ?? nominalLpi);
  const widthMm = Number(input.widthMm ?? 150);
  const heightMm = Number(input.heightMm ?? 100);
  const lensOrientation = String(input.lensOrientation || 'vertical');
  const effect = String(input.effect || 'relief');
  if (![rasterDpiX,rasterDpiY,nominalLpi,calibratedLpi,widthMm,heightMm].every(Number.isFinite))
    throw new RangeError('DPI, LPI et format doivent être numériques.');
  if (![rasterDpiX,rasterDpiY].every(x=>x>=72 && x<=2400) ||
      ![nominalLpi,calibratedLpi].every(x=>x>=10 && x<=200))
    throw new RangeError('Résolution raster ou pitch hors limites.');
  if(!(widthMm>0 && heightMm>0 && widthMm<=2000 && heightMm<=2000))
    throw new RangeError('Dimensions physiques hors limites.');
  if(!['vertical','horizontal'].includes(lensOrientation))
    throw new RangeError('Orientation des lentilles invalide.');
  if(!['relief','flip'].includes(effect)) throw new RangeError("Type d’effet invalide.");

  // Vertical lenses => horizontal stripe sequence (raster X), and conversely.
  const effectiveDpi = lensOrientation === 'vertical' ? rasterDpiX : rasterDpiY;
  const pixelsPerLens = effectiveDpi / calibratedLpi;
  const outWidthPx = Math.round(widthMm * rasterDpiX / 25.4);
  const outHeightPx = Math.round(heightMm * rasterDpiY / 25.4);
  const totalPixels = outWidthPx * outHeightPx;
  const paperFits = fitsRotated(widthMm,heightMm,printer.maxPrintWidthMm,printer.maxPrintHeightMm);
  const candidates = VIEW_CANDIDATES.map(viewCount=>{
    const pixelsPerView=pixelsPerLens/viewCount;
    const exactIntegerStripes=Math.abs(pixelsPerView-Math.round(pixelsPerView))<1e-9;
    return {viewCount,pixelsPerView,exactIntegerStripes,assessment:pixelsPerView>=2 ? 'marge correcte (à tester)' :
      pixelsPerView>=1.5 ? 'limite à valider sur mire' : 'bandes fines, détail réduit'};
  });
  // Conservative *guidance*, not a verified maximum number of optical views.
  const viable = candidates.filter(c=>c.pixelsPerView>=1.5);
  const preferred = effect==='relief' ? [9,8,6,12] : [8,6,9,12];
  const suggestedViewCount=preferred.find(n=>viable.some(v=>v.viewCount===n)) ?? 6;
  const warnings=[];
  if(!paperFits) warnings.push('FORMAT HORS ZONE : dimensions supérieures à la zone constructeur, même après rotation. Ne pas envoyer au pilote.');
  if(pixelsPerLens<9) warnings.push('Moins de 9 pixels raster/lentille : 9 vues risquent des lacunes de détail.');
  if(totalPixels>40e6) warnings.push('Fichier volumineux : le travail sur iPad/Safari peut manquer de mémoire.');
  if(totalPixels>100e6) warnings.push('Grand raster : calcul/export sur PC recommandé après vérification du RIP.');
  if(Math.abs(calibratedLpi-nominalLpi)>1) warnings.push('Pitch mesuré éloigné du nominal : revérifier feuille et mesure.');
  if(printer.kind==='uv') {
    warnings.push('UV à plat : vérifier substrat, adhérence, ordre des couches (CMJN / blanc), lecture par les lentilles et mise en miroir.');
    if(rasterDpiX===1440 && rasterDpiY===720) warnings.push('Le mode 1 440 × 720 est ANISOTROPE : lentilles verticales = 1 440 dpi transversaux ; horizontales = 720 dpi transversaux.');
  }
  if(printer.kind==='photo' && Math.min(widthMm,heightMm)<203.2)
    warnings.push('Pour 10 × 15 cm : Canon bac SUPÉRIEUR uniquement, pas alimentation manuelle.');
  if(printer.kind==='office')
    warnings.push('HP : 4 800 × 1 200 « optimisés » ne signifie pas 4 800 × 1 200 pixels source. Tester à 600 puis 1 200 dpi avec mesure physique.');
  warnings.push('Les valeurs raster ne sont pas garanties 1:1 par le pilote/RIP : imprimer une mire à taille réelle, sans mise à l’échelle ni mode sans marges qui agrandit l’image.');
  const isPostal = fitsRotated(widthMm,heightMm,150,100) &&
    Math.abs(widthMm*heightMm-15000)<0.01; // exactly 100×150 in either direction
  const existingEngineSupportsNineViews = printerId==='canon-pro-200s' &&
    rasterDpiX===600 && rasterDpiY===600 && [50,60].includes(nominalLpi) && isPostal;
  return {
    printer,printerModel:String(input.printerModel || printer.label).trim().slice(0,120),
    rasterDpiX,rasterDpiY,nominalLpi,calibratedLpi,widthMm,heightMm,lensOrientation,effect,
    axisOfInterlace:lensOrientation==='vertical'?'horizontal (X)':'vertical (Y)',
    effectiveDpi,pixelsPerLens:round(pixelsPerLens),outWidthPx,outHeightPx,totalPixels,
    candidates,suggestedViewCount,paperFits,
    existingEngineSupportsNineViews,warnings,recommendations:warnings
  };
}
