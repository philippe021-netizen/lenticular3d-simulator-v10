const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeDepthTensor(raw) {
  let values = raw?.data ?? raw?.cpuData ?? raw;
  const dims = Array.from(raw?.dims ?? raw?.shape ?? []).map(Number);
  if (values?.data && typeof values.data.length === "number") values = values.data;
  if (!values || typeof values.length !== "number") {
    throw new Error("Format de profondeur non reconnu");
  }

  let width = Number(raw?.width ?? dims.at(-1));
  let height = Number(raw?.height ?? dims.at(-2));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    width = Math.max(1, Math.round(Math.sqrt(values.length)));
    height = Math.max(1, Math.floor(values.length / width));
  }
  width = Math.floor(width);
  height = Math.floor(height);
  const count = Math.min(width * height, values.length);
  if (!count) throw new Error("Carte de profondeur vide");

  const finite = [];
  for (let index = 0; index < count; index += 1) {
    const value = Number(values[index]);
    if (Number.isFinite(value)) finite.push(value);
  }
  if (!finite.length) throw new Error("Valeurs de profondeur invalides");
  finite.sort((a, b) => a - b);
  const low = finite[Math.floor((finite.length - 1) * 0.01)];
  const high = finite[Math.floor((finite.length - 1) * 0.99)];
  const span = Math.max(1e-9, high - low);
  const data = new Uint8ClampedArray(width * height);
  for (let index = 0; index < data.length; index += 1) {
    const source = index < count ? Number(values[index]) : low;
    data[index] = Math.round(clamp((Number.isFinite(source) ? source : low) - low, 0, span) / span * 255);
  }
  return { data, width, height };
}

export function jointBilateralUpsample(lowDepth, lowWidth, lowHeight, lowGuide, fullGuide, width, height) {
  if (lowDepth.length !== lowWidth * lowHeight) throw new Error("Dimensions profondeur incohérentes");
  if (lowGuide.length !== lowWidth * lowHeight * 4 || fullGuide.length !== width * height * 4) {
    throw new Error("Dimensions guide couleur incohérentes");
  }

  const output = new Uint8ClampedArray(width * height);
  const spatial = [0.249, 0.707, 1, 0.707, 0.249];
  const colorSigma = 34;
  const depthSigma = 42;

  for (let y = 0; y < height; y += 1) {
    const sourceY = (y + 0.5) * lowHeight / height - 0.5;
    const centerY = Math.round(sourceY);
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x + 0.5) * lowWidth / width - 0.5;
      const centerX = Math.round(sourceX);
      const targetIndex = y * width + x;
      const colorIndex = targetIndex * 4;
      const red = fullGuide[colorIndex];
      const green = fullGuide[colorIndex + 1];
      const blue = fullGuide[colorIndex + 2];
      const nearestX = clamp(centerX, 0, lowWidth - 1);
      const nearestY = clamp(centerY, 0, lowHeight - 1);
      const referenceDepth = lowDepth[nearestY * lowWidth + nearestX];
      let valueSum = 0;
      let weightSum = 0;

      for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
        const sampleY = clamp(centerY + offsetY, 0, lowHeight - 1);
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          const sampleX = clamp(centerX + offsetX, 0, lowWidth - 1);
          const sampleIndex = sampleY * lowWidth + sampleX;
          const sampleColor = sampleIndex * 4;
          const redDelta = lowGuide[sampleColor] - red;
          const greenDelta = lowGuide[sampleColor + 1] - green;
          const blueDelta = lowGuide[sampleColor + 2] - blue;
          const colorDistance = Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
          const depthDistance = Math.abs(lowDepth[sampleIndex] - referenceDepth);
          const colorWeight = Math.exp(-colorDistance / colorSigma);
          const depthWeight = Math.exp(-depthDistance / depthSigma);
          const weight = spatial[offsetX + 2] * spatial[offsetY + 2] * colorWeight * depthWeight;
          valueSum += lowDepth[sampleIndex] * weight;
          weightSum += weight;
        }
      }
      output[targetIndex] = Math.round(valueSum / Math.max(1e-6, weightSum));
    }
  }
  return output;
}

