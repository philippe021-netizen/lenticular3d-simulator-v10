import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSelectionBbox,selectionFromPoints,moveSelectionBbox,resizeSelectionBbox,fillSelectionWithBackground} from '../modules/card-selection-utils.js';

test('touch and Pencil drag creates a normalized bbox regardless of drag direction',()=>{
 const box=selectionFromPoints({x:.8,y:.75},{x:.2,y:.25});
 assert.ok(Math.abs(box[0]-.2)<1e-9);
 assert.ok(Math.abs(box[1]-.25)<1e-9);
 assert.ok(Math.abs(box[2]-.6)<1e-9);
 assert.ok(Math.abs(box[3]-.5)<1e-9);
});
test('move, resize and numerical editor remain inside the image',()=>{
 assert.deepEqual(moveSelectionBbox([.8,.8,.15,.15],.5,.5),[.85,.85,.15,.15]);
 assert.deepEqual(resizeSelectionBbox([.2,.2,.3,.3],1,1),[.2,.2,.8,.8]);
 const r=normalizeSelectionBbox([-.9,.9,-1,5]);
 assert.ok(r.every(v=>v>=0&&v<=1));
});
test('removing image region replaces its pixels without altering original input',()=>{
 const w=12,h=8,pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<pixels.length;i+=4){pixels[i]=pixels[i+1]=pixels[i+2]=225;pixels[i+3]=255}
 for(let y=2;y<6;y++)for(let x=3;x<9;x++)pixels[(y*w+x)*4]=0;
 const processed=fillSelectionWithBackground(pixels,w,h,[.25,.25,.5,.5]);
 assert.equal(pixels[(3*w+5)*4],0);
 assert.equal(processed[(3*w+5)*4],225);
 assert.equal(processed[0],225);
 assert.equal(processed.length,pixels.length);
});
