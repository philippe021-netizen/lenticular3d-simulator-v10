import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cameraPlan, assessTopCoverage } from '../gaussian-9views-core.js';

const metadata = {
  depth: { near: 0.8, focus: 2.4, median: 3.1 },
  diagonal: 1.25
};

test('nine Gaussian cameras translate laterally at fixed focus, with view 05 exactly central', () => {
  const plan = cameraPlan(metadata, 0.018, 2.4);
  assert.equal(plan.views.length, 9);
  assert.equal(plan.views[4].eyeX, 0);
  assert.deepEqual(plan.views.map(view => view.eyeZ), Array(9).fill(0));
  assert.deepEqual(plan.views.map(view => view.focusDepth), Array(9).fill(2.4));
  assert.equal(plan.views[0].eyeX, -plan.views[8].eyeX);
  for (let i = 1; i < 9; i++) assert.ok(plan.views[i].eyeX > plan.views[i - 1].eyeX);
});

test('native shader preserves focal intrinsics and changes projection only through lateral eyeX', async () => {
  const shader = await readFile(new URL('../gaussian-native-projection.js', import.meta.url), 'utf8');
  assert.match(shader, /float xn=\(a_position\.x-u_eyeX\)\/z \+ u_eyeX\/max\(u_focusDepth,0\.05\)/);
  assert.match(shader, /float px=u_fx\*xn\+u_cx/);
  assert.match(shader, /float py=u_fy\*yn\+u_cy/);
  assert.doesNotMatch(shader, /u_eyeZ|u_zoom|autoFit/i);
  assert.match(shader, /uniform1f\(this\.uniform\.u_fx,Number\(intr\.fx\)\*sx\)/);
});

test('warns when the native PLY has no projected points across a substantial upper-frame band', () => {
  const assessment = assessTopCoverage({ y: 180 }, 480);
  assert.equal(assessment.warning, true);
  assert.equal(assessment.upperBlankPercent, 37.5);
  assert.match(assessment.message, /données géométriques PLY.*ne peuvent pas être recréées/i);
  assert.equal(assessTopCoverage(null, 480).warning, false);
});

test('measures native PLY coverage before border repair can fill the alpha gaps', async () => {
  const core = await readFile(new URL('../gaussian-9views-core.js', import.meta.url), 'utf8');
  assert.match(core, /sourceCoverage=analyzeAlpha\(ctx\.getImageData[\s\S]*?repairBorderTransparency\(copy\)/);
  assert.match(core, /sourceCoverageBounds:sourceCoverage\.coverageBounds/);
});
