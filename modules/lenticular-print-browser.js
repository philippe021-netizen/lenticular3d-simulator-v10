import {
  addPngPhysicalResolution,
  calibrationPitchValues,
  interlacePixelRows
} from './lenticular-print-core.js';

export function sortNineViewFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length !== 9) throw new RangeError('Il faut exactement 9 fichiers de vue.');
  const indices = files.map(file => {
    const match = file.name?.match(/(?:^|[^a-z0-9])vue[-_ ]?0*([1-9])(?=\D|$)/i);
    return match ? Number(match[1]) : null;
  });
  if (indices.every(index => index === null)) return files;
  if (indices.some(index => index === null) || new Set(indices).size !== 9) {
    throw new RangeError('Les numéros de vue doivent être uniques de 1 à 9.');
  }
  if (!indices.every(index => index >= 1 && index <= 9)) {
    throw new RangeError('Les neuf vues numérotées de 1 à 9 sont requises.');
  }
  return files.slice().sort((a, b) => {
    const ai = Number(a.name.match(/(?:^|[^a-z0-9])vue[-_ ]?0*([1-9])(?=\D|$)/i)[1]);
    const bi = Number(b.name.match(/(?:^|[^a-z0-9])vue[-_ ]?0*([1-9])(?=\D|$)/i)[1]);
    return ai - bi;
  });
}

export function calculateCropRect(sourceWidth, sourceHeight, targetRatio, { zoom = 1, panX = 0, panY = 0 } = {}) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(targetRatio > 0)) {
    throw new RangeError('Dimensions de cadrage invalides.');
  }
  if (!(zoom >= 1 && zoom <= 3) || !Number.isFinite(panX) || !Number.isFinite(panY)) {
    throw new RangeError('Réglage de cadrage invalide.');
  }
  const sourceRatio = sourceWidth / sourceHeight;
  let width = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
  let height = width / targetRatio;
  width /= zoom;
  height /= zoom;
  const travelX = sourceWidth - width;
  const travelY = sourceHeight - height;
  const x = Math.max(0, Math.min(travelX, travelX / 2 + clamp(panX, -1, 1) * travelX / 2));
  const y = Math.max(0, Math.min(travelY, travelY / 2 + clamp(panY, -1, 1) * travelY / 2));
  return { x, y, width, height };
}

export function calculateSafeArea(spec, marginMm = 3) {
  if (!(spec.width > 0) || !(spec.height > 0) || !(spec.targetWidthMm > 0) || !(spec.targetHeightMm > 0) || !(marginMm >= 0)) {
    throw new RangeError('Dimensions de zone de sécurité invalides.');
  }
  const left = spec.width * marginMm / spec.targetWidthMm;
  const top = spec.height * marginMm / spec.targetHeightMm;
  return { left, top, right: spec.width - left, bottom: spec.height - top };
}

export function validateSharedAspectRatio(images, tolerance = 0.001) {
  if (!Array.isArray(images) || images.length !== 9) throw new RangeError('Il faut exactement 9 vues lisibles.');
  const ratios = images.map(image => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!(width > 0) || !(height > 0)) throw new RangeError('Une vue a des dimensions invalides.');
    return width / height;
  });
  const reference = ratios[0];
  if (ratios.some(ratio => Math.abs(ratio - reference) / reference > tolerance)) {
    throw new RangeError('Les 9 vues ont des ratios différents. Réexporte-les au même format avant impression.');
  }
  return true;
}

