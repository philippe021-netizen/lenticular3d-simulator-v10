import {
  addPngPhysicalResolution,
  calibrationPitchValues,
  createPrintSpec
} from './lenticular-print-core.js';
import {
  buildExactSizePdf,
  buildPrintManifest,
  calculateCropRect,
  calculateSafeArea,
  compressCanvasRgbForPdf,
  createRenderSignature,
  generateCalibrationCanvas,
  renderInterlacedPng,
  sortNineViewFiles,
  validateSharedAspectRatio
} from './lenticular-print-browser.js';

const $ = id => document.getElementById(id);
const state = {
  files: [], images: [], urls: [], result: null, resultBlob: null, resultSignature: null,
  manifest: null, calibrationBlob: null, calibrationManifest: null,
  renderGeneration: 0, isRendering: false
};
const profileKey = 'microplayer:lenticular-print:canon-pro-200s:v1';
const profile = loadProfile();
const cropCanvas = $('cropPreview');
const cropContext = cropCanvas.getContext('2d');
const outputCanvas = $('outputCanvas');
const renderControlIds = ['viewFiles', 'viewZip', 'orientation', 'nominalLpi', 'calibratedLpi', 'phasePx', 'lensOrientation', 'reverseOrder', 'zoom', 'panX', 'panY'];

function setRenderingControls(disabled) {
  state.isRendering = disabled;
  for (const id of renderControlIds) $(id).disabled = disabled;
  $('render').disabled = disabled || state.images.length !== 9;
}

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(profileKey) || '{}'); }
  catch { return {}; }
}
function saveProfile() {
  try {
    localStorage.setItem(profileKey, JSON.stringify({
      orientation: $('orientation').value,
      widthMm: 100,
      heightMm: 150,
      nominalLpi: Number($('nominalLpi').value),
      calibratedLpi: Number($('calibratedLpi').value),
      lensOrientation: $('lensOrientation').value,
      phasePx: Number($('phasePx').value),
      reverseOrder: $('reverseOrder').checked,
      dpi: 600,
      viewCount: 9,
      printer: 'Canon PIXMA PRO-200S'
    }));
  } catch { /* private browsing can disable localStorage */ }
}

function setStatus(element, message, tone = '') {
  element.textContent = message;
  element.className = `status${tone ? ` ${tone}` : ''}`;
}
function cropOptions() {
  return {
    zoom: Number($('zoom').value),
    panX: Number($('panX').value),
    panY: Number($('panY').value)
  };
}
function buildSpec() {
  const nominalLpi = Number($('nominalLpi').value);
  return createPrintSpec({
    orientation: $('orientation').value,
    dpi: 600,
    nominalLpi,
    calibratedLpi: Number($('calibratedLpi').value),
    lensOrientation: $('lensOrientation').value,
    phasePx: Number($('phasePx').value),
    reverseOrder: $('reverseOrder').checked
  });
}
function cropPreview() {
  if (!state.images.length) return;
  const image = state.images[0];
  const spec = buildSpec();
  const ratio = spec.width / spec.height;
  cropCanvas.width = ratio < 1 ? 600 : 900;
  cropCanvas.height = ratio < 1 ? 900 : 600;
  cropCanvas.style.aspectRatio = `${spec.width} / ${spec.height}`;
  const crop = calculateCropRect(image.naturalWidth, image.naturalHeight, ratio, cropOptions());
  cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropContext.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, cropCanvas.width, cropCanvas.height);
  const safe = calculateSafeArea({
    width: cropCanvas.width, height: cropCanvas.height,
    targetWidthMm: spec.targetWidthMm, targetHeightMm: spec.targetHeightMm
  });
  cropContext.save();
  cropContext.lineWidth = 3;
  cropContext.strokeStyle = '#0879bd';
  cropContext.strokeRect(1.5, 1.5, cropCanvas.width - 3, cropCanvas.height - 3);
  cropContext.strokeStyle = '#ffd21c';
  cropContext.setLineDash([10, 7]);
  cropContext.strokeRect(safe.left, safe.top, safe.right - safe.left, safe.bottom - safe.top);
  cropContext.restore();
}
function updateControls() {
  const nominal = Number($('nominalLpi').value);
  const calibrated = $('calibratedLpi');
  calibrated.min = String(nominal - 1);
  calibrated.max = String(nominal + 1);
  calibrated.value = String(Math.max(nominal - 1, Math.min(nominal + 1, Number(calibrated.value))));
  const halfLens = 600 / Number(calibrated.value) / 2;
  $('phasePx').min = String(-halfLens);
  $('phasePx').max = String(halfLens);
  $('lpiValue').textContent = `${Number(calibrated.value).toFixed(2).replace('.', ',')} LPI`;
  $('phaseValue').textContent = `${Number($('phasePx').value).toFixed(2).replace('.', ',')} px`;
  $('zoomValue').textContent = `${Number($('zoom').value).toFixed(2).replace('.', ',')}×`;
  $('panXValue').textContent = Number($('panX').value).toFixed(2).replace('.', ',');
  $('panYValue').textContent = Number($('panY').value).toFixed(2).replace('.', ',');
  if (state.result && state.resultSignature !== createRenderSignature(buildSpec(), cropOptions())) {
    state.result = null;
    state.resultBlob = null;
    state.resultSignature = null;
    state.manifest = null;
    outputCanvas.classList.add('hidden');
    $('emptyOutput').classList.remove('hidden');
    $('resultMeta').textContent = '';
    $('downloadPng').disabled = true;
    $('downloadPdf').disabled = true;
    $('downloadBundle').disabled = true;
    setStatus($('renderStatus'), 'Un réglage a changé. Vérifie le cadrage puis relance l’interlacement.', 'good');
  }
  $('render').disabled = state.isRendering || state.images.length !== 9;
  if (state.images.length) cropPreview();
  saveProfile();
}

