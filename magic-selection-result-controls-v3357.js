/* HappyHolo V3.35.7 — actions + résultat visibles pour Sélection magique */
(()=>{
'use strict';
function patch(){
  const overlays=[...document.querySelectorAll('div')].filter(el=>el.style?.zIndex==='10000220'||el.style?.zIndex===10000220);
  const overlay=overlays[overlays.length-1];if(!overlay||overlay.dataset.magicResultPatched==='1')return;
  const title=[...overlay.querySelectorAll('b')].find(b=>(b.textContent||'').includes('Sélection magique'));
  if(!title)return;
  overlay.dataset.magicResultPatched='1';
  title.textContent='✨ Sélection magique V3.35.7';
  const buttons=[...overlay.querySelectorAll('button')];
  const validate=buttons.find(b=>(b.textContent||'').includes('Valider la pièce'));
  const redo=buttons.find(b=>(b.textContent||'').includes('Refaire'));
  const finish=buttons.find(b=>(b.textContent||'').includes('Terminer'));
  const stage=[...overlay.querySelectorAll('div')].find(d=>d.style?.touchAction==='none');
  if(!validate||!stage)return;
  const maskCanvases=[...stage.querySelectorAll('canvas')];
  const mask=maskCanvases[0];
  const guide=maskCanvases[1];
  const controls=document.createElement('div');
  controls.id='magicResultControls';
  controls.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px;padding:8px 10px;background:#0c1a24;border:1px solid #31576d;border-radius:10px';
  controls.innerHTML='<b style="font-size:13px">Action</b><span style="background:#e83df0;color:#fff;padding:6px 9px;border-radius:8px;font-weight:900;font-size:12px">💥 ExplodeView</span><label style="font-size:12px">Intensité <input id="magicIntensity" type="range" min="30" max="100" value="65" style="width:120px;vertical-align:middle"></label><span id="magicOrder" style="font-size:12px;color:#cfe7f5">Ordre : —</span>';
  const next=document.createElement('button');next.textContent='＋ Pièce suivante';
  const preview=document.createElement('button');preview.textContent='▶ Voir le résultat';preview.disabled=true;
  for(const b of [next,preview])b.style.cssText='border:0;border-radius:9px;padding:9px 12px;font-weight:900';
  controls.append(next,preview);
  const status=[...overlay.querySelectorAll('div')].find(d=>d.style?.background==='#142531'||d.style?.backgroundColor==='rgb(20, 37, 49)');
  const actions=validate.parentElement;actions?.insertAdjacentElement('afterend',controls);
  let savedCount=0,lastSaved=null;
  const originalValidate=validate.onclick;
  validate.onclick=null;
  validate.addEventListener('click',()=>{
    const before=(window.happyHoloSelectionPlan||[]).length;
    originalValidate?.call(validate);
    setTimeout(()=>{
      const p=window.happyHoloSelectionPlan||[];
      if(p.length>before){
        lastSaved=p[p.length-1];savedCount=p.filter((s,i)=>i>0&&s?.action==='explodeview').length;
        const intensity=Number(controls.querySelector('#magicIntensity')?.value||65);lastSaved.intensity=intensity;lastSaved.explodeOrder=savedCount;lastSaved.action='explodeview';
        controls.querySelector('#magicOrder').textContent=`Ordre : ${savedCount}`;
        preview.disabled=savedCount<2;
        // Restaurer visuellement le masque qui vient d'être validé au lieu de le laisser disparaître.
        if(lastSaved?.mask&&mask){try{mask.getContext('2d').putImageData(lastSaved.mask,0,0);}catch(_){}}
        if(guide){try{guide.getContext('2d').clearRect(0,0,guide.width,guide.height);}catch(_){}}
        validate.disabled=true;
        if(status)status.textContent=savedCount<2?`Pièce ${savedCount} validée et visible. Ajoute encore une pièce pour voir l’ExplodeView.`:`Pièce ${savedCount} validée. Tu peux voir le résultat ExplodeView ou ajouter une pièce.`;
        window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
      }
    },50);
  },true);
  controls.querySelector('#magicIntensity').addEventListener('input',e=>{if(lastSaved){lastSaved.intensity=Number(e.target.value);window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));}});
  next.addEventListener('click',()=>{
    try{mask?.getContext('2d').clearRect(0,0,mask.width,mask.height);guide?.getContext('2d').clearRect(0,0,guide.width,guide.height);}catch(_){}
    redo?.click();
    controls.querySelector('#magicOrder').textContent=`Ordre suivant : ${savedCount+1}`;
    if(status)status.textContent='Entoure la pièce suivante avec le doigt ou l’Apple Pencil.';
  });
  preview.addEventListener('click',()=>{
    window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:(window.happyHoloSelectionPlan||[]).length,source:'magic-v3357-preview'}}));
    window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
    finish?.click();
    setTimeout(()=>{try{window.renderAt?.(1,window.HappyHoloReliefState?.view);window.HappyHoloExplodeViewMachines?.configureAutomatically?.();}catch(_){}},120);
  });
  const hint=document.createElement('div');hint.style.cssText='font-size:11px;color:#9fc5da;margin:-2px 0 7px';hint.textContent='La pièce validée reste affichée. « Voir le résultat » devient disponible à partir de 2 pièces.';controls.insertAdjacentElement('afterend',hint);
}
const mo=new MutationObserver(()=>patch());mo.observe(document.documentElement,{childList:true,subtree:true});patch();
window.addEventListener('happyholo:selection-plan',()=>setTimeout(patch,0));
console.log('[HAPPYHOLO] V3.35.7 actions + résultat visibles');
})();