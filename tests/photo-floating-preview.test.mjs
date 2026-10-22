import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const photo=readFileSync(new URL('../relief3d-test-v31.html',import.meta.url),'utf8');
const hub=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const moduleSource=readFileSync(new URL('../modules/photo-floating-preview.js',import.meta.url),'utf8');
const sharedSource=readFileSync(new URL('../modules/card-floating-planes-preview.js',import.meta.url),'utf8');

test('MicroPlayer first tab loads the photo simulator without redirecting the product tabs',()=>{
 assert.match(hub,/id:'photo'.*relief3d-test-v31\.html\?embed=1&v=12views/);
 assert.match(hub,/id:'card'.*happyholo-business-card-studio/);
});

test('all simulator controls and optional module are present in Photo & relief',()=>{
 for(const id of ['photo3dPreview','photo3dStage','photo3dCanvas2D','photo3dCanvas3D',
 'photo3dAngle','photo3dStrength','photo3dPlay','photo3dRefresh','photo3dStatus','photo3dJump']){
   assert.ok(photo.includes('id="'+id+'"'),id+' missing');
 }
 assert.ok(photo.includes('modules/photo-floating-preview.js?v=12views'));
 assert.match(photo,/canvas\[hidden\].*display:none!important/);
});

test('new simulation keeps source and nine-view export isolated',()=>{
 assert.match(moduleSource,/backgroundPixels:bgPixels/);
 assert.match(moduleSource,/mask:\{alpha,width:w,height:h/);
 assert.match(moduleSource,/28000/);
 assert.match(moduleSource,/scene\.render\(degree,power,activeLayers\)/);
 assert.doesNotMatch(moduleSource,/downloadBtn|renderAt\s*=|exported\s*=/);
 assert.match(sharedSource,/options\.backgroundPixels/);
 assert.match(sharedSource,/uniform float planeAspect/);
});

test('Photo simulator has parseable source and guards unavailable scenes',()=>{
 assert.doesNotThrow(()=>new Function(moduleSource.replace(/^import .*?;$/gm,'')));
 assert.match(moduleSource,/if\(!state\?\.sourceImg\|\|!state\?\.subjectImg\|\|!state\?\.backgroundImg\)/);
 assert.match(moduleSource,/function stop\(\)/);
});
