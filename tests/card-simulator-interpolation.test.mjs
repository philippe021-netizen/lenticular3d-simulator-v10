import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../microplayer-card-v33-master-scene.html',import.meta.url),'utf8');

test('le simulateur accepte des positions fractionnaires entre les 9 vues',()=>{
  assert.match(html,/simRange[^>]*step="0\.01"/);
  assert.match(html,/const p=Math\.max\(0,Math\.min\(8,Number\(position\)\|\|0\)\)/);
  assert.match(html,/normal=\(p-4\)\/4,angleDeg=normal<0\?normal\*35:normal\*22/);
  assert.ok(html.includes("simRig.style.transform='rotateY('+angleDeg.toFixed(3)+'deg)'"));
});

test('le balayage est animé à chaque frame et non toutes les 430 ms',()=>{
  assert.match(html,/state\.simPosition\+=state\.direction\*advance/);
  assert.match(html,/requestAnimationFrame\((?:loop|animationLoop)\)/);
  const animation=html.slice(html.indexOf('function animationLoop'),html.indexOf('function startAnimation'));
  assert.doesNotMatch(animation,/setInterval\(/);
});
