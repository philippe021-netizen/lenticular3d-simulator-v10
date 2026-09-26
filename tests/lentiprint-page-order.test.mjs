import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../microplayer-lentiprint-v1.html', import.meta.url), 'utf8');

test('ZIP manifest order is preserved while manual selection keeps natural numeric sorting', () => {
  assert.match(html, /async function loadViews\(files,sourceLabel='images',preserveOrder=false\)/);
  assert.match(html, /const list=preserveOrder\?\[\.\.\.files\]:\[\.\.\.files\]\.sort/);
  assert.match(html, /loadViews\(files,'ZIP '\+zipFile\.name,true\)/);
});
