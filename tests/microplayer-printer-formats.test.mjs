import assert from 'node:assert/strict';
import test from 'node:test';
import { FORMAT_PRESETS, assessMediaDimensions, evaluatePrintSetup } from '../modules/microplayer-print-planner.js';

const check=(printerId,widthMm,heightMm,feedSource='auto',mediaThicknessMm=null)=>
  assessMediaDimensions({printerId,widthMm,heightMm,feedSource,mediaThicknessMm});

test('Canon accepts 10x15, A4, A3+ and long panoramic custom on top feed',()=>{
  for(const [w,h] of [[100,150],[150,100],[210,297],[329,483],[210,594],[329,990.6]]){
    const result=check('canon-pro-200s',w,h);
    assert.equal(result.compatible,true,w+'x'+h+' should be supported');
    assert.equal(result.feedSource,'top');
  }
  assert.equal(check('canon-pro-200s',330.2,990.6).feedSource,'manual');
  assert.equal(check('canon-pro-200s',331,990.6).compatible,false);
  assert.equal(check('canon-pro-200s',329,991).compatible,false);
});

test('Canon must use upper feed for 10x15, while A4 can use manual feed',()=>{
 assert.equal(check('canon-pro-200s',100,150,'manual').compatible,false);
 assert.equal(check('canon-pro-200s',100,150,'top').compatible,true);
 assert.equal(check('canon-pro-200s',210,297,'manual').compatible,true);
});

test('Canon selected paper thickness switches source without overpromising loading',()=>{
 assert.equal(check('canon-pro-200s',210,297,'auto',0.26).feedSource,'top');
 assert.equal(check('canon-pro-200s',210,297,'auto',0.5).feedSource,'manual');
 assert.equal(check('canon-pro-200s',100,150,'auto',0.5).compatible,false);
 assert.equal(check('canon-pro-200s',210,297,'manual',0.61).compatible,false);
});

test('Roland distinguishes 508x330 printed image from 538x360 support',()=>{
 assert.equal(check('roland-lef-20',508,330).compatible,true);
 assert.equal(check('roland-lef-20',330,508).compatible,true);
 assert.equal(check('roland-lef-20',538,360).compatible,false);
 assert.deepEqual(check('roland-lef-20',508,330).maxMaterial,
 {widthMm:538,heightMm:360,description:'dimensions maximales du support (objet), pas de l’image'});
 assert.equal(check('roland-lef-20',329,483).compatible,true);
 assert.equal(check('roland-lef-20',210,594).compatible,false);
});

test('HP accepts 10x15, A4 and custom legal but not A3+',()=>{
 assert.equal(check('hp-officejet-pro-8720',100,150).compatible,true);
 assert.equal(check('hp-officejet-pro-8720',210,297).compatible,true);
 assert.equal(check('hp-officejet-pro-8720',215.9,355.6).compatible,true);
 assert.equal(check('hp-officejet-pro-8720',329,483).compatible,false);
 assert.equal(check('hp-officejet-pro-8720',75,120).compatible,false);
});

test('known format presets cover postcards, A4, A3, A3+ and panorama',()=>{
 const names=FORMAT_PRESETS.map(p=>p.id);
 for(const id of ['postcard-landscape','postcard-portrait','a4-portrait','a4-landscape','a3-portrait','a3plus-portrait','panorama-210x594','custom'])
  assert.ok(names.includes(id),id);
});

test('invalid manual feed and nonsensical thickness are not silently allowed',()=>{
 assert.throws(()=>check('hp-officejet-pro-8720',150,100,'manual'),/Source papier/);
 assert.throws(()=>check('canon-pro-200s',150,100,'auto',-0.1),/Épaisseur/);
 assert.throws(()=>check('canon-pro-200s',150,100,'auto',Infinity),/Épaisseur/);
});

test('planner accurately propagates physical format compatibility and preserves legacy restriction',()=>{
 const a4=evaluatePrintSetup({printerId:'canon-pro-200s',widthMm:210,heightMm:297});
 assert.equal(a4.paperFits,true);
 assert.equal(a4.media.feedSource,'top');
 assert.equal(a4.existingEngineSupportsNineViews,false);
 const tooBig=evaluatePrintSetup({printerId:'canon-pro-200s',widthMm:340,heightMm:300});
 assert.equal(tooBig.paperFits,false);
 assert.ok(tooBig.warnings.some(s=>s.includes('FORMAT / ALIMENTATION')));
 const postcard=evaluatePrintSetup({printerId:'canon-pro-200s',widthMm:150,heightMm:100});
 assert.equal(postcard.existingEngineSupportsNineViews,true);
});
