import test from 'node:test';
import assert from 'node:assert/strict';
import { getOriginalPixVerseFile } from '../modules/pixverse-source.js';
test('PixVerse uses original file without depth state or reconstructed preview',()=>{
 const original=new Blob(['original'],{type:'image/jpeg'});
 const frame={contentWindow:{HappyHoloGetSourceFile:()=>original},contentDocument:{getElementById:()=>{throw new Error('reconstructed view must not be read')}}};
 assert.equal(getOriginalPixVerseFile(frame),original);
 const direct=new Blob(['direct']);assert.equal(getOriginalPixVerseFile(frame,direct),direct);
 assert.throws(()=>getOriginalPixVerseFile({}),/photo originale/);
});
