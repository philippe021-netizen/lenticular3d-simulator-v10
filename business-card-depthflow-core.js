const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normaliseBox(box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const values = box.map(Number);
  if (values.some(value => !Number.isFinite(value))) return null;
  const x = clamp(values[0], 0, 1);
  const y = clamp(values[1], 0, 1);
  return [x, y, clamp(values[2], 0.005, 1 - x), clamp(values[3], 0.005, 1 - y)];
}

export function boxToPixels(box, width, height, padding = 0) {
  const normalised = normaliseBox(box) ?? [0, 0, 1, 1];
  const x0 = clamp(Math.floor((normalised[0] - padding) * width), 0, width - 1);
  const y0 = clamp(Math.floor((normalised[1] - padding) * height), 0, height - 1);
  const x1 = clamp(Math.ceil((normalised[0] + normalised[2] + padding) * width), x0 + 1, width);
  const y1 = clamp(Math.ceil((normalised[1] + normalised[3] + padding) * height), y0 + 1, height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function median(values) {
  if (!values.length) return 0;
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

function dilate(mask, width, height, radius = 1) {
  if (radius < 1) return mask;
  const output = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maximum = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleY = y + offsetY;
        if (sampleY < 0 || sampleY >= height) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = x + offsetX;
          if (sampleX < 0 || sampleX >= width) continue;
          maximum = Math.max(maximum, mask[sampleY * width + sampleX]);
        }
      }
      output[y * width + x] = maximum;
    }
  }
  return output;
}

export function createSemanticMask(rgba, width, height, box, options = {}) {
  if (rgba.length !== width * height * 4) throw new Error("Dimensions couleur incohérentes");
  const rect = boxToPixels(box, width, height, Number(options.padding ?? 0.004));
  const borderRed = [], borderGreen = [], borderBlue = [];
  const step = Math.max(1, Math.floor(Math.min(rect.width, rect.height) / 48));
  const addColour = (x, y) => {
    const index = (y * width + x) * 4;
    borderRed.push(rgba[index]); borderGreen.push(rgba[index + 1]); borderBlue.push(rgba[index + 2]);
  };
  for (let x = rect.x; x < rect.x + rect.width; x += step) { addColour(x, rect.y); addColour(x, rect.y + rect.height - 1); }
  for (let y = rect.y; y < rect.y + rect.height; y += step) { addColour(rect.x, y); addColour(rect.x + rect.width - 1, y); }
  const background = [median(borderRed), median(borderGreen), median(borderBlue)];
  const threshold = clamp(Number(options.threshold ?? 38), 8, 160);
  const softness = clamp(Number(options.softness ?? 24), 4, 80);
  const mask = new Uint8ClampedArray(width * height);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const index = y * width + x, rgbaIndex = index * 4;
      const redDelta = rgba[rgbaIndex] - background[0], greenDelta = rgba[rgbaIndex + 1] - background[1], blueDelta = rgba[rgbaIndex + 2] - background[2];
      const colourDistance = Math.sqrt(redDelta ** 2 + greenDelta ** 2 + blueDelta ** 2);
      const left = x > rect.x ? rgbaIndex - 4 : rgbaIndex, top = y > rect.y ? rgbaIndex - width * 4 : rgbaIndex;
      const localEdge = (Math.abs(rgba[rgbaIndex] - rgba[left]) + Math.abs(rgba[rgbaIndex + 1] - rgba[left + 1]) + Math.abs(rgba[rgbaIndex + 2] - rgba[left + 2]) + Math.abs(rgba[rgbaIndex] - rgba[top]) + Math.abs(rgba[rgbaIndex + 1] - rgba[top + 1]) + Math.abs(rgba[rgbaIndex + 2] - rgba[top + 2])) / 3;
      const score = Math.max(colourDistance, localEdge * 1.35);
      mask[index] = Math.round(clamp((score - threshold + softness) / (softness * 2), 0, 1) * 255);
    }
  }
  return dilate(mask, width, height, Number(options.dilate ?? 1));
}

export function createBoxMask(width, height, box, feather = 0) {
  const rect = boxToPixels(box, width, height);
  const mask = new Uint8ClampedArray(width * height);
  const edge = Math.max(0, Math.round(feather));
  for (let y = rect.y; y < rect.y + rect.height; y += 1) for (let x = rect.x; x < rect.x + rect.width; x += 1) {
    const distance = Math.min(x - rect.x, y - rect.y, rect.x + rect.width - 1 - x, rect.y + rect.height - 1 - y);
    mask[y * width + x] = edge ? Math.round(clamp((distance + 1) / edge, 0, 1) * 255) : 255;
  }
  return mask;
}

export function maskCoverage(mask) {
  let sum = 0, active = 0;
  for (const value of mask) { sum += value; if (value > 24) active += 1; }
  return { active, percent: mask.length ? sum / (mask.length * 255) * 100 : 0 };
}

export function medianDepthInMask(depth, mask) {
  if (depth.length !== mask.length) throw new Error("Dimensions de masque incohérentes");
  const values = [];
  for (let index = 0; index < depth.length; index += 1) if (mask[index] > 96) values.push(depth[index]);
  return median(values);
}

