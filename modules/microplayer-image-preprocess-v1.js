// MicroPlayer Image Preprocess V1.2 — deterministic document scanner + photo preprocessing.
// No generative modification: only detection, crop, projective warp, resize and gentle correction.

export const MP_PREPROCESS_VERSION = '1.2.0';

const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));
const dimensions = source => ({
  width: source.naturalWidth || source.videoWidth || source.width,
  height: source.naturalHeight || source.videoHeight || source.height,
});

export function normalizedBusinessCardRatio() { return 85 / 55; }

export function fitCrop(width, height, targetRatio) {
  const ratio = width / height;
  if (Math.abs(ratio - targetRatio) < 0.002) return { x: 0, y: 0, w: width, h: height };
  if (ratio > targetRatio) {
    const w = height * targetRatio;
    return { x: (width - w) / 2, y: 0, w, h: height };
  }
  const h = width / targetRatio;
  return { x: 0, y: (height - h) / 2, w: width, h };
}

export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

export function orderQuad(points) {
  if (!Array.isArray(points) || points.length !== 4) return null;
  const clean = points.map(point => ({ x: Number(point.x), y: Number(point.y) }));
  if (clean.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const center = clean.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  clean.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  let start = 0;
  for (let index = 1; index < 4; index += 1) {
    if (clean[index].x + clean[index].y < clean[start].x + clean[start].y) start = index;
  }
  const ordered = clean.slice(start).concat(clean.slice(0, start));
  // Clockwise screen order must be TL, TR, BR, BL.
  if (ordered[1].x < ordered[3].x) [ordered[1], ordered[3]] = [ordered[3], ordered[1]];
  return ordered;
}

export function normalizeQuad(points, width, height) {
  const ordered = orderQuad(points);
  if (!ordered) return null;
  return ordered.map(point => ({
    x: clamp(point.x, 0, Math.max(0, width - 1)),
    y: clamp(point.y, 0, Math.max(0, height - 1)),
  }));
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleDelta(a, b) {
  let delta = Math.abs(a - b) % Math.PI;
  if (delta > Math.PI / 2) delta = Math.PI - delta;
  return Math.abs(delta);
}
function orientationMean(a, b) {
  let mean = Math.atan2(Math.sin(2 * a) + Math.sin(2 * b), Math.cos(2 * a) + Math.cos(2 * b)) / 2;
  if (mean < 0) mean += Math.PI;
  return mean;
}

export function quadMetrics(points, width, height) {
  const quad = orderQuad(points);
  if (!quad) return { valid: false, areaRatio: 0, aspect: 0, rectangularity: 0 };
  const sides = quad.map((point, index) => distance(point, quad[(index + 1) % 4]));
  const areaRatio = polygonArea(quad) / Math.max(1, width * height);
  const horizontal = (sides[0] + sides[2]) / 2;
  const vertical = (sides[1] + sides[3]) / 2;
  const aspect = Math.max(horizontal, vertical) / Math.max(1, Math.min(horizontal, vertical));
  let cornerScore = 0;
  for (let index = 0; index < 4; index += 1) {
    const before = quad[(index + 3) % 4], point = quad[index], after = quad[(index + 1) % 4];
    const ax = before.x - point.x, ay = before.y - point.y;
    const bx = after.x - point.x, by = after.y - point.y;
    const cosine = clamp((ax * bx + ay * by) / Math.max(1, Math.hypot(ax, ay) * Math.hypot(bx, by)), -1, 1);
    const angle = Math.acos(cosine) * 180 / Math.PI;
    cornerScore += clamp(1 - Math.abs(angle - 90) / 70, 0, 1) / 4;
  }
  const valid = areaRatio >= 0.025 && sides.every(side => side >= Math.min(width, height) * 0.08) && cornerScore > 0.38;
  return { valid, areaRatio, aspect, rectangularity: cornerScore, sides, horizontal, vertical };
}

function createWorkingCanvas(source, maxSide = 900) {
  const { width: sourceWidth, height: sourceHeight } = dimensions(source);
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, context, scale, sourceWidth, sourceHeight };
}

function buildEdgeField(imageData) {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    gray[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }
  // A small separable blur suppresses wood grain, print texture and camera noise.
  const horizontal = new Float32Array(gray.length), blurred = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = (gray[row + Math.max(0, x - 2)] + 2 * gray[row + Math.max(0, x - 1)] + 3 * gray[row + x] + 2 * gray[row + Math.min(width - 1, x + 1)] + gray[row + Math.min(width - 1, x + 2)]) / 9;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      blurred[y * width + x] = (horizontal[Math.max(0, y - 2) * width + x] + 2 * horizontal[Math.max(0, y - 1) * width + x] + 3 * horizontal[y * width + x] + 2 * horizontal[Math.min(height - 1, y + 1) * width + x] + horizontal[Math.min(height - 1, y + 2) * width + x]) / 9;
    }
  }
  const magnitude = new Float32Array(gray.length), gx = new Float32Array(gray.length), gy = new Float32Array(gray.length), samples = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const dx = blurred[index + 1] - blurred[index - 1];
      const dy = blurred[index + width] - blurred[index - width];
      gx[index] = dx; gy[index] = dy;
      magnitude[index] = Math.hypot(dx, dy);
      if ((x & 3) === 0 && (y & 3) === 0) samples.push(magnitude[index]);
    }
  }
  samples.sort((a, b) => a - b);
  const q88 = samples[Math.floor(samples.length * 0.88)] || 0;
  const q96 = samples[Math.floor(samples.length * 0.96)] || q88;
  const threshold = Math.max(10, q88 * 0.82, q96 * 0.42);
  return { width, height, gray, magnitude, gx, gy, threshold };
}