function releaseImages() {
  state.urls.forEach(url => URL.revokeObjectURL(url));
  state.urls = [];
  state.images = [];
}
async function blobToImage(blob, urls = state.urls) {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Une vue ne peut pas être décodée.'));
    image.src = url;
  });
  return image;
}
async function loadViews(files, { alreadyOrdered = false, sourceLabel = 'Vues chargées' } = {}) {
  const sorted = alreadyOrdered ? Array.from(files) : sortNineViewFiles(files);
  if (sorted.length !== 9) throw new RangeError('Il faut exactement 9 vues.');
  const generation = ++state.renderGeneration;
  if (state.isRendering) setRenderingControls(false);
  const images = [];
  const urls = [];
  try {
    for (const file of sorted) images.push(await blobToImage(file, urls));
    validateSharedAspectRatio(images);
  } catch (error) {
    urls.forEach(url => URL.revokeObjectURL(url));
    throw error;
  }
  if (generation !== state.renderGeneration) {
    urls.forEach(url => URL.revokeObjectURL(url));
    return;
  }
  releaseImages();
  state.urls = urls;
  state.files = sorted;
  state.result = null;
  state.resultBlob = null;
  state.resultSignature = null;
  state.manifest = null;
  $('downloadPng').disabled = true;
  $('downloadPdf').disabled = true;
  $('downloadBundle').disabled = true;
  $('outputCanvas').classList.add('hidden');
  $('emptyOutput').classList.remove('hidden');
  $('resultMeta').textContent = '';
  $('viewCount').textContent = 'Chargement des vues…';
  const dimensions = new Set(images.map(image => `${image.naturalWidth}×${image.naturalHeight}`));
  state.images = images;
  $('viewCount').textContent = `9 vues prêtes · ${images[0].naturalWidth} × ${images[0].naturalHeight} px${dimensions.size > 1 ? ` · ${dimensions.size} tailles détectées` : ''}`;
  setStatus($('sourceStatus'), `${sourceLabel}. Vérifie le cadrage commun avant l’interlacement.`, 'good');
  setStatus($('renderStatus'), '9 vues prêtes. Vérifie le cadrage puis touche « Interlacer les 9 vues ».', 'good');
  updateControls();
}

$('viewFiles').addEventListener('change', async event => {
  try {
    await loadViews(event.target.files);
    $('viewZip').value = '';
  } catch (error) {
    setStatus($('sourceStatus'), error.message, 'error');
  }
});
$('viewZip').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!window.JSZip) throw new Error('Le lecteur ZIP est indisponible; charge les neuf PNG séparément.');
    const archive = await window.JSZip.loadAsync(file);
    const entries = Object.values(archive.files).filter(entry => !entry.dir && /vue[-_ ]?0*[1-9](?:\D|$)/i.test(entry.name));
    const ordered = sortNineViewFiles(entries);
    const views = [];
    for (const entry of ordered) {
      const blob = await entry.async('blob');
      views.push(new File([blob], entry.name.split('/').pop(), { type: blob.type || 'image/png' }));
    }
    await loadViews(views, { alreadyOrdered: true, sourceLabel: `ZIP ${file.name} ouvert` });
    $('viewFiles').value = '';
  } catch (error) {
    setStatus($('sourceStatus'), error.message || 'Impossible de lire ce ZIP.', 'error');
  }
});