export function compressDepthAroundPlane(baseDepth, zero = 128, amount = 1) {
  const plane = clamp(Number(zero), 0, 255), strength = clamp(Number(amount), 0, 1), output = new Uint8ClampedArray(baseDepth.length);
  for (let index = 0; index < output.length; index += 1) output[index] = Math.round(plane + (baseDepth[index] - plane) * strength);
  return output;
}

export function composeSemanticDepth(baseDepth, layers, options = {}) {
  const output = compressDepthAroundPlane(baseDepth, options.zero ?? 128, options.backgroundRelief ?? 1);
  const orderedLayers = [...(layers ?? [])].sort((left, right) => Number(left?.depth ?? 128) - Number(right?.depth ?? 128));
  for (const layer of orderedLayers) {
    if (layer?.enabled === false || !layer?.mask || layer.mask.length !== output.length) continue;
    const targetDepth = clamp(Number(layer.depth ?? 128), 0, 255), internalRelief = clamp(Number(layer.internalRelief ?? 0), 0, 1), reference = medianDepthInMask(baseDepth, layer.mask);
    for (let index = 0; index < output.length; index += 1) {
      const alpha = layer.mask[index] / 255;
      if (!alpha) continue;
      const detail = (baseDepth[index] - reference) * internalRelief, target = clamp(targetDepth + detail, 0, 255);
      output[index] = Math.round(output[index] * (1 - alpha) + target * alpha);
    }
  }
  return output;
}

export function createCardDepthPreset(layers, preset = 'professional') {
  const settings = {
    professional: { zero: 128, reliefPercent: 200, parallaxPercent: 4.6, planeSeparation: 2.1, stabilityBand: 3 },
    artistic: { zero: 128, reliefPercent: 225, parallaxPercent: 5.4, planeSeparation: 2.3, stabilityBand: 2 },
    papercut: { zero: 128, reliefPercent: 210, parallaxPercent: 5, planeSeparation: 2.2, stabilityBand: 2 },
    qr: { zero: 128, reliefPercent: 175, parallaxPercent: 3.8, planeSeparation: 1.8, stabilityBand: 4 },
  }[preset] || null;
  const profile = settings || { zero: 128, reliefPercent: 200, parallaxPercent: 4.6, planeSeparation: 2.1, stabilityBand: 3 };
  const depths = (layers || []).map((layer, index) => {
    const role = String(layer?.role || '').toLowerCase(), type = String(layer?.type || 'object').toLowerCase();
    const area = Array.isArray(layer?.bbox) ? Number(layer.bbox[2] || 0) * Number(layer.bbox[3] || 0) : 0;
    if (type === 'qr' || role === 'qr') return profile.zero;
    if (role === 'name') return 226;
    if (role === 'company') return 218;
    if (role === 'title' || role === 'slogan') return 210;
    if (role === 'phone') return 198;
    if (role === 'email') return 190;
    if (role === 'address') return 182;
    if (role === 'website') return 174;
    if (role === 'social') return 202;
    if (role === 'hours') return 186;
    if (role === 'service') return 194;
    if (type === 'logo' || role === 'logo') return clamp(238 + (index % 3) * 5, 0, 250);
    if (type === 'signature') return 232;
    if (type === 'artwork') return area >= 0.055 ? (preset === 'artistic' ? 48 : 62) : 205;
    if (type === 'subject' || type === 'object') return 218 + (index % 3) * 6;
    if (type === 'text') return 194 + (index % 4) * 7;
    return 184;
  });
  return { ...profile, depths };
}

export function cardDepthSpread(layers, zero = 128) {
  const depths = (layers || []).filter(layer => layer?.enabled !== false && Number.isFinite(Number(layer?.depth))).map(layer => Number(layer.depth));
  if (!depths.length) return { minimum: zero, maximum: zero, span: 0, meanDistance: 0 };
  const minimum = Math.min(zero, ...depths), maximum = Math.max(zero, ...depths);
  return { minimum, maximum, span: maximum - minimum, meanDistance: depths.reduce((sum, value) => sum + Math.abs(value - zero), 0) / depths.length };
}

// Edition manuelle iPad : le Pencil et la gomme sont autoritaires.
// Le coeur du trait est écrit directement à 255/0 ; seul le bord externe est adouci.
// Ainsi une correction utilisateur ne reste plus un simple voile semi-transparent.
export function paintMask(mask, width, height, from, to, radius, value) {
  const r = Math.max(1, Number(radius) || 1);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, r * 0.28)));
  const radiusSquared = r * r;
  for (let step = 0; step <= steps; step += 1) {
    const mix = step / steps;
    const centerX = Math.round(from.x + (to.x - from.x) * mix), centerY = Math.round(from.y + (to.y - from.y) * mix);
    const x0 = Math.max(0, Math.floor(centerX - r)), x1 = Math.min(width - 1, Math.ceil(centerX + r));
    const y0 = Math.max(0, Math.floor(centerY - r)), y1 = Math.min(height - 1, Math.ceil(centerY + r));
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      const d2 = (x - centerX) ** 2 + (y - centerY) ** 2;
      if (d2 > radiusSquared) continue;
      const n = Math.sqrt(d2) / r, index = y * width + x;
      if (n <= 0.82) { mask[index] = value; continue; }
      const opacity = clamp((1 - n) / 0.18, 0, 1);
      mask[index] = Math.round(mask[index] * (1 - opacity) + value * opacity);
    }
  }
}
