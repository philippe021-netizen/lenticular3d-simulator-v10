import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../render-pipeline-v1.js', import.meta.url), 'utf8');

function makePipeline() {
  const window = {};
  vm.runInNewContext(source, { window });
  return window;
}

test('the dispatcher chooses the highest enabled renderer', () => {
  const window = makePipeline();
  const calls = [];
  window.HappyHoloRenderPipeline.register('base', () => calls.push('base'));
  window.HappyHoloRenderPipeline.register('advanced', () => calls.push('advanced'), { priority: 20 });
  window.renderAt(0, {});
  assert.deepEqual(calls, ['advanced']);
  assert.deepEqual(Array.from(window.HappyHoloRenderPipeline.active()), ['advanced', 'base']);
});

test('a renderer can safely delegate to the next renderer', () => {
  const window = makePipeline();
  const calls = [];
  window.HappyHoloRenderPipeline.register('base', () => calls.push('base'));
  window.HappyHoloRenderPipeline.register('selection', (_norm, _target, next) => {
    calls.push('selection');
    next();
  }, { priority: 30 });
  window.renderAt(0, {});
  assert.deepEqual(calls, ['selection', 'base']);
});

test('disabled renderers do not alter the active pipeline', () => {
  const window = makePipeline();
  const calls = [];
  window.HappyHoloRenderPipeline.register('base', () => calls.push('base'));
  window.HappyHoloRenderPipeline.register('explodeview', () => calls.push('explodeview'), { priority: 40, enabled: () => false });
  window.renderAt(0, {});
  assert.deepEqual(calls, ['base']);
  assert.deepEqual(Array.from(window.HappyHoloRenderPipeline.active()), ['base']);
});

test('the primary Photo & relief page loads the stable dispatcher before every renderer extension', async () => {
  const html = await readFile(new URL('../relief3d-test-v31.html', import.meta.url), 'utf8');
  const dispatcher = html.indexOf('./render-pipeline-v1.js');
  const engine = html.indexOf('./relief-engine-v31.js');
  const selection = html.indexOf('./selection-controls-v336.js');
  const composition = html.indexOf('./composition-advanced-v350.js');
  const explode = html.indexOf('./explodeview-machines-v380.js');
  assert.ok(dispatcher >= 0 && dispatcher < engine);
  assert.ok(engine < selection && selection < composition && composition < explode);
});

test('the primary export still renders exactly nine ordered poses', async () => {
  const engine = await readFile(new URL('../relief-engine-v31.js', import.meta.url), 'utf8');
  assert.match(engine, /const poses=\[-1,-\.75,-\.5,-\.25,0,\.25,\.5,\.75,1\]/);
  assert.match(engine, /for\(let i=0;i<9;i\+\+\)/);
  assert.match(engine, /zip\.file\(`vue-\$\{String\(i\+1\)\.padStart\(2,'0'\)\}\.png`,b\)/);
});


test('the hub retains every existing top-level module route', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const route of [
    'relief3d-test-v31.html',
    'happyholo-tiefling-v15.html',
    'glb-3d-studio.html',
    'happyholo-pixverse-actions-test.html',
    'happyholo-pixverse-free.html',
    'happyholo-business-card-studio.html',
    'happyholo-simulator.html',
    'explodeview-rocket-demo/index.html'
  ]) assert.ok(html.includes(route), `missing hub route: ${route}`);
});

test('the offline application shell includes the dispatcher used by Photo & relief', async () => {
  const worker = await readFile(new URL('../service-worker-v317.js', import.meta.url), 'utf8');
  assert.match(worker, /happyholo-offline-v1\.84/);
  assert.match(worker, /'\.\/render-pipeline-v1\.js'/);
});
