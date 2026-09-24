export function computeSafeFrameGeometry({ width, height, safeMargin = 0.14, anchor = 'center' }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Dimensions source invalides.');
  }
  if (!Number.isFinite(safeMargin) || safeMargin < 0 || safeMargin > 0.3) {
    throw new Error('safeMargin doit être compris entre 0 et 0.3.');
  }
  const scale = Number((1 - 2 * safeMargin).toFixed(6));
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  const dx = Math.round((width - drawWidth) / 2);
  const defaultDy = Math.round((height - drawHeight) / 2);
  const dy = anchor === 'top' ? Math.round(height * safeMargin * 0.6) : anchor === 'bottom' ? Math.round(height - drawHeight - height * safeMargin * 0.6) : defaultDy;
  return { outputWidth: width, outputHeight: height, drawWidth, drawHeight, dx, dy, scale, anchor };
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Encodage safe framing impossible.')), 'image/jpeg', 0.94));
}

export async function prepareSafeFramedImage(file, framing = {}) {
  if (!file) throw new Error('Image source manquante pour le safe framing.');
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return { file, geometry: null, warnings: ['Safe framing indisponible dans cet environnement.'] };
  }
  const bitmap = await createImageBitmap(file);
  const geometry = computeSafeFrameGeometry({ width: bitmap.width, height: bitmap.height, safeMargin: Number(framing.safeMargin ?? 0.14), anchor: framing.anchor || 'center' });
  const canvas = document.createElement('canvas');
  canvas.width = geometry.outputWidth;
  canvas.height = geometry.outputHeight;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.filter = `blur(${Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * 0.018))}px)`;
  ctx.drawImage(bitmap, -geometry.dx, -geometry.dy, canvas.width + geometry.dx * 2, canvas.height + geometry.dy * 2);
  ctx.restore();
  ctx.drawImage(bitmap, geometry.dx, geometry.dy, geometry.drawWidth, geometry.drawHeight);
  bitmap.close?.();
  const blob = await canvasBlob(canvas);
  const prepared = new File([blob], `safe-${file.name || 'microplayer.jpg'}`, { type: blob.type, lastModified: Date.now() });
  const warnings = geometry.scale < 0.62 ? ['Marge importante : vérifier que le sujet reste assez grand.'] : [];
  return { file: prepared, geometry, warnings };
}