function houghLines(field) {
  const { width, height, magnitude, gx, gy, threshold } = field;
  const thetaCount = 90, thetaStep = Math.PI / thetaCount;
  const rhoStep = 3, diagonal = Math.hypot(width, height), rhoCount = Math.ceil(diagonal * 2 / rhoStep) + 3;
  const accumulators = Array.from({ length: thetaCount }, () => new Float32Array(rhoCount));
  const cosines = Array.from({ length: thetaCount }, (_, index) => Math.cos(index * thetaStep));
  const sines = Array.from({ length: thetaCount }, (_, index) => Math.sin(index * thetaStep));
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const index = y * width + x, strength = magnitude[index];
      if (strength < threshold) continue;
      let theta = Math.atan2(gy[index], gx[index]);
      while (theta < 0) theta += Math.PI;
      while (theta >= Math.PI) theta -= Math.PI;
      const center = Math.round(theta / thetaStep) % thetaCount;
      const weight = Math.min(4, strength / threshold);
      for (let offset = -2; offset <= 2; offset += 1) {
        const thetaIndex = (center + offset + thetaCount) % thetaCount;
        const rho = x * cosines[thetaIndex] + y * sines[thetaIndex];
        const rhoIndex = Math.round((rho + diagonal) / rhoStep);
        if (rhoIndex >= 0 && rhoIndex < rhoCount) accumulators[thetaIndex][rhoIndex] += weight * (1 - Math.abs(offset) * 0.12);
      }
    }
  }
  const peaks = [];
  for (let thetaIndex = 0; thetaIndex < thetaCount; thetaIndex += 1) {
    const votes = accumulators[thetaIndex];
    for (let rhoIndex = 2; rhoIndex < rhoCount - 2; rhoIndex += 1) {
      const value = votes[rhoIndex];
      if (value < 10 || value < votes[rhoIndex - 1] || value < votes[rhoIndex + 1]) continue;
      peaks.push({ theta: thetaIndex * thetaStep, rho: rhoIndex * rhoStep - diagonal, votes: value });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  const selected = [];
  for (const line of peaks) {
    if (selected.some(other => angleDelta(line.theta, other.theta) < 5 * Math.PI / 180 && Math.abs(line.rho - other.rho) < 15)) continue;
    selected.push(line);
    // Keep enough secondary lines for low-contrast card edges. A wood grain or
    // printed text can otherwise occupy every early peak before the four outer
    // document edges are considered.
    if (selected.length >= 64) break;
  }
  return selected;
}

function intersectLines(first, second) {
  const c1 = Math.cos(first.theta), s1 = Math.sin(first.theta), c2 = Math.cos(second.theta), s2 = Math.sin(second.theta);
  const determinant = c1 * s2 - s1 * c2;
  if (Math.abs(determinant) < 0.08) return null;
  return {
    x: (first.rho * s2 - s1 * second.rho) / determinant,
    y: (c1 * second.rho - first.rho * c2) / determinant,
  };
}

function lineThrough(first, second) {
  const dx = second.x - first.x, dy = second.y - first.y, length = Math.max(1, Math.hypot(dx, dy));
  let nx = -dy / length, ny = dx / length, theta = Math.atan2(ny, nx);
  if (theta < 0) { theta += Math.PI; nx = -nx; ny = -ny; }
  return { theta, rho: nx * first.x + ny * first.y, nx, ny };
}

function edgeSupport(field, first, second) {
  const { width, height, magnitude, threshold } = field;
  const dx = second.x - first.x, dy = second.y - first.y, length = Math.hypot(dx, dy);
  const samples = Math.max(24, Math.min(150, Math.round(length / 4)));
  const nx = -dy / Math.max(1, length), ny = dx / Math.max(1, length);
  let total = 0, used = 0;
  for (let sample = 1; sample < samples; sample += 1) {
    const t = sample / samples, x = first.x + dx * t, y = first.y + dy * t;
    let best = 0;
    for (let offset = -4; offset <= 4; offset += 1) {
      const sx = Math.round(x + nx * offset), sy = Math.round(y + ny * offset);
      if (sx < 1 || sy < 1 || sx >= width - 1 || sy >= height - 1) continue;
      best = Math.max(best, magnitude[sy * width + sx]);
    }
    total += clamp((best - threshold * 0.55) / Math.max(1, threshold * 2.2), 0, 1);
    used += 1;
  }
  return used ? total / used : 0;
}

function candidateScore(field, points) {
  const quad = orderQuad(points), metrics = quadMetrics(quad, field.width, field.height);
  if (!quad || !metrics.valid || metrics.areaRatio > 0.96) return null;
  const marginX = field.width * 0.14, marginY = field.height * 0.14;
  if (quad.some(point => point.x < -marginX || point.y < -marginY || point.x > field.width + marginX || point.y > field.height + marginY)) return null;
  const supports = quad.map((point, index) => edgeSupport(field, point, quad[(index + 1) % 4]));
  const support = supports.reduce((sum, value) => sum + value, 0) / 4;
  const weakest = Math.min(...supports);
  const target = normalizedBusinessCardRatio();
  const aspectScore = Math.exp(-Math.abs(Math.log(Math.max(0.01, metrics.aspect) / target)) * 3.2);
  // Prefer the enclosing document over high-contrast internal logos. This is
  // deliberately gradual so a genuinely small card can still be proposed for
  // manual confirmation.
  const areaScore = clamp(Math.sqrt(metrics.areaRatio / 0.32), 0.08, 1);
  const inside = quad.filter(point => point.x >= 0 && point.y >= 0 && point.x < field.width && point.y < field.height).length / 4;
  const confidence = clamp(support * 0.29 + weakest * 0.08 + aspectScore * 0.19 + metrics.rectangularity * 0.11 + areaScore * 0.28 + inside * 0.05, 0, 1);
  const selectionScore = confidence + areaScore * 0.12 + aspectScore * 0.04;
  return { corners: quad, confidence, selectionScore, support, weakest, aspectScore, metrics };
}

function expandQuadToOuterEdges(field, sourcePoints) {
  let quad = orderQuad(sourcePoints);
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    for (let side = 0; side < 4; side += 1) {
      const edges = quad.map((point, index) => lineThrough(point, quad[(index + 1) % 4]));
      const currentMetrics = quadMetrics(quad, field.width, field.height), edge = edges[side];
      const center = quad.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
      const centerDistance = edge.nx * center.x + edge.ny * center.y - edge.rho;
      const outward = centerDistance >= 0 ? -1 : 1;
      const opposite = edges[(side + 2) % 4];
      const span = Math.abs(opposite.nx * center.x + opposite.ny * center.y - opposite.rho) * 2;
      const maxOffset = Math.min(Math.min(field.width, field.height) * 0.32, Math.max(18, span * 0.38));
      let best = null;
      for (let offset = 4; offset <= maxOffset; offset += 4) {
        const shifted = { ...edge, rho: edge.rho + outward * offset };
        const previous = edges[(side + 3) % 4], next = edges[(side + 1) % 4];
        const firstCorner = intersectLines(previous, shifted), secondCorner = intersectLines(shifted, next);
        if (!firstCorner || !secondCorner) continue;
        const proposed = quad.map(point => ({ ...point }));
        proposed[side] = firstCorner; proposed[(side + 1) % 4] = secondCorner;
        const ordered = orderQuad(proposed), metrics = quadMetrics(ordered, field.width, field.height);
        if (!metrics.valid || metrics.areaRatio <= currentMetrics.areaRatio * 1.008 || metrics.areaRatio > Math.min(0.9, currentMetrics.areaRatio * 1.62) || metrics.aspect < 1.05 || metrics.aspect > 2.45) continue;
        if (ordered.some(point => point.x < -field.width * 0.04 || point.y < -field.height * 0.04 || point.x > field.width * 1.04 || point.y > field.height * 1.04)) continue;
        const support = edgeSupport(field, ordered[side], ordered[(side + 1) % 4]);
        if (support < 0.26) continue;
        const aspectScore = Math.exp(-Math.abs(Math.log(metrics.aspect / normalizedBusinessCardRatio())) * 1.7);
        const score = metrics.areaRatio + support * 0.10 + aspectScore * 0.035;
        if (!best || score > best.score) best = { quad: ordered, score };
      }
      if (best) { quad = best.quad; changed = true; }
    }
    if (!changed) break;
  }
  return quad;
}

