/* HappyHolo V3.35.8 — actions + résultat lasso, nettoyage strict des anciennes sélections */
(()=>{
'use strict';
const MAGIC_SOURCE='magic-selection-v3356';
function cleanPlan(){
  const p=Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:null;
  if(!p?.length)return 0;
  const base=p[0];
  const magic=p.slice(1).filter(s=>s?.source===MAGIC_SOURCE).slice(0,9);
  p.splice(0,p.length,base,...magic);
  magic.forEach((s,i)=>{s.action='explodeview';s.explodeOrder=i+1;s.explodeDirection='auto';s.explodeMode=window.HappyHoloExplodeViewState?.mode||'detailed';if(!Number.isFinite(Number(s.intensity)))s.intensity=65;});
  window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:p.length,source:'magic-v3358-clean'}}));
  window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
  return magic.length;
}
function patch(){
  const overlays=[...document.querySelectorAll('div')].filter(el=>el.style?.zIndex==='10000220'||el.style?.zIndex===10000220);
  const overlay=overlays[overlays.length-1];if(!overlay||overlay.dataset.magicResultPatched==='1')return;
  const title=[...overlay.querySelectorAll('b')].find(b=>(b.textContent||'').includes('Sélection magique'));
  if(!title)return;
  overlay.dataset.magicResultPatched='1';title.textContent='✨ Sélection magique V3.35.8';
  const buttons=[...overlay.querySelectorAll('button')];
  const validate=buttons.find(b=>(b.textContent||'').includes('Valider la pièce'));
  const redo=buttons.find(b=>(b.textContent||'').includes('Refaire'));
  const finish=buttons.find(b=>(b.textContent||'').includes('Terminer'));
  const stage=[...overlay.querySelectorAll('div')].find(d=>d.style?.touchAction==='none');if(!validate||!stage)return;
  const [mask,guide]=[...stage.querySelectorAll('canvas')];
  const controls=document.createElement('div');controls.id='magicResultControls';controls.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px;padding:8px 10px;background:#0c1a24;border:1px solid #31576d;border-radius:10px';
  controls.innerHTML='<b style="font-size:13px">Action</b><span style="background:#e83df0;color:#fff;padding:6px 9px;border-radius:8px;font-weight:900;font-size:12px">💥 ExplodeView</span><label style="font-size:12px">Intensité <input id="magicIntensity" type="range" min="30" max="100" value="65" style="width:120px;vertical-align:middle"></label><span id="magicOrder" style="font-size:12px;color:#cfe7f5">Ordre : —</span>';
  const next=document.createElement('button');next.textContent='＋ Pièce suivante';const preview=document.createElement('button');preview.textContent='▶ Voir le résultat';preview.disabled=true;
  for(const b of [next,preview])b.style.cssText='border:0;border-radius:9px;padding:9px 12px;font-weight:900';controls.append(next,preview);
  const status=[...overlay.querySelectorAll('div')].find(d=>d.style?.background==='#142531'||d.style?.backgroundColor==='rgb(20, 37, 49)');validate.parentElement?.insertAdjacentElement('afterend',controls);
  let savedCount=cleanPlan(),lastSaved=null;preview.disabled=savedCount<2;controls.querySelector('#magicOrder').textContent=savedCount?`Prochain ordre : ${savedCount+1}`:'Ordre : —';
  const originalValidate=validate.onclick;validate.onclick=null;
  validate.addEventListener('click',()=>{
    cleanPlan();const p=window.happyHoloSelectionPlan||[];const before=p.length;
    if(before-1>=9){if(status)status.textContent='Maximum 9 pièces pour ce mode. Supprime ou remplace une pièce avant de continuer.';return;}
    originalValidate?.call(validate);
    setTimeout(()=>{
      cleanPlan();const list=window.happyHoloSelectionPlan||[];
      if(list.length>before){lastSaved=list[list.length-1];savedCount=list.length-1;lastSaved.intensity=Number(controls.querySelector('#magicIntensity')?.value||65);lastSaved.action='explodeview';lastSaved.explodeOrder=savedCount;lastSaved.explodeDirection='auto';lastSaved.explodeMode=window.HappyHoloExplodeViewState?.mode||'detailed';controls.querySelector('#magicOrder').textContent=`Ordre : ${savedCount}`;preview.disabled=savedCount<2;
        if(lastSaved?.mask&&mask){try{mask.getContext('2d').clearRect(0,0,mask.width,mask.height);mask.getContext('2d').putImageData(lastSaved.mask,0,0);}catch(_){}}
        if(guide){try{guide.getContext('2d').clearRect(0,0,guide.width,guide.height);}catch(_){}}
        validate.disabled=true;if(status)status.textContent=savedCount<2?`Pièce ${savedCount} validée. Ajoute une deuxième pièce.`:`${savedCount} pièces lasso propres. Tu peux voir le résultat ou continuer.`;
      }
    },60);
  },true);
  controls.querySelector('#magicIntensity').addEventListener('input',e=>{if(lastSaved){lastSaved.intensity=Number(e.target.value);window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));}});
  next.addEventListener('click',()=>{try{mask?.getContext('2d').clearRect(0,0,mask.width,mask.height);guide?.getContext('2d').clearRect(0,0,guide.width,guide.height);}catch(_){}redo?.click();controls.querySelector('#magicOrder').textContent=`Ordre suivant : ${savedCount+1}`;if(status)status.textContent='Entoure la pièce suivante avec le doigt ou l’Apple Pencil.';});
  preview.addEventListener('click',()=>{
    savedCount=cleanPlan();if(savedCount<2){if(status)status.textContent='Il faut au moins 2 pièces lasso propres.';return;}
    if(savedCount>9){if(status)status.textContent='Maximum 9 pièces pour cet aperçu.';return;}
    finish?.click();setTimeout(()=>{try{window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));window.renderAt?.(1,window.HappyHoloReliefState?.view);}catch(e){console.error('[V3.35.8 preview]',e);}},140);
  });
  const hint=document.createElement('div');hint.style.cssText='font-size:11px;color:#9fc5da;margin:-2px 0 7px';hint.textContent='Seules les pièces créées avec ce lasso sont conservées. Les anciennes sélections automatiques sont supprimées.';controls.insertAdjacentElement('afterend',hint);
}
new MutationObserver(()=>patch()).observe(document.documentElement,{childList:true,subtree:true});patch();
window.addEventListener('happyholo:selection-plan',()=>setTimeout(patch,0));
console.log('[HAPPYHOLO] V3.35.8 nettoyage strict + résultat lasso');
})();