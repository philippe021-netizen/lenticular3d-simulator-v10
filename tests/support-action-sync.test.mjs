import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const window={};vm.runInNewContext(fs.readFileSync(new URL('../support-action-sync.js',import.meta.url),'utf8'),{window});
test('keychain renders the same selected action and phase without depending on old sublayer cache',()=>{
 const canvas={},state={view:{width:1024,height:684},subjectImg:{},backgroundImg:{}};
 for(const action of ['yaw3d','pivot','dual-axis','parallax','parallax-pivot','glint','headlight','explodeview']){
  let call=null;const used=window.HappyHoloSupportActionSync.render({state,plan:[{action}],canvas,norm:.75,renderActionFrame:(phase,target)=>call={phase,target}});
  assert.equal(used,true);assert.equal(call.phase,.75);assert.equal(call.target,canvas);assert.equal(canvas.width,640);
 }
 assert.equal(window.HappyHoloSupportActionSync.render({state,plan:[{action:'none'}],canvas,renderActionFrame:()=>assert.fail()}),false);
});
