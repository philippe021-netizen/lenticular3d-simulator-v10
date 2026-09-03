import assert from 'node:assert/strict';
import {
  assessProgressiveFrames,
  planProgressiveFrameTimes,
  selectFirstProgressivePass
} from '../modules/video-frame-extractor.js';

function samples(progress) {
  return progress.map((fromStart, index) => ({
    time: index * 0.24,
    fromStart,
    stepMotion: index ? Math.abs(fromStart - progress[index - 1]) : 0
  }));
}

// Regression from PixVerse video 422574207593356: first kiss, exact reset,
// then a second kiss. The old global-maximum logic selected the second pass.
{
  const timeline = samples([0, 0.0198, 0.0356, 0.0524, 0.0655, 0, 0.0855, 0.0911, 0.0967]);
  const selected = selectFirstProgressivePass(timeline, {
    start: timeline[0].time,
    end: timeline.at(-1).time,
    medianMotion: 0.0198,
    threshold: 0.024
  });
  assert.equal(selected.returnDetected, true);
  assert.equal(selected.returnIndex, 5);
  assert.ok(selected.peakIndex <= 4, 'the second PixVerse pass must never be selected');
  assert.ok(selected.actionStartIndex <= 1, 'the source pose must be retained');

  const times = planProgressiveFrameTimes(timeline, selected.actionStartIndex, selected.actionEndIndex, 9);
  assert.equal(times.length, 9);
  assert.ok(times.every((time, index) => index === 0 || time >= times[index - 1]));
  assert.ok(times.at(-1) < timeline[5].time, 'all planned views must precede the reset');
}

// A normal one-way action must retain its full first and only pass.
{
  const timeline = samples([0, 0.004, 0.012, 0.025, 0.041, 0.058, 0.071, 0.075, 0.0755]);
  const selected = selectFirstProgressivePass(timeline, {
    start: timeline[0].time,
    end: timeline.at(-1).time,
    medianMotion: 0.008,
    threshold: 0.012
  });
  assert.equal(selected.returnDetected, false);
  assert.ok(selected.actionEndIndex >= 6);
}

// Similar neighboring frames are common in subtle lenticular motion. They
// produce a warning but must not block export.
{
  const signatures = [0, 10, 20, 30, 40, 50, 60, 70, 70].map(value => new Float32Array([value]));
  const frames = signatures.map((signature, index) => ({
    signature,
    fingerprint: index === 8 ? 'frame-7' : `frame-${index}`
  }));
  const quality = assessProgressiveFrames(frames);
  assert.equal(quality.passed, true);
  assert.equal(quality.warning, 'similar-frames');
  assert.equal(quality.returnDetected, false);
}

// A true hard reset remains the only content-quality blocker.
{
  const signatures = [0, 20, 35, 52, 66, 4, 85, 91, 97].map(value => new Float32Array([value]));
  const frames = signatures.map((signature, index) => ({
    signature,
    fingerprint: `frame-${index}`
  }));
  const quality = assessProgressiveFrames(frames);
  assert.equal(quality.passed, false);
  assert.equal(quality.reason, 'return-detected');
  assert.equal(quality.returnDetected, true);
}

// An extremely subtle action is left to visual judgment rather than refused.
{
  const signatures = [0, .05, .1, .15, .2, .25, .3, .35, .4].map(value => new Float32Array([value]));
  const frames = signatures.map((signature, index) => ({ signature, fingerprint: `subtle-${index}` }));
  const quality = assessProgressiveFrames(frames);
  assert.equal(quality.passed, true);
  assert.equal(quality.warning, 'subtle-motion');
}

console.log('video-frame-extractor progressive tests: ok');
