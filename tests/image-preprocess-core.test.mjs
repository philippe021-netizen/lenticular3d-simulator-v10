import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedBusinessCardRatio,orderQuad,polygonArea,projectUnitPoint,quadMetrics,unitSquareToQuad} from '../microplayer-image-preprocess-v1.js';

test('orderQuad returns TL, TR, BR, BL from shuffled corners',()=>{
  const ordered=orderQuad([{x:900,y:610},{x:100,y:120},{x:120,y:640},{x:880,y:90}]);
  assert.deepEqual(ordered,[{x:100,y:120},{x:880,y:90},{x:900,y:610},{x:120,y:640}]);
});

test('polygonArea measures the selected document rather than the full photo',()=>{
  const area=polygonArea([{x:250,y:180},{x:820,y:120},{x:880,y:500},{x:210,y:560}]);
  assert.ok(area>220000&&area<260000);
});

test('projective transform maps every output corner back to its exact source corner',()=>{
  const quad=[{x:210,y:150},{x:940,y:85},{x:865,y:590},{x:145,y:520}];
  const transform=unitSquareToQuad(quad);
  const projected=[projectUnitPoint(transform,0,0),projectUnitPoint(transform,1,0),projectUnitPoint(transform,1,1),projectUnitPoint(transform,0,1)];
  projected.forEach((point,index)=>{assert.ok(Math.abs(point.x-quad[index].x)<1e-7);assert.ok(Math.abs(point.y-quad[index].y)<1e-7)});
});

test('quad metrics accept a perspective business card and reject a tiny selection',()=>{
  const card=quadMetrics([{x:210,y:150},{x:940,y:85},{x:865,y:590},{x:145,y:520}],1200,800);
  assert.equal(card.valid,true);assert.ok(card.areaRatio>.3);assert.ok(card.aspect>1.2&&card.aspect<1.8);
  const tiny=quadMetrics([{x:10,y:10},{x:30,y:10},{x:30,y:20},{x:10,y:20}],1200,800);
  assert.equal(tiny.valid,false);
});

test('business card target ratio is 85 by 55',()=>{
  assert.equal(normalizedBusinessCardRatio(),85/55);
});
