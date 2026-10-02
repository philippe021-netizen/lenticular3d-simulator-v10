export const DEFAULT_CALIBRATION = Object.freeze({
  minOffsetLpi: -1,
  maxOffsetLpi: 1,
  stepLpi: 0.1
});

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function createPrintSpec({
  orientation = 'portrait',
  widthMm = 100,
  heightMm = 150,
  dpi = 600,
  nominalLpi = 50,
  calibratedLpi = nominalLpi,
  lensOrientation = 'vertical',
  phasePx = 0,
  reverseOrder = false,
  viewCount = 9
} = {}) {
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    throw new RangeError('Orientation doit être portrait ou paysage.');
  }
  if (lensOrientation !== 'vertical' && lensOrientation !== 'horizontal') {
    throw new RangeError('Orientation des lentilles invalide.');
  }
  if (viewCount !== 9) throw new RangeError('Le moteur exige exactement 9 vues.');
  if (!(widthMm > 0) || !(heightMm > 0) || !(dpi >= 72) || !(nominalLpi > 0)) {
    throw new RangeError('Dimensions, DPI et LPI doivent être positifs.');
  }
  if (!(calibratedLpi >= nominalLpi - 1 && calibratedLpi <= nominalLpi + 1)) {
    throw new RangeError(`Le pitch calibré doit rester entre ${(nominalLpi - 1).toFixed(2)} et ${(nominalLpi + 1).toFixed(2)} LPI.`);
  }
  if (!Number.isFinite(phasePx)) throw new RangeError('Le décalage de phase doit être un nombre fini.');

  const portrait = orientation === 'portrait';
  const targetWidthMm = portrait ? Math.min(widthMm, heightMm) : Math.max(widthMm, heightMm);
  const targetHeightMm = portrait ? Math.max(widthMm, heightMm) : Math.min(widthMm, heightMm);
  const width = Math.round(targetWidthMm * dpi / 25.4);
  const height = Math.round(targetHeightMm * dpi / 25.4);
  return Object.freeze({
    width,
    height,
    targetWidthMm,
    targetHeightMm,
    dpi,
    nominalLpi,
    calibratedLpi,
    pixelsPerLens: dpi / calibratedLpi,
    lensOrientation,
    phasePx,
    reverseOrder,
    viewCount,
    orientation,
    printerProfile: 'Canon PIXMA PRO-200S'
  });
}

export function calibrationPitchValues(nominalLpi = 50, { minOffsetLpi = -0.5, maxOffsetLpi = 0.5, stepLpi = 0.1 } = {}) {
  if (!(nominalLpi > 0) || !(stepLpi > 0) || !(maxOffsetLpi >= minOffsetLpi)) {
    throw new RangeError('Paramètres de calibration invalides.');
  }
  const count = Math.round((maxOffsetLpi - minOffsetLpi) / stepLpi) + 1;
  return Array.from({ length: count }, (_, index) => Number((nominalLpi + minOffsetLpi + index * stepLpi).toFixed(2)));
}

export function interlacePixelRows(views, width, height, {
  dpi = 600,
  calibratedLpi = 50,
  lensOrientation = 'vertical',
  axisOffsetPx = 0,
  phasePx = 0,
  reverseOrder = false
} = {}) {
  if (!Array.isArray(views) || views.length !== 9) throw new RangeError('Fournis exactement 9 vues.');
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError('Dimensions raster invalides.');
  }
  if (!(dpi > 0) || !(calibratedLpi > 0) || !Number.isFinite(phasePx)) {
    throw new RangeError('DPI, pitch et phase invalides.');
  }
  if (lensOrientation !== 'vertical' && lensOrientation !== 'horizontal') {
    throw new RangeError('Orientation des lentilles invalide.');
  }
  const bytes = width * height * 4;
  for (const [index, view] of views.entries()) {
    if (!view || view.width !== width || view.height !== height || view.data?.length !== bytes) {
      throw new RangeError(`La vue ${index + 1} n’a pas la taille raster attendue.`);
    }
  }

  const output = new Uint8ClampedArray(bytes);
  const pitchPx = dpi / calibratedLpi;
  if (!Number.isFinite(axisOffsetPx)) throw new RangeError('Décalage d’axe invalide.');
  const rowBytes = width * 4;
  const indexForAxis = axis => {
    const rawCycle = ((axis + 0.5 + phasePx) / pitchPx) % 1;
    const cycle = (rawCycle + 1) % 1;
    const index = Math.min(8, Math.floor(cycle * 9));
    return reverseOrder ? 8 - index : index;
  };

  if (lensOrientation === 'vertical') {
    // Lens phase varies only across columns. Calculate it once, then copy the
    // four RGBA channels directly; allocating a subarray for every pixel made
    // the full 600-DPI card needlessly slow on mobile browsers.
    const viewByColumn = new Uint8Array(width);
    for (let x = 0; x < width; x++) viewByColumn[x] = indexForAxis(x);
    for (let y = 0; y < height; y++) {
      const rowStart = y * rowBytes;
      for (let x = 0; x < width; x++) {
        const offset = rowStart + x * 4;
        const data = views[viewByColumn[x]].data;
        output[offset] = data[offset];
        output[offset + 1] = data[offset + 1];
        output[offset + 2] = data[offset + 2];
        output[offset + 3] = data[offset + 3];
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      const viewData = views[indexForAxis(y + axisOffsetPx)].data;
      const rowStart = y * rowBytes;
      for (let x = 0; x < width; x++) {
        const offset = rowStart + x * 4;
        output[offset] = viewData[offset];
        output[offset + 1] = viewData[offset + 1];
        output[offset + 2] = viewData[offset + 2];
        output[offset + 3] = viewData[offset + 3];
      }
    }
  }
  return output;
}

export function addPngPhysicalResolution(inputBytes, dpi = 600) {
  const input = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  if (input.length < 33 || PNG_SIGNATURE.some((byte, index) => input[index] !== byte)) {
    throw new TypeError('Le fichier fourni n’est pas un PNG valide.');
  }
  if (!(dpi > 0) || !Number.isFinite(dpi)) throw new RangeError('DPI invalide.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let offset = 8;
  let ihdrEnd = 0;
  const retainedChunks = [];
  while (offset + 12 <= input.length) {
    const length = view.getUint32(offset, false);
    const end = offset + 12 + length;
    if (end > input.length) throw new TypeError('Chunk PNG tronqué.');
    const type = String.fromCharCode(...input.subarray(offset + 4, offset + 8));
    if (type === 'IHDR') ihdrEnd = end;
    if (type !== 'pHYs') retainedChunks.push(input.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  if (!ihdrEnd) throw new TypeError('Le fichier PNG ne contient pas IHDR.');

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, 9, false);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  chunkView.setUint32(8, pixelsPerMeter, false);
  chunkView.setUint32(12, pixelsPerMeter, false);
  chunk[16] = 1;
  chunkView.setUint32(17, crc32(chunk.subarray(4, 17)), false);

  const insertionIndex = retainedChunks.findIndex(part =>
    String.fromCharCode(...part.subarray(4, 8)) === 'IHDR');
  const all = [...retainedChunks];
  all.splice(insertionIndex + 1, 0, chunk);
  const totalLength = PNG_SIGNATURE.length + all.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  output.set(PNG_SIGNATURE, 0);
  let writeOffset = PNG_SIGNATURE.length;
  for (const part of all) {
    output.set(part, writeOffset);
    writeOffset += part.length;
  }
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
