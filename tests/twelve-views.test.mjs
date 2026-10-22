import test from 'node:test';
import assert from 'node:assert/strict';
import {cardPose, viewAtAngle} from '../modules/card-simulator.js';
import {planProgressiveFrameTimes} from '../modules/video-frame-extractor.js';

test('twelve physical views span the same amplitude without clipping the last three',()=>{
  assert.equal(cardPose(0).angle,-48);
  assert.equal(cardPose(11).angle,48);
  for(let i=0;i<12;i++) assert.equal(viewAtAngle(cardPose(i).angle),i);
  assert.equal((cardPose(5).angle+cardPose(6).angle)/2,0);
});
test('default extraction plans twelve distinct times and preserves source endpoints',()=>{
  const samples=[{time:0},{time:1}];
  const times=planProgressiveFrameTimes(samples,0,1);
  assert.equal(times.length,12);
  assert.equal(new Set(times).size,12);
  assert.equal(times[0],0);assert.equal(times.at(-1),1);
  assert.equal(planProgressiveFrameTimes(samples,0,1,9).length,9);
});