for (const id of ['orientation', 'nominalLpi', 'calibratedLpi', 'phasePx', 'lensOrientation', 'reverseOrder', 'zoom', 'panX', 'panY']) {
  $(id).addEventListener(id === 'orientation' || id === 'nominalLpi' || id === 'lensOrientation' || id === 'reverseOrder' ? 'change' : 'input', () => {
    updateControls();
  });
}

$('render').addEventListener('click', async () => {
  if (state.isRendering || state.images.length !== 9) return;
  const generation = ++state.renderGeneration;
  const images = state.images.slice();
  const files = state.files.slice();
  const spec = buildSpec();
  const crop = cropOptions();
  const signature = createRenderSignature(spec, crop);
  state.result = null;
  state.resultBlob = null;
  state.resultSignature = null;
  state.manifest = null;
  $('downloadPng').disabled = true;
  $('downloadPdf').disabled = true;
  $('downloadBundle').disabled = true;
  outputCanvas.classList.add('hidden');
  $('emptyOutput').classList.remove('hidden');
  $('resultMeta').textContent = '';
  setRenderingControls(true);
  $('progress').classList.remove('hidden');
  $('progress').value = 0;
  setStatus($('renderStatus'), 'Préparation du raster 600 DPI…');
  try {
    const result = await renderInterlacedPng(images, spec, crop, progress => {
      $('progress').value = progress.complete / progress.total * 100;
      setStatus($('renderStatus'), `Interlacement ligne ${progress.complete.toLocaleString('fr-FR')} / ${progress.total.toLocaleString('fr-FR')}…`);
    }, outputCanvas, () => generation === state.renderGeneration);
    if (generation !== state.renderGeneration || signature !== createRenderSignature(buildSpec(), cropOptions())) {
      throw new Error('Les paramètres ont changé pendant le calcul. Relance l’interlacement.');
    }
    state.result = result;
    state.resultBlob = result.blob;
    state.resultSignature = signature;
    const bitmap = await createImageBitmap(result.blob);
    if (bitmap.width !== spec.width || bitmap.height !== spec.height) throw new Error('Les dimensions du PNG rouvert ne correspondent pas au raster prévu.');
    bitmap.close?.();
    const order = Array.from({ length: 9 }, (_, index) => spec.reverseOrder ? 9 - index : index + 1);
    state.manifest = buildPrintManifest(spec, {
      viewOrder: order,
      sourceNames: files.map(file => file.name),
      crop,
      appVersion: 'HappyHolo V4.6 / MicroPlayer impression lenticulaire 0.1'
    });
    outputCanvas.classList.remove('hidden');
    $('emptyOutput').classList.add('hidden');
    updateTechnicalZoom();
    $('resultMeta').textContent = `${spec.targetWidthMm} × ${spec.targetHeightMm} mm · ${spec.width} × ${spec.height} px · ${spec.dpi} DPI · ${spec.nominalLpi} LPI nominal / ${spec.calibratedLpi.toFixed(2)} LPI calibré · ${spec.pixelsPerLens.toFixed(4)} px/lentille.`;
    $('downloadPng').disabled = false;
    $('downloadPdf').disabled = false;
    $('downloadBundle').disabled = false;
    setStatus($('renderStatus'), `PNG créé et rouvert sans changement de dimensions (${spec.width} × ${spec.height}).`, 'good');
  } catch (error) {
    console.error(error);
    setStatus($('renderStatus'), `Échec du calcul : ${error.message}`, 'error');
  } finally {
    if (generation === state.renderGeneration) {
      setRenderingControls(false);
      updateControls();
      $('progress').classList.add('hidden');
    }
  }
});

