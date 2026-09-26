import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../pixverse-v3-motion-guide.html', import.meta.url), 'utf8');

test('manual PixVerse MP4 can be analyzed locally without starting an API request', () => {
  assert.match(html, /id="manualMp4"[^>]*accept="video\/mp4/);
  assert.match(html, /id="analyzeManualMp4"/);
  assert.match(html, /aucune requête PixVerse lancée/);
  assert.match(html, /URL\.createObjectURL\(file\).*video\.src=manualMp4Url/s);
});

test('production ZIP is locked until final identity QC passes and is labeled 60 LPI', () => {
  assert.match(html, /id="exportZip" disabled>Télécharger ZIP 9 vues · 60 LPI/);
  assert.match(html, /\$\('exportZip'\)\.disabled=frames\.length!==9/);
  assert.match(html, /if\(!qc\?\.passed\)throw new Error\('QC identité non validé\.'/);
  assert.match(html, /MicroPlayer-PixVerse-V3-9-vues-60LPI\.zip/);
});
