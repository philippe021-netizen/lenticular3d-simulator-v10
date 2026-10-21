import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionFocusAssets } from '../modules/card-selection-focus.js';

test('sphere focus is filled, outlined and excludes rectangle corners',()=>{
  const width=64,height=64,alpha=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if((x-32)**2+(y-32)**2<20**2)alpha[y*width+x]=255;
  }
  const selected=createSelectionFocusAssets({width,height,alpha,mode:'object'});
  assert.equal(selected.cutout[(32*width+32)*4+3],255);
  assert.ok(selected.visible[(32*width+32)*4+3]>0);
  assert.equal(selected.cutout[(8*width+8)*4+3],0);
  assert.equal(selected.visible[(8*width+8)*4+3],0);
  assert.equal(selected.visible[(32*width+51)*4+3],252);
});

test('word focus highlights glyphs individually, leaving gaps untouched',()=>{
  const width=18,height=12,alpha=new Uint8Array(width*height);
  for(let y=2;y<10;y++)for(const x of [3,4,13,14])alpha[y*width+x]=255;
  const focus=createSelectionFocusAssets({width,height,alpha,mode:'text'});
  assert.equal(focus.cutout[(5*width+3)*4+3],255);
  assert.equal(focus.cutout[(5*width+13)*4+3],255);
  assert.equal(focus.cutout[(5*width+8)*4+3],0);
  assert.equal(focus.visible[(5*width+8)*4+3],0);
});

test('focus creation cannot mutate the source mask',()=>{
  const alpha=new Uint8Array([0,255,0,255,255,255,0,255,0]);
  createSelectionFocusAssets({width:3,height:3,alpha,mode:'text'});
  assert.deepEqual([...alpha],[0,255,0,255,255,255,0,255,0]);
});

test('focus refuses malformed masks',()=>{
  assert.throws(()=>createSelectionFocusAssets({width:3,height:3,alpha:new Uint8Array(4)}),/invalide/);
});
