// MicroPlayer: printer specification and lenticular output planning.
// Manufacturer resolution, RIP print mode and export raster are NOT interchangeable.
// Physical interlace pitch must be verified with a ruler/moire test on actual hardware.
export const PRINTER_PRESETS = Object.freeze([
  {
    id: 'canon-pro-200s', label: 'Canon PIXMA PRO-200S', kind: 'photo', technology: '8 encres colorantes, jet d’encre photo',
    maxPrinterDpiX: 4800, maxPrinterDpiY: 2400, resolutionLabel: '4 800 × 2 400 dpi maximum (adressage des gouttes)',
    inputRasterLabel: '600 × 600 dpi de départ à vérifier dans le pilote, pas une valeur constructeur garantie',
    printModeLabel: 'Pilote Canon · qualité élevée · mise à l’échelle désactivée',
    maxPrintWidthMm: 330.2, maxPrintHeightMm: 990.6, areaLabel: 'Papier jusqu’à 329 × 990,6 mm (haut) ou 330,2 × 990,6 mm (manuel). A3+ classique : 329 × 483 mm. Marges suivant pilote, papier et mode.',
    mediaSources: [
      {id:'top',label:'Bac supérieur',minWidthMm:89,minHeightMm:127,maxWidthMm:329,maxHeightMm:990.6,maxThicknessMm:0.3},
      {id:'manual',label:'Alimentation manuelle',minWidthMm:203.2,minHeightMm:254,maxWidthMm:330.2,maxHeightMm:990.6,maxThicknessMm:0.6}
    ],
    feedLabel: '10 × 15 cm : alimentation supérieure. Alimentation manuelle à partir de 203,2 × 254 mm.',
    mediaLabel: 'Photo jet d’encre, 0,1–0,3 mm bac supérieur ou 0,1–0,6 mm alimentation manuelle, dans les limites du manuel selon le support.',
    limitation: 'En 10 × 15 cm, NE PAS sélectionner le bac manuel. Le bac supérieur doit correspondre au type et à l’épaisseur de la feuille.',
    supportedModes: [{x:600,y:600,label:'600 × 600 dpi · raster MicroPlayer actuel',experimental:false},{x:1200,y:1200,label:'1 200 × 1 200 dpi · expérimental, pilote à vérifier',experimental:true}],
    sourceUrls: ['https://ij.manual.canon/ij/webmanual/Manual/All/PRO-200S%20series/EN/BG/bg_b330.html','https://ij.manual.canon/ij/webmanual/Manual/All/PRO-200S%20series/EN/BG/bg-013.html']
  },
  {
    id: 'roland-lef-20', label: 'Roland VersaUV LEF-20', kind: 'uv', technology: 'UV-LED à plat, CMJN + blanc / vernis selon la configuration des encres',
    maxPrinterDpiX: 1440, maxPrinterDpiY: 720, resolutionLabel: '1 440 × 720 dpi, mode haute qualité ; 720 × 720 dpi également documenté',
    inputRasterLabel: 'VersaWorks/RIP : vérifier l’absence de rééchantillonnage et l’orientation des axes',
    printModeLabel: 'Roland VersaWorks · mode et profil support à confirmer sur la machine',
    maxPrintWidthMm: 508, maxPrintHeightMm: 330, areaLabel: 'Zone imprimable 508 × 330 mm ; support / objet accepté jusqu’à 538 × 360 mm, hauteur 100 mm, poids 5 kg.',
    mediaSources: [
      {id:'flatbed',label:'Plateau UV (zone d’impression)',minWidthMm:0.1,minHeightMm:0.1,maxWidthMm:508,maxHeightMm:330,maxMediaWidthMm:538,maxMediaHeightMm:360}
    ],
    feedLabel: 'Plateau à plat ; position d’origine et hauteur du support à régler au laser / en machine.',
    mediaLabel: 'Impression UV directe PET / objets compatibles ; test d’adhérence et de repérage obligatoire avant tout usage lenticulaire.',
    limitation: 'La Roland ne fonctionne pas comme une imprimante papier classique : prévoir RIP, éventuelle sous-couche blanche, sens miroir et fixation. Les lentilles ne doivent pas être abîmées.',
    supportedModes: [{x:720,y:720,label:'720 × 720 dpi · mode Roland documenté',experimental:false},{x:1440,y:720,label:'1 440 × 720 dpi · mode haute qualité documenté',experimental:false}],
    sourceUrls: ['https://www.rolanddg.com/corporate/news/2013/130924-roland-expands-versauv-line-with-new-larger-benchtop-flatbed-uv-printer']
  },
  {
    id: 'hp-officejet-pro-8720', label: 'HP OfficeJet Pro 8720', kind: 'office', technology: 'Jet d’encre thermique, 4 encres pigmentaires',
    maxPrinterDpiX: 4800, maxPrinterDpiY: 1200, resolutionLabel: 'Couleur jusqu’à 4 800 × 1 200 dpi optimisés (entrée 1 200 × 1 200 dpi)',
    inputRasterLabel: '1 200 × 1 200 dpi en entrée pour le meilleur mode photo annoncé (selon papier et pilote)',
    printModeLabel: 'Pilote HP PCL 3 · papier photo · meilleure qualité · sans ajustement automatique',
    maxPrintWidthMm: 215.9, maxPrintHeightMm: 355.6, areaLabel: 'Papier personnalisé de 76,2 × 127 mm à 215,9 × 355,6 mm (bac 1). Sans marges sur papier photo jusqu’à A4.',
    mediaSources: [
      {id:'tray1',label:'Bac 1',minWidthMm:76.2,minHeightMm:127,maxWidthMm:215.9,maxHeightMm:355.6}
    ],
    feedLabel: 'Bac papier classique, pas de chemin manuel arrière pour papier épais.',
    mediaLabel: 'Papier photo jusqu’à 300 g/m² selon le guide HP ; vérifier rigidité et entraînement.',
    limitation: 'Résolution optimisée HP ≠ 4 800 dpi de fichier. Ne pas présumer que 260 g/m² passe si le papier est rigide ; privilégier les mires sur papier souple.',
    supportedModes: [{x:600,y:600,label:'600 × 600 dpi · raster de test, non garanti 1:1',experimental:true},{x:1200,y:1200,label:'1 200 × 1 200 dpi · entrée HP annoncée, à vérifier',experimental:true}],
    sourceUrls: ['https://www.hp.com/us-en/shop/pdp/hp-officejet-pro-8720-all-in-one-printer-m9l75a-b1h']
  }
]);

