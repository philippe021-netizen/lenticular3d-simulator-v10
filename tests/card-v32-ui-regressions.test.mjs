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
