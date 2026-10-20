import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForDecodedFrame } from '../modules/video-frame-extractor.js';
test('paused hidden video cannot hang extraction if its decoder callback never fires',async()=>{
  let cancelled=false;
  const video={requestVideoFrameCallback:()=>42,cancelVideoFrameCallback:id=>{cancelled=id===42}};
  const start=performance.now();await waitForDecodedFrame(video,0,15);
  assert.ok(performance.now()-start<500);assert.equal(cancelled,true);
});
