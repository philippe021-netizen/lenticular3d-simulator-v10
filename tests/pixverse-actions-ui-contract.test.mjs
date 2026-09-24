import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseActionId } from '../modules/action-library.js';

test('refreshing an action family preserves the selected action', () => {
  const actions = [{ id: 'heart_hands' }, { id: 'wave' }, { id: 'blown_kiss' }];
  assert.equal(chooseActionId(actions, 'wave'), 'wave');
  assert.equal(chooseActionId(actions, 'missing'), 'heart_hands');
});

test('actions page exposes guide, mode, progress and expert QC surfaces', async () => {
  const html = await readFile(new URL('../happyholo-pixverse-actions-test.html', import.meta.url), 'utf8');
  for (const id of ['guidePreview','pixverseMode','pipelineProgress','qcSummary','candidateFrames','selectedFrames','expertPanel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /async function resumeActiveJob/);
  assert.match(html, /jobStore\.loadActive\(\)/);
  assert.match(html, /waitForPixVerse\(active\.videoId/);
  assert.match(html, /result\.candidateFrames/);
  assert.match(html, /stabilization:extracted\.stabilization/);
  assert.match(html, /chooseActionId\(acts,previousActionId\)/);
});

test('V2 controls exposes Mimic without removing existing modes', async () => {
  const html = await readFile(new URL('../pixverse-v2-controls-test.html', import.meta.url), 'utf8');
  for (const mode of ['standard','transition','mimic','omni','multi_transition']) {
    assert.match(html, new RegExp(`value=["']${mode}["']`));
  }
});
