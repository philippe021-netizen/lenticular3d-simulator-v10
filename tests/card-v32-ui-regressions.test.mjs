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


test("le bouton relief autonome appelle le serveur puis applique les profondeurs avant les 9 vues", async () => {
  const html = await readFile(new URL("../microplayer-card-v32-studio.html", import.meta.url), "utf8");
  assert.match(html, /Créer le relief automatiquement/);
  assert.match(html, /fetch\('\/api\/card-relief-compose'/);
  assert.match(html, /corrected\.get\(String\(group\.id\)\)/);
  assert.match(html, /await generateViews\(\)/);
});
