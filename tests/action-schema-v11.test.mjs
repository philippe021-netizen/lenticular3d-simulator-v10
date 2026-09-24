import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeActionLibrary, validateActionVariant } from '../modules/action-schema.js';

test('normalizes a v10 person variant to v11 defaults', () => {
  const out = normalizeActionLibrary({ version: 10, actions: [{
    id: 'wave', label: 'Salut', variants: [{ id: 'p', family: 'person', prompt: 'Wave', duration: 2 }]
  }]});
  const variant = out.actions[0].variants[0];
  assert.equal(out.version, 11);
  assert.deepEqual(variant.microplayer, { strategy: 'progressive-nine-with-stabilization', lpi: 60, viewCount: 9 });
  assert.deepEqual(variant.compatibleSubjects, ['person-single']);
});

test('rejects Mimic without a guide and motion output at 50 LPI', () => {
  const result = validateActionVariant({
    id: 'bad', compatibleSubjects: ['person-single'], pixverse: { mode: 'mimic' },
    microplayer: { lpi: 50, viewCount: 9 }
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /guide/i);
  assert.match(result.errors.join(' '), /60 LPI/i);
});

test('keeps the held-object action reachable from the Logo / Objet UI family', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/actions-library.json', import.meta.url), 'utf8'));
  const library = normalizeActionLibrary(raw);
  const variant = library.actions.find(action => action.id === 'held_object_move')?.variants?.[0];
  assert.equal(variant?.family, 'logo');
  assert.ok(variant?.compatibleSubjects.includes('object'));
});