export function buildPrintManifest(spec, {
  viewOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9],
  sourceNames = [],
  crop = null,
  appVersion = 'MicroPlayer impression lenticulaire 0.1'
} = {}) {
  return {
    generator: 'MicroPlayer Lenticular Print',
    appVersion,
    printerProfile: spec.printerProfile || 'Canon PIXMA PRO-200S',
    generatedAt: new Date().toISOString(),
    physicalSize: { widthMm: spec.targetWidthMm, heightMm: spec.targetHeightMm },
    orientation: spec.orientation,
    aspectRatio: spec.targetWidthMm / spec.targetHeightMm,
    aspectRatioLabel: spec.orientation === 'portrait' ? '2:3' : '3:2',
    raster: { widthPx: spec.width, heightPx: spec.height, dpi: spec.dpi },
    lpi: { nominal: spec.nominalLpi, calibrated: spec.calibratedLpi },
    viewCount: spec.viewCount,
    viewOrder,
    lensOrientation: spec.lensOrientation,
    phaseOffsetPx: spec.phasePx,
    reverseOrder: spec.reverseOrder,
    crop,
    sourceNames,
    printScale: '100% — taille réelle; désactiver « ajuster à la page »'
  };
}

export function createRenderSignature(spec, cropOptions = {}) {
  return JSON.stringify({
    width: spec.width,
    height: spec.height,
    widthMm: spec.targetWidthMm,
    heightMm: spec.targetHeightMm,
    orientation: spec.orientation,
    dpi: spec.dpi,
    nominalLpi: spec.nominalLpi,
    calibratedLpi: spec.calibratedLpi,
    viewCount: spec.viewCount,
    lensOrientation: spec.lensOrientation,
    phasePx: spec.phasePx,
    reverseOrder: spec.reverseOrder,
    crop: { zoom: cropOptions.zoom ?? 1, panX: cropOptions.panX ?? 0, panY: cropOptions.panY ?? 0 }
  });
}

export async function renderInterlacedPng(images, spec, cropOptions = {}, onProgress = () => {}, outputCanvas = document.createElement('canvas'), shouldContinue = () => true) {
  if (!Array.isArray(images) || images.length !== 9) throw new RangeError('Il faut exactement 9 vues lisibles.');
  const canvas = outputCanvas;
  canvas.width = spec.width;
  canvas.height = spec.height;
  const output = canvas.getContext('2d', { alpha: false });
  if (!output) throw new Error('Le navigateur ne peut pas créer le canevas d’impression.');
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = 'high';

  const stripCanvas = document.createElement('canvas');
  const stripContext = stripCanvas.getContext('2d', { willReadFrequently: true });
  if (!stripContext) throw new Error('Le navigateur ne peut pas préparer le tampon de calcul.');
  const stripHeight = 32;
  const cropRectangles = images.map(image => calculateCropRect(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    spec.width / spec.height,
    cropOptions
  ));

  for (let startY = 0; startY < spec.height; startY += stripHeight) {
    if (!shouldContinue()) throw new Error('Rendu interrompu : les paramètres ont changé (superseded).');
    const height = Math.min(stripHeight, spec.height - startY);
    stripCanvas.width = spec.width;
    stripCanvas.height = height;
    stripContext.imageSmoothingEnabled = true;
    stripContext.imageSmoothingQuality = 'high';
    const rows = [];
    for (let index = 0; index < 9; index++) {
      const image = images[index];
      const crop = cropRectangles[index];
      const sy = crop.y + crop.height * startY / spec.height;
      const sh = crop.height * height / spec.height;
      stripContext.clearRect(0, 0, spec.width, height);
      stripContext.drawImage(image, crop.x, sy, crop.width, sh, 0, 0, spec.width, height);
      rows.push({ width: spec.width, height, data: stripContext.getImageData(0, 0, spec.width, height).data });
    }
    const data = interlacePixelRows(rows, spec.width, height, { ...spec, axisOffsetPx: startY });
    output.putImageData(new ImageData(data, spec.width, height), 0, startY);
    onProgress({ complete: Math.min(spec.height, startY + height), total: spec.height });
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
  }
  stripCanvas.width = 1;
  stripCanvas.height = 1;
  const encoded = await new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Création du PNG impossible.')),
    'image/png'
  ));
  const withResolution = addPngPhysicalResolution(new Uint8Array(await encoded.arrayBuffer()), spec.dpi);
  return { canvas, blob: new Blob([withResolution], { type: 'image/png' }) };
}