export function refineDepthEdgeAware(depth, guide, width, height, passes = 2) {
  if (depth.length !== width * height || guide.length !== width * height * 4) {
    throw new Error("Dimensions de raffinement incohérentes");
  }
  let current = new Uint8ClampedArray(depth);
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8ClampedArray(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const colorIndex = index * 4;
        const centerDepth = current[index];
        let sum = centerDepth * 2.4;
        let weights = 2.4;
        for (const [offsetX, offsetY] of offsets) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
          const sampleIndex = sampleY * width + sampleX;
          const sampleColor = sampleIndex * 4;
          const redDelta = guide[sampleColor] - guide[colorIndex];
          const greenDelta = guide[sampleColor + 1] - guide[colorIndex + 1];
          const blueDelta = guide[sampleColor + 2] - guide[colorIndex + 2];
          const colorDistance = Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
          const depthDistance = Math.abs(current[sampleIndex] - centerDepth);
          const diagonal = offsetX && offsetY ? 0.7 : 1;
          const weight = diagonal * Math.exp(-colorDistance / 30) * Math.exp(-depthDistance / 28);
          sum += current[sampleIndex] * weight;
          weights += weight;
        }
        next[index] = Math.round(sum / weights);
      }
    }
    current = next;
  }
  return current;
}

export function composeEditedDepth(base, edited, weights) {
  if (base.length !== edited.length || base.length !== weights.length) {
    throw new Error("Dimensions des corrections incohérentes");
  }
  const output = new Uint8ClampedArray(base.length);
  for (let index = 0; index < output.length; index += 1) {
    const mix = weights[index] / 255;
    output[index] = Math.round(base[index] * (1 - mix) + edited[index] * mix);
  }
  return output;
}

export function depthAt(depth, width, height, x, y, radius = 7) {
  const values = [];
  const centerX = clamp(Math.round(x), 0, width - 1);
  const centerY = clamp(Math.round(y), 0, height - 1);
  const radiusSquared = radius * radius;
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radiusSquared) continue;
      const sampleX = clamp(centerX + offsetX, 0, width - 1);
      const sampleY = clamp(centerY + offsetY, 0, height - 1);
      values.push(depth[sampleY * width + sampleX]);
    }
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 128;
}

function amplifyOuterProgress(progress, planeSeparation) {
  const normalizedProgress = clamp(progress, 0, 1);
  const separation = clamp(Number(planeSeparation) || 1, 1, 2.5);
  if (separation <= 1.0001 || normalizedProgress === 0 || normalizedProgress === 1) {
    return normalizedProgress;
  }

  // A normalized exponential gives the middle depth planes more travel while
  // preserving both ends exactly. Unlike a power curve below 1, its slope is
  // finite at the stability-band boundary, which avoids a disparity jump and
  // the bright/dark contour that jump would create around a face.
  const gain = (separation - 1) * 2.2;
  return (1 - Math.exp(-gain * normalizedProgress)) / (1 - Math.exp(-gain));
}

export function mapDepthForParallax(value, zero, relief, stabilityBand = 0, planeSeparation = 1) {
  const delta = value - zero;
  const denominator = delta >= 0 ? Math.max(1, 255 - zero) : Math.max(1, zero);
  const normalized = clamp(delta / denominator, -1, 1);
  if (!normalized) return 0;

  const gamma = 1 / clamp(relief, 0.5, 2.5);
  const magnitude = Math.pow(Math.abs(normalized), gamma);
  const band = clamp(Number(stabilityBand) || 0, 0, denominator * 0.8) / denominator;
  if (!band) return Math.sign(normalized) * magnitude;

  // A single zero-depth value is too fragile for faces and groups: neighbouring
  // pixels never share exactly the same predicted depth. Compress a continuous
  // band around convergence while redistributing the remaining range up to 1.
  // Keeping 8% of the local relief avoids turning a face into a cardboard cutout.
  const poweredBand = Math.pow(band, gamma);
  const microRelief = 0.08;
  let remapped;
  if (magnitude <= poweredBand) {
    remapped = magnitude * microRelief;
  } else {
    const outerProgress = (magnitude - poweredBand) / Math.max(1e-6, 1 - poweredBand);
    const separatedProgress = amplifyOuterProgress(outerProgress, planeSeparation);
    remapped = poweredBand * microRelief + separatedProgress * (1 - poweredBand * microRelief);
  }
  return Math.sign(normalized) * clamp(remapped, 0, 1);
}

