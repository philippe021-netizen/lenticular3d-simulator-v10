import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePixVerseMode } from '../modules/action-schema.js';

test('routes one person with a guide to Mimic', () => {
  assert.equal(resolvePixVerseMode({ requestedMode: 'auto', subjectType: 'person-single', guide: { url: 'heart.mp4' }, pixverse: { mode: 'mimic' } }).mode, 'mimic');
});

for (const subjectType of ['couple', 'group', 'object', 'vehicle']) {
  test(`does not silently route ${subjectType} to Mimic`, () => {
    const result = resolvePixVerseMode({ requestedMode: 'auto', subjectType, guide: { url: 'guide.mp4' }, pixverse: { mode: 'mimic', fallbackMode: 'standard' } });
    assert.equal(result.mode, 'standard');
  });
}

test('explicit expert selection is preserved', () => {
  assert.equal(resolvePixVerseMode({ requestedMode: 'transition', subjectType: 'object' }).mode, 'transition');
});
