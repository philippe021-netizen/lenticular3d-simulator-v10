import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cameraPlan, assessTopCoverage } from '../gaussian-9views-core.js';

const metadata = {
  depth: { near: 0.8, focus: 2.4, median: 3.1 },
  diagonal: 1.25
};

test('nine Gaussian cameras translate laterally around the selected focus', () => {
  const plan = cameraPlan(metadata, 0.018, 2.4);
  assert.equal(plan.views.length, 9);
  assert.equal(plan.views[4].eyeX, 0);
  assert.deepEqual(plan.views.map(view => view.eyeZ), Array(9).fill(0));
  assert.deepEqual(plan.views.map(view => view.focusDepth), Array(9).fill(2.4));
  assert.equal(plan.views[0].eyeX, -plan.views[8].eyeX);
  for (let i = 1; i < 9; i++) assert.ok(plan.views[i].eyeX > plan.views[i - 1].eyeX);
});

test('browser renderer lazily loads SparkJS and renders covariance aware Gaussian splats', async () => {
  const core = await readFile(new URL('../gaussian-9views-core.js', import.meta.url), 'utf8');
  assert.match(core, /import\('three'\)/);
  assert.match(core, /import\('@sparkjsdev\/spark'\)/);
  assert.match(core, /new Spark\.SparkRenderer\(\{renderer:this\.renderer\}\)/);
  assert.match(core, /new \(await import\('@sparkjsdev\/spark'\)\)\.SplatMesh\(\{url\}\)/);
  assert.match(core, /this\.scene\.add\(this\.spark\)/);
  assert.doesNotMatch(core, /NativeGaussianRenderer|gaussian-native-projection/);
});

test('warns when the Gaussian scene has no projected points across a substantial upper-frame band', () => {
  const assessment = assessTopCoverage({ y: 180 }, 480);
  assert.equal(assessment.warning, true);
  assert.equal(assessment.upperBlankPercent, 37.5);
  assert.match(assessment.message, /données géométriques PLY.*ne peuvent pas être recréées/i);
  assert.equal(assessTopCoverage(null, 480).warning, false);
});

test('page pins the matching SparkJS renderer and identifies it accurately', async () => {
  const page = await readFile(new URL('../microplayer-photo-to-gaussian-lab.html', import.meta.url), 'utf8');
  assert.match(page, /releases\/spark\/2\.2\.0\/spark\.module\.js/);
  assert.match(page, /Rendu Gaussian SparkJS · ellipsoïdes orientés, opacité et tri de profondeur/);
  assert.match(page, /maxEdge:preview\?1536/);
  assert.doesNotMatch(page, /NOUVEAU MOTEUR NATIF|projection PLY native|projection native/);
});

test('warns when the source photo and PLY have materially different framing ratios', async () => {
  const page = await readFile(new URL('../microplayer-photo-to-gaussian-lab.html', import.meta.url), 'utf8');
  assert.match(page, /assessPhotoFrameMatch\(sourcePhotoDimensions,metadata\.image\)/);
  assert.match(page, /PRODUCTION 9 VUES BLOQUÉE — '\+sourceFrameWarning\.message/);
  assert.match(page, /TEST COMPARATIF AUTORISÉ/);
  assert.match(page, /cadrage source \/ PLY différent/);
  assert.match(page, /Charge un PLY dont le cadrage correspond à la photo/);
});
