import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../microplayer-business-card-depthflow.html',import.meta.url),'utf8');

test('le simulateur accepte des positions fractionnaires entre les 9 vues',()=>{
  assert.match(html,/simRange[^>]*step="0\.01"/);
  assert.match(html,/const p=Math\.max\(0,Math\.min\(8,position\)\),lo=Math\.floor\(p\),hi=Math\.min\(8,lo\+1\),mix=p-lo/);
  assert.match(html,/ctx\.globalAlpha=mix/);
});

test('le balayage est animé à chaque frame et non toutes les 430 ms',()=>{
  assert.doesNotMatch(html,/t-state\.simLast>430/);
  assert.match(html,/state\.simPosition\+=state\.simDirection\*dt\/620/);
  assert.match(html,/requestAnimationFrame\(loop\)/);
});
