import test from 'node:test';
import assert from 'node:assert/strict';
import { hardenMotionPrompts } from '../modules/pixverse-motion-policy.js';

test('finishes near the end without a long 65 percent hold', () => {
  const out = hardenMotionPrompts('Form a heart.', '', { finalStateTarget: 0.94 });
  assert.match(out.prompt, /final state between 90% and 98%/i);
  assert.doesNotMatch(out.prompt, /65%/);
  assert.match(out.negativePrompt, /reverse motion/);
});

test('policy is appended only once', () => {
  const once = hardenMotionPrompts('Wave.', '').prompt;
  const twice = hardenMotionPrompts(once, '').prompt;
  assert.equal(twice, once);
});
