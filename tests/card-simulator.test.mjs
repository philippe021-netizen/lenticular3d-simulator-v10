import test from 'node:test';
import assert from 'node:assert/strict';
import { cardPose, viewAtAngle } from '../modules/card-simulator.js';
test('physical tilt reaches all twelve export indices, centered between views six and seven',()=>{
  assert.deepEqual(cardPose(0),{index:0,angle:-48});
  assert.equal(cardPose(5).angle,-cardPose(6).angle);
  assert.deepEqual(cardPose(11),{index:11,angle:48});
  for(let i=0;i<12;i++)assert.equal(viewAtAngle(cardPose(i).angle),i);
  assert.equal(viewAtAngle(-100),0);assert.equal(viewAtAngle(100),11);
});
