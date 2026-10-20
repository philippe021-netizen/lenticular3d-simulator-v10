import test from 'node:test';
import assert from 'node:assert/strict';
import { hardenPixVersePrompts } from '../modules/pixverse-motion-policy.js';
import { getActionVariant } from '../modules/action-library.js';
import fs from 'node:fs';
test('every action family uses full-clip single pass policy; applying it twice is stable',()=>{
  const library=JSON.parse(fs.readFileSync(new URL('../data/actions-library.json',import.meta.url)));
  for(const action of library.actions)for(const variant of action.variants){
    const first=getActionVariant(library,action.id,variant.family,variant.id).variant;
    assert.match(first.prompt,/95%/);assert.doesNotMatch(first.prompt,/65%/);
    const twice=hardenPixVersePrompts(first.prompt,first.negativePrompt);
    assert.equal(twice.prompt,first.prompt);assert.equal(twice.negativePrompt,first.negativePrompt);
    assert.match(first.prompt,/nine progressive views/i);assert.match(first.prompt,/Never reverse/);
  }
});
test('old appended policy is upgraded and cannot reserve an early final hold',()=>{
  const result=hardenPixVersePrompts('Head turns. LENTICULAR ONE-WAY MOTION POLICY: Reach final state by 65% and hold.');
  assert.doesNotMatch(result.prompt,/65%/);assert.match(result.prompt,/Head turns/);
  assert.equal(result.policy,'lenticular-nine-states-v2');
});
