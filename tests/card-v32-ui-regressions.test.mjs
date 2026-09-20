import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le redressement lit la photo propre et jamais le canvas avec les poignées", async () => {
  const html = await readFile(new URL("../microplayer-card-v32-scanner.html", import.meta.url), "utf8");
  assert.match(html, /cv\.imread\(cleanSourceCanvas\(\)\)/);
  assert.doesNotMatch(html, /cv\.imread\(src\)/);
});

test("le manifeste ZIP conserve les dimensions et les diagnostics de rendu", async () => {
  const html = await readFile(new URL("../microplayer-card-v32-studio.html", import.meta.url), "utf8");
  assert.match(html, /schema:'microplayer\.card-v32'/);
  assert.match(html, /dimensions:\{width:state\.width,height:state\.height\}/);
  assert.match(html, /holesBeforeFill:rendered\.holesBeforeFill/);
});


test("le contrôle IA ajuste les profondeurs sans fabriquer les vues", async () => {
  const html = await readFile(new URL("../microplayer-card-v32-studio.html", import.meta.url), "utf8");
  assert.match(html, /Contrôle IA des profondeurs/);
  assert.match(html, /fetch\('\/api\/card-layer-analyze'/);
  assert.match(html, /corrected\.get\(String\(group\.id\)\)/);
});

test("les vues latérales utilisent le fond maître nettoyé et la vue 05 reste originale", async () => {
  const html = await readFile(new URL("../microplayer-card-v32-studio.html", import.meta.url), "utf8");
  assert.match(html, /if\(index===4\)\{\s*ctx\.drawImage\(original,0,0\)/);
  assert.match(html, /ctx\.drawImage\(state\.rigidPreview\.base,0,0,W,H\)/);
  assert.match(html, /mode:'clean-master-semantic-v32'/);
});

test("la parallaxe est calculée autour du vrai plan zéro", async () => {
  const html = await readFile(new URL("../microplayer-card-v32-studio.html", import.meta.url), "utf8");
  assert.match(html, /const relative=\(Number\(layer\.depth\)-zero\)\/denom/);
  assert.doesNotMatch(html, /const z=\(\(layer\.depth-dMin\)\/span\)\*2-1/);
});

test("les grands artworks structurels restent dans le fond", async () => {
  const html = await readFile(new URL("../microplayer-card-v32-studio.html", import.meta.url), "utf8");
  assert.match(html, /role==='artwork'.*coverage>18\|\|area>0\.18/);
  assert.match(html, /productionGroups\(\)/);
});
