import test from 'node:test';
import assert from 'node:assert/strict';
import { infiniErrorMessage } from '../modules/infini-error.js';

test('explains ZeroGPU quota exhaustion as an external service limit and preserves manual PLY fallback', () => {
  const message = infiniErrorMessage(new Error('You have exceeded your ZeroGPU runs limit'));
  assert.match(message, /quota.*InfiniSplat|InfiniSplat.*quota/i);
  assert.match(message, /PLY manuel/i);
});

test('labels a MicroPlayer photo preparation failure separately from a backend quota', () => {
  const message = infiniErrorMessage(new Error('Photo illisible dans Safari'));
  assert.match(message, /MicroPlayer/i);
  assert.doesNotMatch(message, /quota/i);
});