function updateTechnicalZoom() {
  const factor = Number($('techZoom').value);
  $('techZoomValue').textContent = `${factor}×`;
  if (!outputCanvas.classList.contains('hidden')) outputCanvas.style.width = `${factor * 100}%`;
}
$('techZoom').addEventListener('input', updateTechnicalZoom);

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function filenameStem() {
  const spec = buildSpec();
  return `microplayer-10x15-${spec.nominalLpi}lpi-${spec.orientation}`;
}
$('downloadPng').addEventListener('click', () => {
  if (state.resultBlob) triggerDownload(state.resultBlob, `${filenameStem()}-interlace.png`);
});
$('downloadPdf').addEventListener('click', async () => {
  if (!state.result) return;
  $('downloadPdf').disabled = true;
  setStatus($('exportStatus'), 'Préparation du PDF RGB sans perte…');
  try {
    const spec = buildSpec();
    const rgb = await compressCanvasRgbForPdf(state.result.canvas);
    const pdf = buildExactSizePdf(rgb, {
      pixelWidth: spec.width, pixelHeight: spec.height,
      widthMm: spec.targetWidthMm, heightMm: spec.targetHeightMm
    });
    triggerDownload(new Blob([pdf], { type: 'application/pdf' }), `${filenameStem()}-taille-reelle.pdf`);
    setStatus($('exportStatus'), 'PDF sans perte créé. Sa page mesure exactement la taille physique demandée.', 'good');
  } catch (error) {
    setStatus($('exportStatus'), error.message, 'error');
  } finally { $('downloadPdf').disabled = !state.result; }
});
$('downloadBundle').addEventListener('click', async () => {
  if (!state.resultBlob || !state.manifest || !window.JSZip) return;
  const zip = new window.JSZip();
  zip.file(`${filenameStem()}-interlace.png`, state.resultBlob);
  zip.file('manifest-impression.json', JSON.stringify(state.manifest, null, 2));
  triggerDownload(await zip.generateAsync({ type: 'blob' }), `${filenameStem()}-pour-impression.zip`);
});

$('makeCalibration').addEventListener('click', async () => {
  $('makeCalibration').disabled = true;
  setStatus($('calibrationStatus'), 'Génération des onze bandes de pitch…');
  try {
    const spec = createPrintSpec({ orientation: 'landscape', dpi: 600, nominalLpi: 50, calibratedLpi: 50 });
    const values = calibrationPitchValues(50);
    const canvas = generateCalibrationCanvas(spec, values);
    const png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG calibration impossible.')), 'image/png'));
    state.calibrationBlob = new Blob([
      addPngPhysicalResolution(new Uint8Array(await png.arrayBuffer()), spec.dpi)
    ], { type: 'image/png' });
    state.calibrationManifest = {
      generator: 'MicroPlayer Pitch Calibration',
      printerProfile: 'Canon PIXMA PRO-200S',
      generatedAt: new Date().toISOString(),
      physicalSize: { widthMm: 150, heightMm: 100 },
      dpi: 600, nominalLpi: 50, testPitchLpi: values,
      note: 'Essai de départ uniquement. Choisir la bande la plus stable avec le papier et le PET 50 LPI réels.'
    };
    $('downloadCalibration').disabled = false;
    setStatus($('calibrationStatus'), `Planche créée : 150 × 100 mm paysage · ${spec.width} × ${spec.height} px · 600 DPI · ${values.length} bandes.`, 'good');
  } catch (error) {
    setStatus($('calibrationStatus'), error.message, 'error');
  } finally { $('makeCalibration').disabled = false; }
});
$('downloadCalibration').addEventListener('click', async () => {
  if (!state.calibrationBlob) return;
  triggerDownload(state.calibrationBlob, 'microplayer-calibration-pitch-50-lpi-10x15.png');
  if (state.calibrationManifest) triggerDownload(new Blob([JSON.stringify(state.calibrationManifest, null, 2)], { type: 'application/json' }), 'microplayer-calibration-pitch-50-lpi.json');
});

window.addEventListener('message', async event => {
  if (!window.opener || event.source !== window.opener || event.origin !== location.origin) return;
  if (event.data?.type !== 'microplayer-lenticular-print-views' || !Array.isArray(event.data.views)) return;
  try {
    const files = event.data.views.map((blob, index) => new File([blob], `vue-${String(index + 1).padStart(2, '0')}.png`, { type: blob.type || 'image/png' }));
    await loadViews(files, { alreadyOrdered: true, sourceLabel: '9 vues reçues depuis le moteur Photo MicroPlayer' });
  } catch (error) { setStatus($('sourceStatus'), error.message, 'error'); }
});

if (profile.nominalLpi) $('nominalLpi').value = String(profile.nominalLpi);
if (profile.orientation) $('orientation').value = profile.orientation;
if (profile.lensOrientation) $('lensOrientation').value = profile.lensOrientation;
if (profile.reverseOrder !== undefined) $('reverseOrder').checked = profile.reverseOrder;
if (profile.calibratedLpi) $('calibratedLpi').value = String(profile.calibratedLpi);
if (profile.phasePx !== undefined) $('phasePx').value = String(profile.phasePx);
updateControls();
if (window.opener && !window.opener.closed) {
  window.opener.postMessage({ type: 'microplayer-lenticular-print-ready' }, location.origin);
  setStatus($('sourceStatus'), 'Connexion au moteur Photo MicroPlayer…', 'good');
}
