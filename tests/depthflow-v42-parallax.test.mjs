import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeParallaxPotential,
  comparePixels,
  renderNovelView
} from "../depthflow-v42-core.js";

const W = 256;
const H = 180;
const options = {
  zero: 215,
  stabilityBand: 30,
  relief: 1.35,
  planeSeparation: 1.75,
  parallaxPercent: 5
};

function makeScene(flat = false) {
  const source = new Uint8ClampedArray(W * H * 4);
  const depth = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const index = y * W + x;
      const foreground = x >= 90 && x < 170 && y >= 30 && y < 157;
      depth[index] = flat ? 215 : foreground ? 215 : 35;
      source[index * 4] = (x * 13 + y * 7) % 255;
      source[index * 4 + 1] = (x * 17 + y * 3) % 255;
      source[index * 4 + 2] = (x + y * 11) % 255;
      source[index * 4 + 3] = 255;
    }
  }
  return { source, depth };
}

test("contraste de profondeur suffisant : les plans doivent se séparer", () => {
  const { depth } = makeScene();
  const analysis = analyzeParallaxPotential(depth, W, options);
  assert.equal(analysis.valid, true);
  assert.equal(analysis.weak, false);
  assert.ok(analysis.relativeShiftPx >= 6);
  assert.ok(analysis.p10 < analysis.p90);
});

test("carte plate : ne pas présenter neuf images semblables comme un relief validé", () => {
  const { depth } = makeScene(true);
  const analysis = analyzeParallaxPotential(depth, W, options);
  assert.equal(analysis.weak, true);
  assert.equal(analysis.depthSpan, 0);
  assert.equal(analysis.relativeShiftPx, 0);
});

test("neuf positions : neuf images différentes et 05 identique à la source", () => {
  const { source, depth } = makeScene();
  const hashes = new Set();
  const frames = [];
  for (let view = 0; view < 9; view += 1) {
    const frame = renderNovelView(source, depth, W, H, (view - 4) / 4, options).data;
    frames.push(frame);
    let hash = 2166136261;
    for (let i = 0; i < frame.length; i += 11) {
      hash ^= frame[i];
      hash = Math.imul(hash, 16777619);
    }
    hashes.add(hash >>> 0);
  }
  assert.equal(hashes.size, 9);
  assert.equal(comparePixels(source, frames[4]).equal, true);
  assert.ok(comparePixels(frames[0], frames[8]).different > 100);
});

test("parallaxe nulle : ne pas inventer de relief", () => {
  const { source, depth } = makeScene();
  const settings = { ...options, parallaxPercent: 0 };
  const analysis = analyzeParallaxPotential(depth, W, settings);
  assert.equal(analysis.weak, true);
  assert.equal(analysis.relativeShiftPx, 0);
  assert.equal(comparePixels(source, renderNovelView(source, depth, W, H, 1, settings).data).equal, true);
});
