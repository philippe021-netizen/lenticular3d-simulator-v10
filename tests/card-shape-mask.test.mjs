import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentCardSelection,maskAlphaAt,paintMaskAt,paintMaskStroke,eraseCardSelectionByMask} from '../modules/card-shape-mask.js';

function image(width,height){
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<pixels.length;i+=4)pixels.set([250,250,250,255],i);
  return pixels;
}
test('sphere is segmented by silhouette, not rectangular background',()=>{
  const width=120,height=90,p=image(width,height),bbox=[.25,.15,.5,.7];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if((x-60)**2+(y-45)**2<22**2){
      const i=(y*width+x)*4;p[i]=120;p[i+1]=70;p[i+2]=220;
    }
  }
  const mask=segmentCardSelection(p,width,height,bbox,'object');
  assert.equal(maskAlphaAt(mask,bbox,60,45,width,height),255);
  assert.equal(maskAlphaAt(mask,bbox,33,17,width,height),0);
  assert.ok(mask.coverage>.25&&mask.coverage<.6);
  const filled=eraseCardSelectionByMask(p,width,height,bbox,mask,image(width,height));
  assert.equal(filled[(45*width+60)*4],250);
  assert.equal(p[(45*width+60)*4],120,'source image is immutable');
});
test('text mode retains disconnected letters',()=>{
  const w=100,h=50,p=image(w,h),bbox=[.1,.1,.8,.8];
  for(const left of [30,54])for(let y=15;y<35;y++)for(let x=left;x<left+8;x++){
    const i=(y*w+x)*4;p[i]=p[i+1]=p[i+2]=10;
  }
  const mask=segmentCardSelection(p,w,h,bbox,'text');
  assert.equal(maskAlphaAt(mask,bbox,33,20,w,h),255);
  assert.equal(maskAlphaAt(mask,bbox,57,20,w,h),255);
  assert.equal(maskAlphaAt(mask,bbox,45,20,w,h),0);
});
test('mask can be corrected by Pencil add/remove without mutation',()=>{
  const original={width:20,height:20,alpha:new Uint8Array(400).fill(255),mode:'object'};
  const removed=paintMaskAt(original,.5,.5,3,'erase');
  assert.equal(removed.alpha[10*20+10],0);
  assert.equal(original.alpha[10*20+10],255);
  const restored=paintMaskAt(removed,.5,.5,3,'add');
  assert.equal(restored.alpha[10*20+10],255);
});
test('low-information region requests manual correction instead of an invented silhouette',()=>{
  const p=image(80,60);
  assert.throws(()=>segmentCardSelection(p,80,60,[.1,.1,.7,.7],'object'),/Détourage incertain/);
});

test('fast Pencil stroke stays continuous without modifying original mask',()=>{
 const original={width:150,height:80,alpha:new Uint8Array(12000),coverage:0,mode:'object'};
 const painted=paintMaskStroke(original,{u:.1,v:.5},{u:.9,v:.5},4,'add');
 for(let x=15;x<135;x++)assert.equal(painted.alpha[40*150+x],255,'missing painted pixel '+x);
 assert.equal(original.alpha[40*150+60],0,'source mask mutated');
});
test('out-of-bounds brush cannot accidentally paint selection edges',()=>{
 const original={width:20,height:20,alpha:new Uint8Array(400),coverage:0};
 const edited=paintMaskAt(original,-1,2,12,'add');
 assert.equal(edited,original);
});