export const FORMAT_PRESETS = Object.freeze([
  {id:'postcard-landscape',label:'10 × 15 cm · paysage',widthMm:150,heightMm:100},
  {id:'postcard-portrait',label:'10 × 15 cm · portrait',widthMm:100,heightMm:150},
  {id:'photo-13x18',label:'13 × 18 cm',widthMm:130,heightMm:180},
  {id:'a4-portrait',label:'A4 · portrait',widthMm:210,heightMm:297},
  {id:'a4-landscape',label:'A4 · paysage',widthMm:297,heightMm:210},
  {id:'a3-portrait',label:'A3 · portrait',widthMm:297,heightMm:420},
  {id:'a3-landscape',label:'A3 · paysage',widthMm:420,heightMm:297},
  {id:'a3plus-portrait',label:'A3+ · 329 × 483 mm',widthMm:329,heightMm:483},
  {id:'panorama-210x594',label:'Panoramique · 210 × 594 mm',widthMm:210,heightMm:594},
  {id:'custom',label:'Personnalisé · dimensions en mm',widthMm:null,heightMm:null}
]);

// Physical substrate limits, NOT guaranteed borderless/ink coverage.
// Feed orientation is normalized to short side x long side.
export function assessMediaDimensions({
  printerId='canon-pro-200s', widthMm=150, heightMm=100,
  feedSource='auto', mediaThicknessMm=null
}={}) {
  const printer=PRINTER_PRESETS.find(p=>p.id===printerId);
  if(!printer)throw new RangeError('Imprimante inconnue.');
  const w=Number(widthMm),h=Number(heightMm);
  const thick=mediaThicknessMm===''||mediaThicknessMm==null?null:Number(mediaThicknessMm);
  if(!Number.isFinite(w)||!Number.isFinite(h)||!(w>0&&h>0))
    throw new RangeError('Dimensions du support incorrectes.');
  if(thick!==null&&(!Number.isFinite(thick)||thick<0||thick>100))
    throw new RangeError('Épaisseur du support invalide.');
  const selected=String(feedSource||'auto');
  const sources=printer.mediaSources;
  if(selected!=='auto'&&!sources.some(p=>p.id===selected))
    throw new RangeError('Source papier/plateau invalide pour cette imprimante.');
  const candidates=sources.map(source=>{
    const lowerW=Math.min(w,h), upperH=Math.max(w,h);
    const sizeFits=lowerW>=source.minWidthMm-1e-6 &&
      upperH>=source.minHeightMm-1e-6 &&
      lowerW<=source.maxWidthMm+1e-6 &&
      upperH<=source.maxHeightMm+1e-6;
    const thicknessFits=thick===null||source.maxThicknessMm===undefined||thick<=source.maxThicknessMm+1e-6;
    return {...source,sizeFits,thicknessFits,compatible:sizeFits&&thicknessFits};
  });
  const eligible=candidates.filter(x=>x.compatible && (selected==='auto'||selected===x.id));
  // Auto: prefer the top feed for Canon thin paper, manual if too thick.
  const chosen=eligible[0]||null;
  const outOfBounds=!chosen;
  const maxMaterial=printerId==='roland-lef-20' ?
    {widthMm:538,heightMm:360,description:'dimensions maximales du support (objet), pas de l’image'} :
    null;
  const maxImage=printerId==='roland-lef-20'?
    {widthMm:508,heightMm:330,kind:'surface imprimable',description:'zone UV, hors marges de sécurité du montage'} :
    {widthMm:Math.max(...sources.map(x=>x.maxWidthMm)),heightMm:Math.max(...sources.map(x=>x.maxHeightMm)),kind:'papier accepté',description:'format support ; zone imprimable dépend des marges et du pilote'};
  const advisory=[];
  if(outOfBounds) {
    advisory.push('FORMAT INCOMPATIBLE avec la source choisie, la taille du plateau ou l’épaisseur renseignée.');
  } else if(chosen) {
    advisory.push('Format physiquement admissible via '+chosen.label+'. La surface sans marges n’est pas garantie.');
  }
  if(printerId==='canon-pro-200s'&&Math.min(w,h)<203.2)
    advisory.push('Canon : ce petit format exige le bac supérieur (le manuel ne charge pas le 10 × 15).');
  if(printerId==='canon-pro-200s'&&Math.max(w,h)>594)
    advisory.push('Canon : format panoramique très long. Prévoir support du papier pendant le chargement et la sortie.');
  if(printerId==='hp-officejet-pro-8720'&&Math.max(w,h)>297)
    advisory.push('HP : format personnalisé au-delà d’A4, sans garantie de mode sans marges.');
  if(printerId==='roland-lef-20')
    advisory.push('Roland : zone imprimée 508 × 330 mm, distincte du support physique 538 × 360 mm.');
  return {
    compatible:!outOfBounds, feedSource:chosen?.id??null,feedLabel:chosen?.label??null,
    requestedFeed:selected,mediaThicknessMm:thick,
    feedCandidates:candidates.map(c=>({id:c.id,label:c.label,compatible:c.compatible,sizeFits:c.sizeFits,thicknessFits:c.thicknessFits})),
    maxImage,maxMaterial,advisory
  };
}

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
  const media=assessMediaDimensions({printerId,widthMm,heightMm,
    feedSource:input.feedSource??'auto',mediaThicknessMm:input.mediaThicknessMm??null});
  const paperFits=media.compatible;
  const candidates = VIEW_CANDIDATES.map(viewCount=>{
    const pixelsPerView=pixelsPerLens/viewCount;
    const exactIntegerStripes=Math.abs(pixelsPerView-Math.round(pixelsPerView))<1e-9;
    return {viewCount,pixelsPerView,exactIntegerStripes,assessment:pixelsPerView>=2 ? 'marge correcte (à tester)' :
      pixelsPerView>=1.5 ? 'limite à valider sur mire' : 'bandes fines, détail réduit'};
  });
  // Conservative *guidance*, not a verified maximum number of optical views.
  const viable = candidates.filter(c=>c.pixelsPerView>=1.5);
  // Prefer full-pixel stripes when they remain at least 1.5 pixels wide.
  // Example: Roland HQ 1440 (X)/60 LPI => 24 px/lens; 8 and 12 fit, 9 does not.
  const clean = viable.filter(c=>c.exactIntegerStripes);
  const priorities = effect==='relief' ? [8,12,6,9] : [8,6,12,9];
  const suggestedViewCount = clean.length ?
    (priorities.find(n=>clean.some(c=>c.viewCount===n)) ?? clean[0].viewCount) :
    ([9,8,6,12].find(n=>viable.some(c=>c.viewCount===n && c.pixelsPerView>=2)) ??
     [8,9,6,12].find(n=>viable.some(c=>c.viewCount===n)) ?? 6);
  const suggestedAlternatives = clean.filter(c=>c.viewCount!==suggestedViewCount).map(c=>c.viewCount);
  const warnings=[];
  if(!paperFits) warnings.push('FORMAT / ALIMENTATION INCOMPATIBLE : dimensions ou épaisseur non acceptées. Ne pas lancer l’impression.');
  warnings.push(...media.advisory);
  if(pixelsPerLens<9) warnings.push('Moins de 9 pixels raster/lentille : 9 vues risquent des lacunes de détail.');
  if(pixelsPerLens/9<1.5) warnings.push('9 vues produiraient moins de 1,5 pixel par vue et par lentille sur le raster. Envisager moins de vues pour gagner en netteté.');
  if(totalPixels>40e6) warnings.push('Fichier volumineux : le travail sur iPad/Safari peut manquer de mémoire.');
  if(totalPixels>100e6) warnings.push('Grand raster : calcul/export sur PC recommandé après vérification du RIP.');
  if(Math.abs(calibratedLpi-nominalLpi)>1) warnings.push('Pitch mesuré éloigné du nominal : revérifier feuille et mesure.');
  if(printer.kind==='uv') {
    warnings.push('UV à plat : vérifier substrat, adhérence, ordre des couches (CMJN / blanc), lecture par les lentilles et mise en miroir.');
    if(rasterDpiX===1440 && rasterDpiY===720) warnings.push('Le mode 1 440 × 720 est ANISOTROPE : lentilles verticales = 1 440 dpi transversaux ; horizontales = 720 dpi transversaux.');
  }

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
    candidates,suggestedViewCount,suggestedAlternatives,paperFits,media,
    existingEngineSupportsNineViews,warnings,recommendations:warnings
  };
}
