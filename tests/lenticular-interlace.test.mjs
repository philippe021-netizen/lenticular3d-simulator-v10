import test from 'node:test';
import assert from 'node:assert/strict';
import {viewIndex,pixelsForMm,axisMap,copyView,encodeTiff,makePrintPage,reorderViews} from '../modules/lenticular-interlace.js';

test('calibration strips share the absolute page origin for horizontal lenses',()=>{
 const o={pitch:50.2,dpi:600,count:12,phase:.1};
 for(const origin of [1000,1700,2400,3100,3800]){
  const map=axisMap(600,{...o,origin});
  for(const y of [0,1,200,599])assert.equal(map[y],viewIndex(origin+y,o));
 }
});
test('reordering cannot move a boundary view outside the sequence',()=>{
 const source=['01','02','03'];assert.deepEqual(reorderViews(source,0,-1),source);assert.deepEqual(reorderViews(source,2,1),source);
 assert.deepEqual(reorderViews(source,1,-1),['02','01','03']);assert.deepEqual(source,['01','02','03']);
});

test('fractional pitch never accumulates rounding drift, including distant lenses',()=>{
 for(const x of [0,11,12,11952,250000]){
  const phase=((2*x+1)*251)%6000; // 50.20 / 600 = 251 / 3000, pixel centers
  assert.equal(viewIndex(x,{pitch:50.20,dpi:600,count:12}),Math.floor(phase*12/6000));
 }
 assert.equal(pixelsForMm(150,600),3543);assert.equal(pixelsForMm(100,600),2362);
});
test('phase wraps and inversion reverses the view order without changing frequency',()=>{
 for(let x=0;x<500;x++){
  const a=viewIndex(x,{pitch:50.2,dpi:600,count:12,phase:-.25});
  assert.equal(a,viewIndex(x,{pitch:50.2,dpi:600,count:12,phase:.75}));
  assert.equal(viewIndex(x,{pitch:50.2,dpi:600,count:12,phase:.75,reverse:true}),11-a);
 }
 assert.throws(()=>axisMap(100,{pitch:0,dpi:600,count:12}));
});
test('colored views are interlaced by columns or rows without interpolation',()=>{
 for(const orientation of ['vertical','horizontal']){
  const w=24,h=24,options={pitch:50,dpi:600,count:12,orientation};
  const map=axisMap(orientation==='vertical'?w:h,options),out=new Uint8Array(w*h*3);
  for(let i=0;i<12;i++){
   const rgba=new Uint8ClampedArray(w*h*4);for(let p=0;p<w*h;p++)rgba.set([i,100+i,200+i,255],p*4);
   copyView(out,rgba,w,h,i,map,orientation);
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)assert.deepEqual([...out.subarray((y*w+x)*3,(y*w+x)*3+3)],[map[orientation==='vertical'?x:y],100+map[orientation==='vertical'?x:y],200+map[orientation==='vertical'?x:y]]);
 }
});
test('TIFF has real RGB pixels, exact strip size and 600 ppi tags',async()=>{
 const rgb=new Uint8Array([255,0,0,0,255,0]);
 const bytes=new Uint8Array(await encodeTiff({width:2,height:1,dpi:600,row:y=>rgb}).arrayBuffer());
 const d=new DataView(bytes.buffer);assert.equal(d.getUint16(2,true),42);
 const ifd=d.getUint32(4,true),n=d.getUint16(ifd,true),tags=new Map();
 for(let i=0;i<n;i++){const p=ifd+2+12*i;tags.set(d.getUint16(p,true),d.getUint32(p+8,true));}
 assert.equal(tags.get(262),2);assert.equal(tags.get(277),3);assert.equal(tags.get(259),1);
 assert.equal(tags.get(279),6);assert.deepEqual([...bytes.subarray(tags.get(273),tags.get(273)+6)],[...rgb]);
 assert.equal(d.getUint32(tags.get(282),true),600);assert.equal(d.getUint32(tags.get(282)+4,true),1);
});
test('A4 placement does not rescale the interlaced image and keeps marks outside it',()=>{
 const rgb=new Uint8Array(12*8*3).fill(37),page=makePrintPage(rgb,12,8,{dpi:10,marks:true});
 assert.equal(page.width,83);assert.equal(page.height,117);
 const row=page.row(page.top);assert.deepEqual([...row.subarray(page.left*3,(page.left+12)*3)],new Array(36).fill(37));
 assert.throws(()=>makePrintPage(new Uint8Array(3),1000,1000,{dpi:10}));
});
