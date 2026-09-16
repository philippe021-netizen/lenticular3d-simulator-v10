import test from "node:test";
import assert from "node:assert/strict";

import {
  comparePixels,
  composeEditedDepth,
  depthAt,
  mapDepthForParallax,
  normalizeDepthTensor,
  refineDepthEdgeAware,
  renderNovelView
} from "../depthflow-v42-core.js";

function fixture(width = 80, height = 40) {
  const source = new Uint8ClampedArray(width * height * 4);
  const depth = new Uint8ClampedArray(width * height).fill(40);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const rgba = index * 4;
      const foreground = x >= 30 && x < 50 && y >= 8 && y < 32;
      source[rgba] = foreground ? 230 : 20;
      source[rgba + 1] = foreground ? 35 : 90;
      source[rgba + 2] = foreground ? 25 : 210;
      source[rgba + 3] = 255;
      if (foreground) depth[index] = 220;
    }
  }
  return { source, depth, width, height };
}

test("normalisation robuste en 0–255", () => {
  const raw = { data: new Float32Array([0, 1, 2, 3]), dims: [1, 2, 2] };
  const normalized = normalizeDepthTensor(raw);
  assert.equal(normalized.width, 2);
  assert.equal(normalized.height, 2);
  assert.equal(normalized.data[0], 0);
  assert.equal(normalized.data[3], 255);
});

test("la vue 05 est une copie octet pour octet de la photo", () => {
  const input = fixture();
  const center = renderNovelView(input.source, input.depth, input.width, input.height, 0, {
    zero: 128,
    relief: 2,
    parallaxPercent: 6
  });
  assert.deepEqual(comparePixels(input.source, center.data), { equal: true, different: 0 });
});

test("un plan égal à la convergence reste immobile", () => {
  const input = fixture();
  input.depth.fill(128);
  const view = renderNovelView(input.source, input.depth, input.width, input.height, 1, {
    zero: 128,
    relief: 1.2,
    parallaxPercent: 6
  });
  assert.equal(comparePixels(input.source, view.data).equal, true);
});

test("la bande de convergence stabilise le sujet sans aplatir toute la scène", () => {
  const zero = 190;
  const withoutBand = Math.abs(mapDepthForParallax(205, zero, 1.35, 0));
  const stableFace = Math.abs(mapDepthForParallax(205, zero, 1.35, 30));
  const farBackground = Math.abs(mapDepthForParallax(45, zero, 1.35, 30));
  assert.ok(stableFace < withoutBand * 0.12);
  assert.ok(farBackground > stableFace * 20);
  assert.equal(mapDepthForParallax(zero, zero, 1.35, 30), 0);
});

test("le remappage conserve les extrêmes de profondeur", () => {
  assert.equal(mapDepthForParallax(0, 190, 1.35, 30, 1.75), -1);
  assert.equal(mapDepthForParallax(255, 190, 1.35, 30, 1.75), 1);
});

test("la séparation renforce les plans intermédiaires sans casser la bande stable", () => {
  const zero = 190;
  const edgeOfStableBand = mapDepthForParallax(160, zero, 1.35, 30, 1.75);
  const linearMiddle = Math.abs(mapDepthForParallax(125, zero, 1.35, 30, 1));
  const separatedMiddle = Math.abs(mapDepthForParallax(125, zero, 1.35, 30, 1.75));
  assert.equal(edgeOfStableBand, mapDepthForParallax(160, zero, 1.35, 30, 1));
  assert.ok(separatedMiddle > linearMiddle * 1.35);
  assert.ok(separatedMiddle < 1);
});

test("la parallaxe modifie réellement les vues", () => {
  const input = fixture();
  const low = renderNovelView(input.source, input.depth, input.width, input.height, 1, {
    zero: 128,
    relief: 1.2,
    parallaxPercent: 0.5
  });
  const high = renderNovelView(input.source, input.depth, input.width, input.height, 1, {
    zero: 128,
    relief: 1.2,
    parallaxPercent: 6
  });
  assert.ok(comparePixels(low.data, high.data).different > 0);
});

test("le relief interne modifie la répartition sans déplacer le plan zéro", () => {
  const input = fixture();
  const low = renderNovelView(input.source, input.depth, input.width, input.height, 0.75, {
    zero: 128,
    relief: 0.5,
    parallaxPercent: 6
  });
  const high = renderNovelView(input.source, input.depth, input.width, input.height, 0.75, {
    zero: 128,
    relief: 2,
    parallaxPercent: 6
  });
  assert.ok(comparePixels(low.data, high.data).different > 0);
});

test("les désocclusions sont remplies sans alpha vide ni silhouette fantôme", () => {
  const input = fixture();
  const view = renderNovelView(input.source, input.depth, input.width, input.height, 1, {
    zero: 128,
    relief: 1.2,
    parallaxPercent: 8
  });
  assert.ok(view.holesBeforeFill > 0);
  for (let index = 3; index < view.data.length; index += 4) assert.equal(view.data[index], 255);
  const formerRightEdge = (20 * input.width + 49) * 4;
  assert.ok(view.data[formerRightEdge + 2] > view.data[formerRightEdge]);
});

test("les corrections Pencil restent continues", () => {
  const base = new Uint8ClampedArray([0, 64, 128, 255]);
  const edited = new Uint8ClampedArray([255, 255, 255, 0]);
  const weights = new Uint8ClampedArray([0, 64, 128, 255]);
  assert.deepEqual([...composeEditedDepth(base, edited, weights)], [0, 112, 192, 0]);
});

test("le raffinement conserve les bornes et l'ancrage médian", () => {
  const width = 5;
  const height = 5;
  const depth = new Uint8ClampedArray(width * height).fill(100);
  depth[12] = 240;
  const guide = new Uint8ClampedArray(width * height * 4);
  guide.fill(255);
  const refined = refineDepthEdgeAware(depth, guide, width, height, 2);
  assert.ok(refined.every(value => value >= 0 && value <= 255));
  assert.equal(depthAt(new Uint8ClampedArray(width * height).fill(173), width, height, 2, 2, 2), 173);
});
