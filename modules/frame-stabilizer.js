function shiftedMeanAbsoluteError(reference, candidate, width, height, sx, sy) {
  let total = 0;
  let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cx = x + sx;
    const cy = y + sy;
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    total += Math.abs(reference[y * width + x] - candidate[cy * width + cx]);
    count++;
  }
  return count ? total / count : Infinity;
}

export function estimateTranslation(reference, candidate, width, height, maxShift = 6) {
  if (reference?.length !== width * height || candidate?.length !== width * height) throw new Error('Images de recalage invalides.');
  let best = { error: Infinity, sx: 0, sy: 0 };
  for (let sy = -maxShift; sy <= maxShift; sy++) for (let sx = -maxShift; sx <= maxShift; sx++) {
    const error = shiftedMeanAbsoluteError(reference, candidate, width, height, sx, sy);
    if (error < best.error) best = { error, sx, sy };
  }
  return {
    dx: -best.sx,
    dy: -best.sy,
    confidence: Number(Math.max(0, 1 - best.error / 255).toFixed(6))
  };
}

export function computeStabilizedPlacement(width, height, dx = 0, dy = 0) {
  const shiftX = Number.isFinite(Number(dx)) ? Number(dx) : 0;
  const shiftY = Number.isFinite(Number(dy)) ? Number(dy) : 0;
  const padX = Math.abs(shiftX);
  const padY = Math.abs(shiftY);
  return {
    x: shiftX - padX,
    y: shiftY - padY,
    drawWidth: width + padX * 2,
    drawHeight: height + padY * 2
  };
}

export function stabilizeFrame(frame, transform = {}, lockedRegions = []) {
  if (typeof document === 'undefined') return { frame, transform, lockedRegions };
  const width = frame.width || frame.naturalWidth;
  const height = frame.height || frame.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const placement = computeStabilizedPlacement(width, height, transform.dx, transform.dy);
  ctx.drawImage(frame, placement.x, placement.y, placement.drawWidth, placement.drawHeight);
  return canvas;
}
