import test from "node:test";
import assert from "node:assert/strict";
import {
  composeSemanticDepth,
  compressDepthAroundPlane,
  createBoxMask,
  createSemanticMask,
  maskCoverage,
  paintMask
} from "../business-card-depthflow-core.js";

test("le mode carte stabilise le graphisme de fond autour du plan zéro", () => {
  const base = Uint8ClampedArray.from([0, 64, 128, 192, 255]);
  const result = compressDepthAroundPlane(base, 150, 0.2);
  assert.deepEqual([...result], [120, 133, 146, 158, 171]);
});

test("les calques gardent toute leur hauteur sur un fond stabilisé", () => {
  const base = Uint8ClampedArray.from([0, 64, 128, 192]);
  const mask = Uint8ClampedArray.from([0, 255, 0, 0]);
  const result = composeSemanticDepth(base, [{ mask, depth: 220, internalRelief: 0 }], {
    zero: 150,
    backgroundRelief: 0.2
  });
  assert.deepEqual([...result], [120, 220, 146, 158]);
});

test("chaque calque impose sa propre hauteur 0–255", () => {
  const base = new Uint8ClampedArray(12).fill(90);
  const nameMask = new Uint8ClampedArray(12);
  const logoMask = new Uint8ClampedArray(12);
  nameMask[2] = nameMask[3] = 255;
  logoMask[8] = logoMask[9] = 255;
  const result = composeSemanticDepth(base, [
    { mask: nameMask, depth: 205, internalRelief: 0 },
    { mask: logoMask, depth: 238, internalRelief: 0 }
  ]);
  assert.equal(result[2], 205);
  assert.equal(result[8], 238);
  assert.equal(result[0], 90);
});

test("un texte rigide garde une profondeur constante", () => {
  const base = Uint8ClampedArray.from([40, 80, 120, 160, 200, 240]);
  const mask = new Uint8ClampedArray(6).fill(255);
  const result = composeSemanticDepth(base, [{ mask, depth: 180, internalRelief: 0 }]);
  assert.deepEqual([...result], [180, 180, 180, 180, 180, 180]);
});

test("un objet peut conserver un micro-relief DepthFlow", () => {
  const base = Uint8ClampedArray.from([90, 100, 110]);
  const mask = new Uint8ClampedArray(3).fill(255);
  const result = composeSemanticDepth(base, [{ mask, depth: 180, internalRelief: 0.5 }]);
  assert.deepEqual([...result], [175, 180, 185]);
});

test("le masque automatique isole un texte contrasté", () => {
  const width = 12;
  const height = 8;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
  for (let y = 3; y <= 4; y += 1) for (let x = 4; x <= 7; x += 1) {
    const index = (y * width + x) * 4;
    rgba[index] = rgba[index + 1] = rgba[index + 2] = 0;
  }
  const mask = createSemanticMask(rgba, width, height, [0.2, 0.2, 0.6, 0.6], { threshold: 30, dilate: 0 });
  assert.ok(mask[3 * width + 5] > 220);
  assert.equal(mask[1 * width + 1], 0);
  assert.ok(maskCoverage(mask).active >= 8);
});

test("le Pencil corrige le masque sans toucher le reste", () => {
  const mask = createBoxMask(20, 10, [0, 0, 0.1, 0.1]);
  const beforeFar = mask[9 * 20 + 19];
  paintMask(mask, 20, 10, { x: 10, y: 5 }, { x: 16, y: 5 }, 2, 255);
  assert.ok(mask[5 * 20 + 13] > 0);
  assert.equal(mask[9 * 20 + 19], beforeFar);
});
