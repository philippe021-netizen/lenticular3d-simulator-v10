function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(label + ' must be a positive number.');
  return number;
}

export function millimetersToPixels(mm, dpi, geometry = 1) {
  return Math.round(positive(mm, 'mm') / 25.4 * positive(dpi, 'DPI') * positive(geometry, 'Geometry'));
}

export function lenticulePitchPixels(dpi, lpi) {
  return positive(dpi, 'DPI') / positive(lpi, 'LPI');
}

export function viewIndexForColumn(x, pitchPx, phasePx = 0, reverse = false) {
  const pitch = positive(pitchPx, 'Pitch');
  const phase = Number.isFinite(Number(phasePx)) ? Number(phasePx) : 0;
  const fraction = (((Number(x) + phase) % pitch) + pitch) % pitch / pitch;
  const index = Math.min(8, Math.floor(fraction * 9));
  return reverse ? 8 - index : index;
}
