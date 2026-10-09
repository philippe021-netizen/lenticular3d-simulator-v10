import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Photo & relief keeps both existing exports and opens the new print step with its nine blobs', async () => {
  const [page, engine, printPage, ui] = await Promise.all([
    read('../relief3d-test-v31.html'),
    read('../relief-engine-v31.js'),
    read('../microplayer-lenticular-print.html'),
    read('../modules/lenticular-print-ui.js')
  ]);
  assert.match(page, /id="export"[^>]*>Exporter 9 vues/);
  assert.match(page, /id="download"[^>]*>Télécharger ZIP/);
  assert.match(page, /id="openLenticularPrint"[^>]*>Impression lenticulaire/);
  assert.match(printPage, /Après le chargement des neuf vues, le bouton devient actif/);
  assert.match(engine, /microplayer-lenticular-print\.html/);
  assert.match(engine, /microplayer-lenticular-print-ready/);
  assert.match(engine, /microplayer-lenticular-print-views/);
  assert.match(ui, /const images = state\.images\.slice\(\)/);
  assert.match(ui, /const files = state\.files\.slice\(\)/);
  assert.match(ui, /state\.resultSignature = signature/);
  assert.match(ui, /state\.resultSignature !== createRenderSignature\(buildSpec\(\), cropOptions\(\)\)/);
  assert.match(ui, /validateSharedAspectRatio\(images\)/);
  assert.match(ui, /generation === state\.renderGeneration/);
});

test('Hub exposes the print module directly and service worker caches its app files', async () => {
  const [hub, worker] = await Promise.all([read('../index.html'), read('../service-worker-v317.js')]);
  assert.match(hub, /id:'print',[\s\S]*?microplayer-lenticular-print\.html/);
  assert.match(worker, /microplayer-lenticular-print\.html/);
  assert.match(worker, /lenticular-print-core\.js/);
  assert.match(worker, /lenticular-print-browser\.js/);
  assert.match(worker, /lenticular-print-ui\.js/);
});

test('nine loaded views make the interlace action directly available with a clear next step', async () => {
  const [page, ui] = await Promise.all([read('../microplayer-lenticular-print.html'), read('../modules/lenticular-print-ui.js')]);
  assert.doesNotMatch(page, /id="cropReviewed"/);
  assert.match(ui, /\$\('render'\)\.disabled = state\.isRendering \|\| state\.images\.length !== 9 \|\| !activePrintCompatibility\.ok;/);
  assert.match(ui, /setStatus\(\$\('renderStatus'\), '9 vues prêtes[\s\S]*?Interlacer les 9 vues/);
});

test('selected A4 / Roland / HP settings prevent unintentional Canon 10×15 exports', async () => {
  const [hub, print, ui] = await Promise.all([
    read('../index.html'), read('../microplayer-lenticular-print.html'), read('../modules/lenticular-print-ui.js')
  ]);
  assert.match(hub,/id:'print-setup'/);
  assert.match(hub,/microplayer-print-start\.html/);
  assert.match(print,/id="profileCompatibility"/);
  assert.match(ui,/function printerSetupAllowsLegacy\(/);
  assert.match(ui,/!activePrintCompatibility\.ok/);
});
