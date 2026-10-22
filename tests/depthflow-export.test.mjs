import test from 'node:test';
import assert from 'node:assert/strict';
import {packageDepthflowViews} from '../modules/depthflow-export.js';
class Zip {entries=new Map();file(name,value){this.entries.set(name,value);}async generateAsync(){return this.entries;}}
test('export contains twelve ordered original PNG blobs and reconstruction settings',async()=>{
 const blobs=Array.from({length:12},(_,i)=>new Blob([String(i)],{type:'image/png'}));
 const result=await packageDepthflowViews(blobs,Zip,{zero:128,parallaxPercent:5});
 assert.equal(result.size,13);for(let i=0;i<12;i++)assert.equal(result.get(`vue-${String(i+1).padStart(2,'0')}.png`),blobs[i]);
 const info=JSON.parse(result.get('manifest.json'));assert.equal(info.views,12);assert.equal(info.settings.zero,128);assert.equal(info.interlaced,false);
});
test('incomplete sequence or invalid PNG is never exported as a complete series',async()=>{
 await assert.rejects(packageDepthflowViews([],Zip),/12/);
 await assert.rejects(packageDepthflowViews(new Array(12).fill(new Blob(['x'],{type:'image/jpeg'})),Zip),/PNG/);
});
