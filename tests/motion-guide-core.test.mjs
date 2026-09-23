import assert from 'node:assert/strict';
import { validateActionPreset, validateActionCatalog } from '../modules/action-schema.js';
import { computeSafeFraming, framingRisk } from '../modules/safe-framing.js';
import { analyzeMotionProgress, selectNineProgressiveIndices } from '../modules/motion-analyzer.js';
import { buildStabilizationPlan, stabilizationSeverity } from '../modules/microplayer-stabilizer.js';
import { evaluateGenerationQC } from '../modules/generation-qc.js';
import { savePixVerseJob, loadPixVerseJob, clearPixVerseJob } from '../modules/pixverse-job-store.js';
import { estimateMimicCredits } from '../modules/pixverse-motion-guide.js';

{
  const r = validateActionPreset({
    id:'coeur_mains_v2', label:'Cœur', target:'person', preferredMode:'mimic', prompt:'x',
    mobileZones:['mains'], lockedZones:['visage']
  });
  assert.equal(r.ok, true);
}

{
  const r = validateActionCatalog({ version:11, actions:[
    {id:'salut_main_v1', label:'Salut', prompt:'x', mobileZones:['main'], lockedZones:['visage']}
  ]});
  assert.equal(r.ok, true);
  assert.equal(r.version, 11);
}

{
  const p = computeSafeFraming({x:0.02,y:0.04,w:0.92,h:0.9},{margin:0.08});
  assert.ok(p.scale < 1);
  assert.equal(framingRisk({x:0.001,y:0.05,w:0.8,h:0.8}), 'critical');
}

{
  const good = analyzeMotionProgress([0,.01,.03,.05,.07,.09,.10,.105,.106]);
  assert.equal(good.returnDetected, false);
  assert.ok(good.monotonicity > .9);
  const bad = analyzeMotionProgress([0,.02,.05,.08,.10,.01,.09]);
  assert.equal(bad.returnDetected, true);
  const idx = selectNineProgressiveIndices([0,.01,.02,.04,.06,.07,.09,.1,.11,.12],9);
  assert.equal(idx.length, 9);
  assert.ok(idx.every((v,i)=>i===0 || v>=idx[i-1]));
}

{
  const plan = buildStabilizationPlan([
    {cx:.50,cy:.50,scale:1,rotationDeg:0},
    {cx:.52,cy:.49,scale:1.02,rotationDeg:.4},
    {cx:.49,cy:.51,scale:.99,rotationDeg:-.3}
  ]);
  assert.equal(plan.length,3);
  assert.notEqual(stabilizationSeverity(plan),'none');
}

{
  const ok = evaluateGenerationQC({identityDrift:.02,backgroundDrift:.01,framingLoss:0,motionMonotonicity:.95});
  assert.equal(ok.status,'pass');
  const fail = evaluateGenerationQC({returnDetected:true});
  assert.equal(fail.status,'fail');
}

{
  const map = new Map();
  const storage = {setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)??null,removeItem:k=>map.delete(k)};
  assert.equal(savePixVerseJob({videoId:123,state:'processing'},storage),true);
  assert.equal(loadPixVerseJob(null,storage).videoId,123);
  assert.equal(clearPixVerseJob('123',storage),true);
}

assert.equal(estimateMimicCredits({quality:'540p',duration:3}),30);
assert.equal(estimateMimicCredits({quality:'1080p',duration:3}),null);

console.log('motion-guide core tests: ok');
