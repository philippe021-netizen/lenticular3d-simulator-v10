import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMotionProgress, selectNineProgressStates } from '../modules/motion-progress-analyzer.js';

const makeSeries = values => values.map((value, index) => ({ time: index * 0.15, value, fromStart: value }));

test('selects visual states after idle time instead of uniform timestamps', () => {
  const samples = makeSeries([0,0,0,0,1,2,4,7,11,16,22,29,37,46,56,67,79,92]);
  const analysis = analyzeMotionProgress(samples, { count: 9 });
  const selected = selectNineProgressStates(analysis, { count: 9 });
  assert.equal(selected.length, 9);
  assert.ok(selected[1].time >= samples[4].time);
  assert.ok(selected.every((item, index) => index === 0 || item.time > selected[index - 1].time));
  assert.ok(selected.every((item, index) => index === 0 || item.progress >= selected[index - 1].progress));
});

test('flags and excludes a B-to-A return', () => {
  const samples = makeSeries([0,2,5,9,14,20,14,9,4]);
  const analysis = analyzeMotionProgress(samples, { count: 9 });
  const selected = selectNineProgressStates(analysis, { count: 9 });
  assert.ok(analysis.reversalRatio > 0.12);
  assert.ok(selected.at(-1).time < samples[6].time);
});

test('returns nine distinct states for a short two-second action', () => {
  const samples = makeSeries([0,0,1,3,6,10,15,21,28,36,45,55,66,78,91]);
  const selected = selectNineProgressStates(analyzeMotionProgress(samples), { count: 9 });
  assert.equal(new Set(selected.map(item => item.sampleIndex)).size, 9);
});

test('reports the largest adjacent visual jump for QC', () => {
  const samples = Array.from({ length: 10 }, (_, index) => ({
    time: index * .2,
    value: index < 6 ? index * .01 : .45 + (index - 6) * .01
  }));
  const analysis = analyzeMotionProgress(samples);
  assert.equal(analysis.maxAdjacentJump, .4);
});
