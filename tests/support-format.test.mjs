import test from 'node:test';import assert from 'node:assert/strict';
import { supportSpec } from '../modules/pixverse-zip-bridge.js';
test('15x10 landscape support has exact 3:2 dimensions and physical size',()=>{
 const s=supportSpec({getElementById:()=>({value:'photo-card-15x10'})});
 assert.equal(s.width/s.height,1.5);assert.equal(s.widthMm,150);assert.equal(s.heightMm,100);
 assert.equal(s.id,'photo-card-15x10');
});
