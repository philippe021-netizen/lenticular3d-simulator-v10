/* HappyHolo V3.35.5 — Sélection magique locale pour pièces mécaniques */
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
function maskToFull(mp,W,H,roi,threshold=.42){
  const vals=mp.getAsFloat32Array(),sw=mp.width,sh=mp.height;
  const raw=document.createElement('canvas');raw.width=sw;raw.height=sh;
  const rx=raw.getContext('2d',{willReadFrequently:true}),id=rx.createImageData(sw,sh);let count=0;
  for(let i=0;i<sw*sh;i++){
    const v=vals[i],o=i*4,a=v>=threshold?Math.max(110,Math.round(v*235)):0;
    if(a)count++;
    id.data[o]=255;id.data[o+1]=0;id.data[o+2]=255;id.data[o+3]=a;
  }
  rx.putImageData(id,0,0);
  const full=document.createElement('canvas');full.width=W;full.height=H;
  const fx=full.getContext('2d',{willReadFrequently:true});
  fx.drawImage(raw,roi.x,roi.y,roi.w,roi.h);
  return {mask:fx.getImageData(0,0,W,H),ratio:count/(sw*sh)};
}
function save(mask){
  const p=plan();if(!p)return;
  const n=p.filter(s=>s?.source==='magic-selection-v3355').length+1;
  p.push({id:Date.now()+Math.random(),name:`Pièce magique ${n}`,depth:.34+n*.025,action:'explodeview',intensity:65,timing:'all',actionZones:[],explodeOrder:n,explodeDirection:'auto',explodeMode:window.HappyHoloExplodeViewState?.mode||'simple',source:'magic-selection-v3355',confidence:1,mask,initialMask:clone(mask)});
  window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:p.length,source:'magic-selection-v3355'}}));
  window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
}
async function open(){
  const file=document.getElementById('file')?.files?.[0];
  if(!file){alert('Choisis d’abord une photo.');return;}
  const url=URL.createObjectURL(file);
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:10000220;background:#05080bf8;color:#fff;display:flex;flex-direction:column;padding:10px;box-sizing:border-box;font-family:system-ui,sans-serif';
  const bar=document.createElement('div');bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px';
  const title=document.createElement('div');title.innerHTML='<b style="font-size:20px">✨ Sélection magique V3.35.5</b><div id="magicSourceInfo" style="font-size:12px;color:#cbd8e2">Mode pièces : analyse locale autour du toucher</div>';
  const close=document.createElement('button');close.textContent='Terminer';close.style.cssText='border:0;border-radius:10px;padding:10px 14px;font-weight:900';bar.append(title,close);
  const status=document.createElement('div');status.textContent='Chargement de la photo…';status.style.cssText='padding:9px 11px;background:#142531;border-radius:10px;margin-bottom:8px;font-size:13px';
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
  const validate=document.createElement('button');validate.textContent='✓ Valider la pièce';validate.disabled=true;
  const clear=document.createElement('button');clear.textContent='↺ Refaire';
  const smaller=document.createElement('button');smaller.textContent='− Zone';
  const larger=document.createElement('button');larger.textContent='+ Zone';
  for(const b of [validate,clear,smaller,larger])b.style.cssText='border:0;border-radius:10px;padding:10px 13px;font-weight:900';actions.append(validate,clear,smaller,larger);
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
  overlay.querySelector('#magicSourceInfo').textContent=`PHOTO ${img.naturalWidth}×${img.naturalHeight} · mode PIÈCE LOCALE`;
  function layout(){
    const r=stage.getBoundingClientRect(),a=W/H;let dw=r.width,dh=dw/a;if(dh>r.height){dh=r.height;dw=dh*a;}
    const l=(r.width-dw)/2,t=(r.height-dh)/2;
    for(const el of [img,mask,dot]){el.style.left=l+'px';el.style.top=t+'px';el.style.width=dw+'px';el.style.height=dh+'px';}
  }
  layout();window.addEventListener('resize',layout,{passive:true});
  let seg,current=null,busy=false,lastTrigger=0,zoneScale=.38,lastPoint=null;
  try{seg=await segmenter(status);status.textContent='Prêt : touche une roue, un phare, un siège… L’IA n’analysera que la zone autour.';}
  catch(e){console.error(e);status.textContent='Erreur MediaPipe : '+(e?.message||e);return;}
  function normalized(clientX,clientY){
    const r=img.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;
    if(x<0||y<0||x>r.width||y>r.height)return null;
    return {x:x/r.width,y:y/r.height};
  }
  function roiFor(p){
    const side=Math.max(100,Math.round(Math.min(W,H)*zoneScale));
    let x=Math.round(p.x*W-side/2),y=Math.round(p.y*H-side/2);
    x=Math.max(0,Math.min(W-side,x));y=Math.max(0,Math.min(H-side,y));
    return {x,y,w:Math.min(side,W),h:Math.min(side,H)};
  }
  function drawGuide(p,roi){
    const c=dot.getContext('2d');c.clearRect(0,0,W,H);c.strokeStyle='#20c7ff';c.lineWidth=3;c.setLineDash([10,8]);c.strokeRect(roi.x+1,roi.y+1,roi.w-2,roi.h-2);c.setLineDash([]);
    c.strokeStyle='#34c759';c.lineWidth=6;c.lineCap='round';const x=p.x*W,y=p.y*H,r=14;c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);c.stroke();
  }
  async function runAt(p,kind){
    if(busy)return;busy=true;lastPoint=p;const roi=roiFor(p);drawGuide(p,roi);status.textContent=`Toucher reçu — analyse locale ${Math.round(roi.w)}×${Math.round(roi.h)}…`;
    await new Promise(r=>requestAnimationFrame(()=>r()));
    try{
      const crop=document.createElement('canvas');crop.width=512;crop.height=512;
      const cx=crop.getContext('2d');
      const sx=roi.x/W*img.naturalWidth,sy=roi.y/H*img.naturalHeight,sw=roi.w/W*img.naturalWidth,sh=roi.h/H*img.naturalHeight;
      cx.drawImage(img,sx,sy,sw,sh,0,0,512,512);
      seg.setImage(crop);
      const localX=(p.x*W-roi.x)/roi.w,localY=(p.y*H-roi.y)/roi.h;
      const a=await api(),mode=a.BrushMode?.POSITIVE ?? 1;
      const result=seg.segment([{brushMode:mode,point:[{x:Math.max(0,Math.min(1,localX)),y:Math.max(0,Math.min(1,localY))}],isCompleted:true}]);
      const mp=result?.confidenceMasks?.[0]||result?.categoryMask||result;
      if(!mp?.getAsFloat32Array)throw new Error('Aucun masque retourné par MagicTouch');
      const out=maskToFull(mp,W,H,roi,.42);current=out.mask;
      const mc=mask.getContext('2d');mc.clearRect(0,0,W,H);mc.putImageData(current,0,0);
      validate.disabled=false;status.textContent=`Pièce locale détectée — ${Math.round(out.ratio*1000)/10}% de la zone. Valide si c’est la bonne pièce.`;
      mp.close?.();crop.width=1;crop.height=1;
    }catch(e){console.error('[V3.35.5]',e);status.textContent='Erreur de sélection : '+(e?.message||e);}
    finally{busy=false;}
  }
  async function trigger(clientX,clientY,kind){
    const now=performance.now();if(now-lastTrigger<350||busy)return;lastTrigger=now;
    const p=normalized(clientX,clientY);if(!p)return;await runAt(p,kind);
  }
  stage.addEventListener('pointerdown',e=>{e.preventDefault();trigger(e.clientX,e.clientY,'pointer');},{passive:false});
  stage.addEventListener('touchend',e=>{e.preventDefault();const t=e.changedTouches?.[0];if(t)trigger(t.clientX,t.clientY,'touch');},{passive:false});
  stage.addEventListener('click',e=>{e.preventDefault();trigger(e.clientX,e.clientY,'click');});
  clear.onclick=()=>{current=null;validate.disabled=true;mask.getContext('2d').clearRect(0,0,W,H);dot.getContext('2d').clearRect(0,0,W,H);status.textContent='Prêt : touche une autre pièce.';};
  smaller.onclick=()=>{zoneScale=Math.max(.20,zoneScale-.06);status.textContent=`Zone réduite à ${Math.round(zoneScale*100)} %. Retouche la pièce.`;if(lastPoint){current=null;validate.disabled=true;mask.getContext('2d').clearRect(0,0,W,H);drawGuide(lastPoint,roiFor(lastPoint));}};
  larger.onclick=()=>{zoneScale=Math.min(.62,zoneScale+.06);status.textContent=`Zone agrandie à ${Math.round(zoneScale*100)} %. Retouche la pièce.`;if(lastPoint){current=null;validate.disabled=true;mask.getContext('2d').clearRect(0,0,W,H);drawGuide(lastPoint,roiFor(lastPoint));}};
  validate.onclick=()=>{if(!current)return;save(clone(current));clear.click();status.textContent='Pièce validée. Touche la pièce suivante.';};
}
window.HappyHoloMagicSelectionV334={open};
console.log('[HAPPYHOLO] Sélection magique V3.35.5 locale pièces mécaniques');
})();