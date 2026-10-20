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
test('continuous surfaces do not expose background pinholes when expanded',()=>{
  const width=200,height=1,depth=Uint8ClampedArray.from({length:width},(_,x)=>Math.round(x*255/(width-1)));
  const source=new Uint8ClampedArray(width*4).fill(255);
  const options={parallaxPercent:8,relief:1,planeSeparation:1,continuousSurface:true,projectedFill:true};
  const result=renderNovelView(source,depth,width,height,-1,options);
  // Only the outer image border can be uncovered; the continuous interior is rasterized.
  assert.equal(result.holesBeforeFill,0);
});
test('padding of a nearby text row cannot overwrite another detected row',()=>{
  const base=new Uint8ClampedArray(10000).fill(30);
  const out=composeCardDepth(base,100,100,[{type:'text',bbox:[.2,.2,.4,.02],depth:0},{type:'text',bbox:[.2,.23,.4,.02],depth:50}]);
  assert.equal(out[20*100+30],128);assert.equal(out[21*100+30],128);
  assert.equal(out[23*100+30],168);assert.equal(out[24*100+30],168);
});
