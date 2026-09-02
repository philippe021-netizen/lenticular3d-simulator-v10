/* HappyHolo V3.35.4 — Sélection magique iPad : IMG visible + tap direct */
(()=>{
'use strict';
const LIB='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm';
const WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL='https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task';
let apiP=null,segP=null;
const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:null;
const clone=m=>new ImageData(new Uint8ClampedArray(m.data),m.width,m.height);
async function api(){apiP ||= import(LIB);return apiP;}
async function segmenter(status){
  if(!segP) segP=(async()=>{
    status.textContent='Chargement de la sélection magique…';
    const a=await api();
    const vision=await a.FilesetResolver.forVisionTasks(WASM);
    status.textContent='Chargement du modèle MagicTouch…';
    return a.InteractiveSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:'CPU'}});
  })();
  return segP;
}
function maskToOverlay(mp,w,h,threshold=.42){
  const vals=mp.getAsFloat32Array(),sw=mp.width,sh=mp.height;
  const src=document.createElement('canvas');src.width=sw;src.height=sh;
  const sx=src.getContext('2d',{willReadFrequently:true}),id=sx.createImageData(sw,sh);let count=0;
  for(let i=0;i<sw*sh;i++){
    const v=vals[i],o=i*4,a=v>=threshold?Math.max(110,Math.round(v*235)):0;
    if(a)count++;
    id.data[o]=255;id.data[o+1]=0;id.data[o+2]=255;id.data[o+3]=a;
  }
  sx.putImageData(id,0,0);
  const out=document.createElement('canvas');out.width=w;out.height=h;
  const ox=out.getContext('2d',{willReadFrequently:true});ox.drawImage(src,0,0,w,h);
  return {mask:ox.getImageData(0,0,w,h),ratio:count/(sw*sh)};
}
function save(mask){
  const p=plan();if(!p)return;
  const n=p.filter(s=>s?.source==='magic-selection-v3354').length+1;
  p.push({id:Date.now()+Math.random(),name:`Pièce magique ${n}`,depth:.34+n*.025,action:'explodeview',intensity:65,timing:'all',actionZones:[],explodeOrder:n,explodeDirection:'auto',explodeMode:window.HappyHoloExplodeViewState?.mode||'simple',source:'magic-selection-v3354',confidence:1,mask,initialMask:clone(mask)});
  window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:p.length,source:'magic-selection-v3354'}}));
  window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
}
async function open(){
  const file=document.getElementById('file')?.files?.[0];
  if(!file){alert('Choisis d’abord une photo.');return;}
  const url=URL.createObjectURL(file);
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:10000220;background:#05080bf8;color:#fff;display:flex;flex-direction:column;padding:10px;box-sizing:border-box;font-family:system-ui,sans-serif';
  const bar=document.createElement('div');bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px';
  const title=document.createElement('div');title.innerHTML='<b style="font-size:20px">✨ Sélection magique V3.35.4</b><div id="magicSourceInfo" style="font-size:12px;color:#cbd8e2">Photo originale · interaction tactile directe</div>';
  const close=document.createElement('button');close.textContent='Terminer';close.style.cssText='border:0;border-radius:10px;padding:10px 14px;font-weight:900';bar.append(title,close);
  const status=document.createElement('div');status.textContent='Chargement de la photo…';status.style.cssText='padding:9px 11px;background:#142531;border-radius:10px;margin-bottom:8px;font-size:13px';
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
  const validate=document.createElement('button');validate.textContent='✓ Valider la pièce';validate.disabled=true;
  const clear=document.createElement('button');clear.textContent='↺ Refaire';
  for(const b of [validate,clear])b.style.cssText='border:0;border-radius:10px;padding:10px 13px;font-weight:900';actions.append(validate,clear);
  const stage=document.createElement('div');stage.style.cssText='position:relative;flex:1;min-height:280px;background:#111;border:2px solid #27a8ee;border-radius:14px;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none';
  const img=document.createElement('img');img.alt='Photo à sélectionner';img.style.cssText='position:absolute;display:block;pointer-events:none;max-width:none!important;max-height:none!important;object-fit:fill!important;background:transparent!important';
  const mask=document.createElement('canvas'),dot=document.createElement('canvas');
  for(const c of [mask,dot])c.style.cssText='position:absolute;display:block;pointer-events:none;background:transparent!important;aspect-ratio:auto!important;border-radius:0!important;object-fit:fill!important';
  mask.style.opacity='.72';
  stage.append(img,mask,dot);overlay.append(bar,status,actions,stage);document.body.appendChild(overlay);
  close.onclick=()=>{URL.revokeObjectURL(url);overlay.remove();};
  img.src=url;
  try{if(img.decode)await img.decode();else await new Promise((r,j)=>{img.onload=r;img.onerror=j;});}catch(e){status.textContent='Erreur de lecture de la photo : '+(e?.message||e);return;}
  const maxW=1200,s=Math.min(1,maxW/img.naturalWidth),W=Math.max(1,Math.round(img.naturalWidth*s)),H=Math.max(1,Math.round(img.naturalHeight*s));
  mask.width=dot.width=W;mask.height=dot.height=H;
  overlay.querySelector('#magicSourceInfo').textContent=`PHOTO ${img.naturalWidth}×${img.naturalHeight} · tactile iPad actif`;
  function layout(){
    const r=stage.getBoundingClientRect(),a=W/H;let dw=r.width,dh=dw/a;if(dh>r.height){dh=r.height;dw=dh*a;}
    const l=(r.width-dw)/2,t=(r.height-dh)/2;
    for(const el of [img,mask,dot]){el.style.left=l+'px';el.style.top=t+'px';el.style.width=dw+'px';el.style.height=dh+'px';}
  }
  layout();window.addEventListener('resize',layout,{passive:true});
  let seg,current=null,busy=false,lastTrigger=0;
  try{seg=await segmenter(status);seg.setImage(img);status.textContent='Prêt : touche UNE FOIS le centre d’une roue, d’un phare, d’un siège…';}
  catch(e){console.error(e);status.textContent='Erreur MediaPipe : '+(e?.message||e);return;}
  function normalized(clientX,clientY){
    const r=img.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;
    if(x<0||y<0||x>r.width||y>r.height)return null;
    return {x:x/r.width,y:y/r.height};
  }
  function drawCross(p){
    const c=dot.getContext('2d');c.clearRect(0,0,W,H);c.strokeStyle='#34c759';c.lineWidth=6;c.lineCap='round';
    const x=p.x*W,y=p.y*H,r=14;c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);c.stroke();
  }
  async function trigger(clientX,clientY,kind){
    const now=performance.now();if(now-lastTrigger<350||busy)return;lastTrigger=now;
    const p=normalized(clientX,clientY);if(!p)return;
    drawCross(p);busy=true;status.textContent=`Toucher reçu (${kind}) — calcul de la pièce…`;
    await new Promise(r=>requestAnimationFrame(()=>r()));
    try{
      const a=await api(),mode=a.BrushMode?.POSITIVE ?? 1;
      const result=seg.segment([{brushMode:mode,point:[{x:p.x,y:p.y}],isCompleted:true}]);
      const mp=result?.confidenceMasks?.[0]||result?.categoryMask||result;
      if(!mp?.getAsFloat32Array)throw new Error('Aucun masque retourné par MagicTouch');
      const out=maskToOverlay(mp,W,H,.42);current=out.mask;
      const mc=mask.getContext('2d');mc.clearRect(0,0,W,H);mc.putImageData(current,0,0);
      validate.disabled=false;status.textContent=`Pièce détectée — ${Math.round(out.ratio*1000)/10}% de l’image. Valide si la zone magenta est correcte.`;
      mp.close?.();
    }catch(e){console.error('[V3.35.4]',e);status.textContent='Erreur de sélection : '+(e?.message||e);}
    finally{busy=false;}
  }
  stage.addEventListener('pointerdown',e=>{e.preventDefault();trigger(e.clientX,e.clientY,'pointer');},{passive:false});
  stage.addEventListener('touchend',e=>{e.preventDefault();const t=e.changedTouches?.[0];if(t)trigger(t.clientX,t.clientY,'touch');},{passive:false});
  stage.addEventListener('click',e=>{e.preventDefault();trigger(e.clientX,e.clientY,'click');});
  clear.onclick=()=>{current=null;validate.disabled=true;mask.getContext('2d').clearRect(0,0,W,H);dot.getContext('2d').clearRect(0,0,W,H);status.textContent='Prêt : touche une autre pièce.';};
  validate.onclick=()=>{if(!current)return;save(clone(current));clear.click();status.textContent='Pièce validée. Touche la pièce suivante.';};
}
window.HappyHoloMagicSelectionV334={open};
console.log('[HAPPYHOLO] Sélection magique V3.35.4 tactile iPad');
})();