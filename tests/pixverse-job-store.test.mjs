import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixVerseJobStore } from '../modules/pixverse-job-store.js';

function memoryAdapter(memory = new Map()) {
  return {
    get: async key => memory.get(key) ?? null,
    set: async (key, value) => { memory.set(key, structuredClone(value)); }
  };
}

test('loads one active video id for polling resume', async () => {
  const store = createPixVerseJobStore(memoryAdapter());
  await store.save({ videoId: 77, actionId: 'heart_hands', status: 'processing', createdAt: 1 });
  assert.equal((await store.loadActive()).videoId, 77);
});

test('does not return a completed job as active', async () => {
  const store = createPixVerseJobStore(memoryAdapter());
  await store.save({ videoId: 77, status: 'processing' });
  await store.complete({ videoId: 77, videoUrl: '/video.mp4' });
  assert.equal(await store.loadActive(), null);
});

test('reuses a guide media id by sha256', async () => {
  const store = createPixVerseJobStore(memoryAdapter());
  await store.putGuideMediaId('abc', 88);
  assert.equal(await store.getGuideMediaId('abc'), 88);
});
