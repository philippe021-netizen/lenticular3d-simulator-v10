import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../microplayer-card-v33-master-scene.html', import.meta.url), 'utf8');

test('V33 export manifest names production views in their explicit left-to-right order', () => {
  assert.match(html, /const viewFiles=state\.views\.map/);
  assert.match(html, /view_files:state\.views\.length===9\?viewFiles:\[\]/);
});

test('V33 ZIP failure reports an error and always restores the ZIP button', () => {
  assert.match(html, /async function exportViewsZip\(/);
  assert.match(html, /catch\(error\).*ZIP.*error\.message/s);
  assert.match(html, /finally\{button\.disabled=false;button\.textContent='ZIP complet'/);
});

test('the enabled result button exports the visible technical preview', () => {
  assert.match(html, /downloadRelief.*onclick=/s);
  assert.doesNotMatch(html, /\$\('downloadRelief'\)\.onclick=\(\)=>\{\}/);
});