function findBestQuad(field) {
  const lines = houghLines(field), minSeparation = Math.min(field.width, field.height) * 0.13;
  const pairs = [];
  for (let first = 0; first < lines.length; first += 1) {
    for (let second = first + 1; second < lines.length; second += 1) {
      if (angleDelta(lines[first].theta, lines[second].theta) > 22 * Math.PI / 180) continue;
      const separation = Math.abs(lines[first].rho - lines[second].rho);
      if (separation < minSeparation) continue;
      pairs.push({ lines: [lines[first], lines[second]], theta: orientationMean(lines[first].theta, lines[second].theta), rank: Math.sqrt(lines[first].votes * lines[second].votes) * Math.sqrt(separation) });
    }
  }
  pairs.sort((a, b) => b.rank - a.rank);
  const shortlisted = pairs.slice(0, 90), candidates = [];
  for (let first = 0; first < shortlisted.length; first += 1) {
    for (let second = first + 1; second < shortlisted.length; second += 1) {
      const angle = angleDelta(shortlisted[first].theta, shortlisted[second].theta);
      if (angle < 43 * Math.PI / 180 || angle > 90 * Math.PI / 180) continue;
      const [a, b] = shortlisted[first].lines, [c, d] = shortlisted[second].lines;
      const intersections = [intersectLines(a, c), intersectLines(b, c), intersectLines(b, d), intersectLines(a, d)];
      if (intersections.some(point => !point)) continue;
      const candidate = candidateScore(field, intersections);
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => b.selectionScore - a.selectionScore);
  let best = candidates[0] || null;
  if (best) {
    const expandedQuad = expandQuadToOuterEdges(field, best.corners), expanded = candidateScore(field, expandedQuad);
    if (expanded && expanded.metrics.areaRatio > best.metrics.areaRatio * 1.008) best = expanded;
  }
  return { best, alternatives: candidates.filter(candidate => candidate !== best).slice(0, 3), lineCount: lines.length };
}

function fallbackCorners(width, height) {
  const insetX = width * 0.08, insetY = height * 0.08;
  return [
    { x: insetX, y: insetY }, { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY }, { x: insetX, y: height - insetY },
  ];
}

export function detectDocumentQuad(source, { maxSide = 900 } = {}) {
  const { canvas, context, scale, sourceWidth, sourceHeight } = createWorkingCanvas(source, maxSide);
  const field = buildEdgeField(context.getImageData(0, 0, canvas.width, canvas.height));
  const result = findBestQuad(field), candidate = result.best;
  if (!candidate) {
    return { corners: fallbackCorners(sourceWidth, sourceHeight), confidence: 0, requiresReview: true, method: 'manual', diagnostics: { lineCount: result.lineCount } };
  }
  const corners = candidate.corners.map(point => ({ x: point.x / scale, y: point.y / scale }));
  const confidence = candidate.confidence;
  return {
    corners: normalizeQuad(corners, sourceWidth, sourceHeight),
    confidence,
    // Be deliberately conservative: a plausible internal logo rectangle must
    // never be accepted silently as the card. The user still gets the best
    // proposal, but borderline or uneven edges explicitly require a check.
    requiresReview: confidence < 0.84 || candidate.weakest < 0.45,
    method: 'edge-hough-quad',
    diagnostics: {
      lineCount: result.lineCount,
      areaRatio: candidate.metrics.areaRatio,
      aspect: candidate.metrics.aspect,
      edgeSupport: candidate.support,
      weakestEdge: candidate.weakest,
      alternatives: result.alternatives.map(item => ({
        confidence: item.confidence,
        areaRatio: item.metrics.areaRatio,
        aspect: item.metrics.aspect,
        corners: item.corners.map(point => ({ x: point.x / scale, y: point.y / scale })),
      })),
    },
  };
}

export function detectMode(sourceOrWidth, height, { documentHint = false, detection = null } = {}) {
  if (documentHint) return 'card';
  if (sourceOrWidth && typeof sourceOrWidth === 'object') {
    const result = detection || detectDocumentQuad(sourceOrWidth);
    return result.confidence >= 0.72 && result.diagnostics?.aspect >= 1.2 && result.diagnostics?.aspect <= 2.15 ? 'card' : 'photo';
  }
  const ratio = Math.max(sourceOrWidth, height) / Math.max(1, Math.min(sourceOrWidth, height));
  return ratio > 1.42 && ratio < 1.78 ? 'document' : 'photo';
}

export function unitSquareToQuad(points) {
  const quad = orderQuad(points);
  if (!quad) throw new Error('4 coins valides requis');
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;
  const dx1 = topRight.x - bottomRight.x, dx2 = bottomLeft.x - bottomRight.x;
  const dy1 = topRight.y - bottomRight.y, dy2 = bottomLeft.y - bottomRight.y;
  const sx = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const sy = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  let g = 0, h = 0;
  if (Math.abs(determinant) > 1e-8) {
    g = (sx * dy2 - dx2 * sy) / determinant;
    h = (dx1 * sy - sx * dy1) / determinant;
  }
  return {
    a: topRight.x - topLeft.x + g * topRight.x,
    b: bottomLeft.x - topLeft.x + h * bottomLeft.x,
    c: topLeft.x,
    d: topRight.y - topLeft.y + g * topRight.y,
    e: bottomLeft.y - topLeft.y + h * bottomLeft.y,
    f: topLeft.y,
    g, h,
  };
}

export function projectUnitPoint(transform, u, v) {
  const denominator = transform.g * u + transform.h * v + 1;
  return {
    x: (transform.a * u + transform.b * v + transform.c) / denominator,
    y: (transform.d * u + transform.e * v + transform.f) / denominator,
  };
}

export function warpQuad(source, points, outputWidth, outputHeight) {
  const { width: sourceWidth, height: sourceHeight } = dimensions(source);
  const quad = normalizeQuad(points, sourceWidth, sourceHeight);
  if (!quad || !quadMetrics(quad, sourceWidth, sourceHeight).valid) throw new Error('Les 4 coins ne forment pas une carte valide.');
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceWidth; sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  sourceContext.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  const input = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const output = new ImageData(outputWidth, outputHeight), transform = unitSquareToQuad(quad);
  for (let y = 0; y < outputHeight; y += 1) {
    const v = outputHeight === 1 ? 0 : y / (outputHeight - 1);
    for (let x = 0; x < outputWidth; x += 1) {
      const u = outputWidth === 1 ? 0 : x / (outputWidth - 1);
      const point = projectUnitPoint(transform, u, v);
      const sx = clamp(point.x, 0, sourceWidth - 1), sy = clamp(point.y, 0, sourceHeight - 1);
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(sourceWidth - 1, x0 + 1), y1 = Math.min(sourceHeight - 1, y0 + 1);
      const tx = sx - x0, ty = sy - y0, destination = (y * outputWidth + x) * 4;
      const i00 = (y0 * sourceWidth + x0) * 4, i10 = (y0 * sourceWidth + x1) * 4, i01 = (y1 * sourceWidth + x0) * 4, i11 = (y1 * sourceWidth + x1) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const top = input[i00 + channel] * (1 - tx) + input[i10 + channel] * tx;
        const bottom = input[i01 + channel] * (1 - tx) + input[i11 + channel] * tx;
        output.data[destination + channel] = top * (1 - ty) + bottom * ty;
      }
      output.data[destination + 3] = 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth; canvas.height = outputHeight;
  canvas.getContext('2d').putImageData(output, 0, 0);
  return canvas;
}

export function gentleEnhance(canvas, { brightness = 0, contrast = 1.035, saturation = 1.01, sharpness = 0.16 } = {}) {
  const output = document.createElement('canvas');
  output.width = canvas.width; output.height = canvas.height;
  const context = output.getContext('2d', { willReadFrequently: true });
  context.drawImage(canvas, 0, 0);
  const image = context.getImageData(0, 0, output.width, output.height), data = image.data;
  let mean = 0;
  for (let index = 0; index < data.length; index += 16) mean += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
  mean /= Math.max(1, data.length / 16);
  const autoBrightness = clamp((128 - mean) * 0.035, -4, 5);
  for (let index = 0; index < data.length; index += 4) {
    let red = data[index] + brightness + autoBrightness, green = data[index + 1] + brightness + autoBrightness, blue = data[index + 2] + brightness + autoBrightness;
    red = (red - 128) * contrast + 128; green = (green - 128) * contrast + 128; blue = (blue - 128) * contrast + 128;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    data[index] = clamp(luminance + (red - luminance) * saturation);
    data[index + 1] = clamp(luminance + (green - luminance) * saturation);
    data[index + 2] = clamp(luminance + (blue - luminance) * saturation);
  }
  if (sharpness > 0 && output.width > 2 && output.height > 2) {
    const toned = new Uint8ClampedArray(data);
    for (let y = 1; y < output.height - 1; y += 1) {
      for (let x = 1; x < output.width - 1; x += 1) {
        const index = (y * output.width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const average = (toned[index - 4 + channel] + toned[index + 4 + channel] + toned[index - output.width * 4 + channel] + toned[index + output.width * 4 + channel]) / 4;
          data[index + channel] = clamp(toned[index + channel] + (toned[index + channel] - average) * sharpness);
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

// Optimisation déterministe de type scanner : niveaux, micro-contraste et netteté.
// Aucun pixel n'est inventé et la chromie est conservée en corrigeant surtout la luminance.
export function optimizeCardGraphics(canvas, { profile = 'readable' } = {}) {
  const profiles = {
    faithful: { low: 0.012, high: 0.988, blend: 0.42, contrast: 1.035, saturation: 1.005, sharpness: 0.2 },
    readable: { low: 0.018, high: 0.982, blend: 0.68, contrast: 1.065, saturation: 1.012, sharpness: 0.34 },
    strong: { low: 0.025, high: 0.975, blend: 0.82, contrast: 1.09, saturation: 1.018, sharpness: 0.46 },
  };
  const settings = profiles[profile] || profiles.readable;
  const output = document.createElement('canvas');
  output.width = canvas.width; output.height = canvas.height;
  const context = output.getContext('2d', { willReadFrequently: true });
  context.drawImage(canvas, 0, 0);
  const image = context.getImageData(0, 0, output.width, output.height), data = image.data;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < data.length; index += 4) {
    histogram[Math.round(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2])] += 1;
  }
  const pixels = Math.max(1, data.length / 4);
  const percentile = fraction => {
    const target = pixels * fraction; let sum = 0;
    for (let value = 0; value < 256; value += 1) { sum += histogram[value]; if (sum >= target) return value; }
    return 255;
  };
  const black = percentile(settings.low), white = percentile(settings.high), range = Math.max(48, white - black);
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index], green = data[index + 1], blue = data[index + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const levelled = clamp((luminance - black) * 255 / range);
    const target = luminance + (levelled - luminance) * settings.blend;
    const scale = target / Math.max(8, luminance);
    data[index] = clamp(red * scale); data[index + 1] = clamp(green * scale); data[index + 2] = clamp(blue * scale);
  }
  context.putImageData(image, 0, 0);
  return gentleEnhance(output, settings);
}

export function cropAndResize(source, crop, maxWidth = 1536) {
  const ratio = crop.w / crop.h, width = Math.min(maxWidth, Math.max(1, Math.round(crop.w))), height = Math.max(1, Math.round(width / ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  return canvas;
}

export function preprocessPhoto(source, { maxWidth = 1536, enhance = true, crop = null } = {}) {
  const { width, height } = dimensions(source), area = crop || { x: 0, y: 0, w: width, h: height };
  const canvas = cropAndResize(source, area, maxWidth);
  return enhance ? gentleEnhance(canvas, { contrast: 1.025, saturation: 1.005, sharpness: 0.12 }) : canvas;
}

export function preprocessBusinessCard(source, { corners = null, maxWidth = 1536, enhance = true, forceRatio = true, autoDetect = true } = {}) {
  const detected = corners ? { corners, confidence: 1, requiresReview: false, method: 'manual' } : (autoDetect ? detectDocumentQuad(source) : null);
  if (!detected?.corners) throw new Error('Aucun contour de carte disponible.');
  const { width: sourceWidth, height: sourceHeight } = dimensions(source), quad = normalizeQuad(detected.corners, sourceWidth, sourceHeight);
  const metrics = quadMetrics(quad, sourceWidth, sourceHeight);
  if (!metrics.valid) throw new Error('Vérifiez les 4 coins.');
  const landscape = metrics.horizontal >= metrics.vertical, target = normalizedBusinessCardRatio();
  let outputWidth, outputHeight;
  if (forceRatio) {
    if (landscape) { outputWidth = Math.min(maxWidth, 1536); outputHeight = Math.round(outputWidth / target); }
    else { outputHeight = Math.min(maxWidth, 1536); outputWidth = Math.round(outputHeight / target); }
  } else {
    outputWidth = Math.min(maxWidth, Math.max(1, Math.round(metrics.horizontal)));
    outputHeight = Math.max(1, Math.round(outputWidth * metrics.vertical / metrics.horizontal));
  }
  let canvas = warpQuad(source, quad, outputWidth, outputHeight);
  if (enhance) canvas = optimizeCardGraphics(canvas);
  canvas.detectedCorners = quad;
  canvas.documentDetected = true;
  canvas.detectionConfidence = detected.confidence;
  canvas.orientation = landscape ? 'landscape' : 'portrait';
  return canvas;
}

export function canvasToDataURL(canvas, type = 'image/png', quality = 0.96) { return canvas.toDataURL(type, quality); }

export function qualityReport(before, after, mode, detection = null) {
  return {
    mode,
    before: `${before.width || before.naturalWidth}×${before.height || before.naturalHeight}`,
    after: `${after.width}×${after.height}`,
    documentDetected: mode === 'card',
    confidence: detection ? Math.round(detection.confidence * 100) : null,
    nonGenerative: true,
    ready: true,
  };
}