export function generateCalibrationCanvas(spec, values = calibrationPitchValues(spec.nominalLpi)) {
  if (!Array.isArray(values) || values.length < 2 || values.some(value => !(value > 0))) {
    throw new RangeError('La planche de calibration nécessite au moins deux pitches positifs.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Le navigateur ne peut pas créer le tableau de calibration.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const colors = [
    [230, 40, 40, 255], [245, 130, 20, 255], [245, 210, 20, 255],
    [60, 175, 70, 255], [20, 165, 190, 255], [45, 90, 220, 255],
    [135, 55, 205, 255], [225, 65, 155, 255], [35, 35, 35, 255]
  ];
  const headerHeight = Math.max(76, Math.round(canvas.height * 0.04));
  const bandHeight = Math.floor((canvas.height - headerHeight) / values.length);
  for (let band = 0; band < values.length; band++) {
    const y = headerHeight + band * bandHeight;
    const height = band === values.length - 1 ? canvas.height - y : bandHeight;
    const row = new Uint8ClampedArray(canvas.width * 4);
    for (let x = 0; x < canvas.width; x++) {
      const phase = ((x + 0.5) / (spec.dpi / values[band])) % 1;
      const index = Math.min(8, Math.floor(phase * 9));
      row.set(colors[index], x * 4);
    }
    const data = new Uint8ClampedArray(canvas.width * height * 4);
    for (let rowIndex = 0; rowIndex < height; rowIndex++) data.set(row, rowIndex * row.length);
    context.putImageData(new ImageData(data, canvas.width, height), 0, y);
    // Pitch is printed outside the color bars' main viewing area to keep the
    // variants distinguishable while making their numeric labels legible.
    context.fillStyle = '#fff';
    context.fillRect(14, y + 12, 310, 60);
    context.fillStyle = '#111';
    context.font = '700 36px system-ui, sans-serif';
    context.fillText(`${values[band].toFixed(1)} LPI`, 24, y + 55);
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, headerHeight);
  context.fillStyle = '#111';
  context.font = '700 34px system-ui, sans-serif';
  context.fillText('MICROPLAYER • TEST PITCH 50 LPI • 100 × 150 mm', 24, 52);
  return canvas;
}

export function buildExactSizePdf(compressedRgbBytes, {
  pixelWidth,
  pixelHeight,
  widthMm,
  heightMm
}) {
  if (!(compressedRgbBytes instanceof Uint8Array) || compressedRgbBytes.length < 1) throw new TypeError('Flux RGB compressé vide.');
  if (![pixelWidth, pixelHeight, widthMm, heightMm].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Dimensions du PDF invalides.');
  }
  const pageWidth = (widthMm * 72 / 25.4).toFixed(7);
  const pageHeight = (heightMm * 72 / 25.4).toFixed(7);
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q\n`;
  const objects = [
    ascii('<< /Type /Catalog /Pages 2 0 R >>'),
    ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    concatBytes([
      ascii(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 1 /Colors 3 /BitsPerComponent 8 /Columns ${pixelWidth} >> /Length ${compressedRgbBytes.length} >>\nstream\n`),
      compressedRgbBytes,
      ascii('\nendstream')
    ]),
    ascii(`<< /Length ${content.length} >>\nstream\n${content}endstream`)
  ];
  const parts = [ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let length = parts[0].length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(length);
    const object = concatBytes([ascii(`${index + 1} 0 obj\n`), objects[index], ascii('\nendobj\n')]);
    parts.push(object);
    length += object.length;
  }
  const xrefOffset = length;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let index = 1; index < offsets.length; index++) xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(ascii(xref.join('') + trailer));
  return concatBytes(parts);
}

export async function compressCanvasRgbForPdf(canvas) {
  if (typeof CompressionStream !== 'function') throw new Error('La compression sans perte du PDF demande une version récente de Safari.');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source];
    rgb[target++] = rgba[source + 1];
    rgb[target++] = rgba[source + 2];
  }
  const compressed = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function ascii(text) { return Uint8Array.from(text, char => char.charCodeAt(0) & 255); }
function concatBytes(parts) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
