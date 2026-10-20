import test from 'node:test';
import assert from 'node:assert/strict';
import { cardPose, viewAtAngle } from '../modules/card-simulator.js';
test('physical tilt uses the same nine export indices, with a neutral center',()=>{
  assert.deepEqual(cardPose(0),{index:0,angle:-12});
  assert.deepEqual(cardPose(4),{index:4,angle:0});
  assert.deepEqual(cardPose(8),{index:8,angle:12});
  for(let i=0;i<9;i++)assert.equal(viewAtAngle(cardPose(i).angle),i);
  assert.equal(viewAtAngle(-100),0);assert.equal(viewAtAngle(100),8);
});
