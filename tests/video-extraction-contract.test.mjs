import test from 'node:test';
import assert from 'node:assert/strict';
import { completeExtraction, requireExportableFrames } from '../modules/video-extraction-contract.js';
test('short video result retains real dimensions, PNG blobs and quality diagnostics',async()=>{
  const frames=Array.from({length:9},(_,i)=>({index:i+1,time:i/4,width:32,height:24,blob:new Blob([String(i)],{type:'image/png'}),fingerprint:String(i)}));
  const result=await completeExtraction({width:32,height:24,frames,qualityGate:{passed:true},distinctFingerprints:9});
  assert.equal(result.frames[0].blob.type,'image/png');assert.equal(result.width,32);
  assert.equal(result.dataUrls.length,9);assert.equal(new Set(result.dataUrls).size,9);
  assert.doesNotThrow(()=>requireExportableFrames(result));
});
test('missing analysis is not diagnosed as a confirmed return to initial pose',()=>{
  assert.throws(()=>requireExportableFrames({frames:new Array(9)}),/incomplet/i);
  assert.throws(()=>requireExportableFrames({frames:new Array(9),qualityGate:{passed:false,reason:'return-detected'}}),/retour brutal/i);
});
