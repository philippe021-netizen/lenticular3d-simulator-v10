import test from 'node:test';
import assert from 'node:assert/strict';
import { polygonMaskFromPoints } from '../modules/card-polygon-mask.js';
import { maskAlphaAt } from '../modules/card-shape-mask.js';

test('freehand polygon mask follows a non-rectangular Pencil contour',()=>{
 const points=[{x:.25,y:.1},{x:.8,y:.25},{x:.65,y:.75},{x:.35,y:.9},{x:.18,y:.5}];
 const {bbox,mask}=polygonMaskFromPoints(points,200,160);
 assert.ok(bbox[2]<.7&&bbox[3]<.9);
 assert.equal(maskAlphaAt(mask,bbox,100,70,200,160),255,'inside polygon stays selected');
 assert.equal(maskAlphaAt(mask,bbox,45,30,200,160),0,'outside the traced silhouette stays excluded');
 assert.ok(mask.coverage>0&&mask.coverage<1);
});

test('polygon mask rejects incomplete or degenerate contours',()=>{
 assert.throws(()=>polygonMaskFromPoints([{x:.1,y:.1},{x:.2,y:.2}],100,100),/au moins trois points/);
 assert.throws(()=>polygonMaskFromPoints([{x:.1,y:.1},{x:.2,y:.2},{x:.3,y:.3}],100,100),/contour est trop petit/);
});