export function renderNovelView(source, depth, width, height, position, options = {}) {
  if (source.length !== width * height * 4 || depth.length !== width * height) {
    throw new Error("Dimensions de rendu incohérentes");
  }
  if (Math.abs(position) < 1e-9) {
    return { data: new Uint8ClampedArray(source), holesBeforeFill: 0, filledPixels: 0 };
  }

  const zero = clamp(Number(options.zero ?? 128), 0, 255);
  const relief = clamp(Number(options.relief ?? 1.2), 0.5, 2.5);
  const stabilityBand = clamp(Number(options.stabilityBand ?? 0), 0, 64);
  const planeSeparation = clamp(Number(options.planeSeparation ?? 1), 1, 2.5);
  const parallaxPercent = clamp(Number(options.parallaxPercent ?? 2.4), 0, 8);
  const halfRangePixels = width * parallaxPercent / 200;
  const pixelCount = width * height;
  const output = new Uint8ClampedArray(source.length);
  const depthBuffer = new Int16Array(pixelCount);
  depthBuffer.fill(-1);
  const valid = new Uint8Array(pixelCount);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = y * width + x;
      const disparity = position * mapDepthForParallax(
        depth[sourceIndex],
        zero,
        relief,
        stabilityBand,
        planeSeparation
      ) * halfRangePixels;
      const targetX = Math.round(x - disparity);
      if (targetX < 0 || targetX >= width) continue;
      const targetIndex = y * width + targetX;
      if (valid[targetIndex] && depth[sourceIndex] < depthBuffer[targetIndex]) continue;
      const sourceColor = sourceIndex * 4;
      const targetColor = targetIndex * 4;
      output[targetColor] = source[sourceColor];
      output[targetColor + 1] = source[sourceColor + 1];
      output[targetColor + 2] = source[sourceColor + 2];
      output[targetColor + 3] = 255;
      depthBuffer[targetIndex] = depth[sourceIndex];
      valid[targetIndex] = 1;
    }
  }

  let holesBeforeFill = 0;
  for (let index = 0; index < valid.length; index += 1) holesBeforeFill += valid[index] ? 0 : 1;
  const originalValid = new Uint8Array(valid);
  const left = new Int32Array(width);
  const right = new Int32Array(width);

  for (let y = 0; y < height; y += 1) {
    let nearest = -1;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (originalValid[index]) nearest = x;
      left[x] = nearest;
    }
    nearest = -1;
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (originalValid[index]) nearest = x;
      right[x] = nearest;
    }
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (valid[index]) continue;
      const leftX = left[x];
      const rightX = right[x];
      let chosenX = leftX >= 0 ? leftX : rightX;
      if (leftX >= 0 && rightX >= 0) {
        const leftIndex = y * width + leftX;
        const rightIndex = y * width + rightX;
        const leftDepth = depthBuffer[leftIndex];
        const rightDepth = depthBuffer[rightIndex];
        if (Math.abs(leftDepth - rightDepth) > 8) chosenX = leftDepth < rightDepth ? leftX : rightX;
        else chosenX = x - leftX <= rightX - x ? leftX : rightX;
      }
      if (chosenX < 0) continue;
      const chosenIndex = y * width + chosenX;
      const chosenColor = chosenIndex * 4;
      const targetColor = index * 4;
      output[targetColor] = output[chosenColor];
      output[targetColor + 1] = output[chosenColor + 1];
      output[targetColor + 2] = output[chosenColor + 2];
      output[targetColor + 3] = 255;
      depthBuffer[index] = depthBuffer[chosenIndex];
      valid[index] = 1;
    }
  }

  let filledPixels = 0;
  for (let index = 0; index < valid.length; index += 1) {
    if (valid[index] && !originalValid[index]) filledPixels += 1;
    if (valid[index]) continue;
    const sourceColor = index * 4;
    output[sourceColor] = source[sourceColor];
    output[sourceColor + 1] = source[sourceColor + 1];
    output[sourceColor + 2] = source[sourceColor + 2];
    output[sourceColor + 3] = 255;
  }

  return { data: output, holesBeforeFill, filledPixels };
}

export function comparePixels(left, right) {
  if (left.length !== right.length) return { equal: false, different: Infinity };
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) different += 1;
  }
  return { equal: different === 0, different };
}
