import test from 'node:test';
import assert from 'node:assert/strict';
import { composeCardDepth } from '../modules/card-depth.js';
import { renderNovelView } from '../depthflow-v42-core.js';

test('photo depth survives overlapping detections without rectangular image copies', () => {
  const depth = Uint8ClampedArray.from([40,60,180,220,40,60,180,220]);
  const out = composeCardDepth(depth,4,2,[{type:'subject',bbox:[0,0,1,1],depth:0}]);
  assert.deepEqual(out,depth);
  const adjusted = composeCardDepth(depth,4,2,[{type:'object',bbox:[0,0,1,1],depth:20}]);
  assert.ok(adjusted[3]>adjusted[0]+100,'preserve distance within each subject');
});
test('text stays on one plane and the central view is exactly the original', () => {
  const depth=Uint8ClampedArray.from([20,80,180,230]);
  const out=composeCardDepth(depth,4,1,[{type:'text',bbox:[0,0,1,1],depth:0}]);
  assert.deepEqual([...out],[128,128,128,128]);
  const overlap=composeCardDepth(depth,4,1,[{type:'text',bbox:[0,0,1,1],depth:0},{type:'object',bbox:[.5,0,.5,1],depth:30}]);
  assert.deepEqual([...overlap],[128,128,128,128],'text wins over nested detections');
  const source=Uint8ClampedArray.from({length:16},(_,i)=>i);
  assert.deepEqual(renderNovelView(source,out,4,1,0).data,source);
});
