/* HappyHolo V3.34 — Sélection magique : 1 toucher = 1 pièce */
(()=>{
'use strict';
const LIB='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm';
const WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL='https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task';
let apiP=null, segP=null;
const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:null;
const clone=m=>new ImageData(new Uint8ClampedArray(m.data),m.width,m.height);
async function api(){apiP ||= import(LIB);return apiP;}
async function segmenter(status){
 if(!segP) segP=(async()=>{status.textContent='Chargement de la sélection magique…';const a=await api();const vision=await a.FilesetResolver.forVisionTasks(WASM);status.textContent='Chargement du modèle MagicTouch…';return a.InteractiveSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:'CPU'}});})();
 return segP;
}
function toOverlay(mp,w,h,threshold=.45){
 const vals=mp.getAsFloat32Array(),sw=mp.width,sh=mp.height;
 const src=document.createElement('canvas');src.width=sw;src.height=sh;const x=src.getContext('2d',{willReadFrequently:true});const id=x.createImageData(sw,sh);
 let count=0;
 for(let i=0;i<sw*sh;i++){const v=vals[i],o=i*4,a=v>=threshold?Math.max(130,Math.round(v*235)):0;if(a)count++;id.data[o]=255;id.data[o+1]=0;id.data[o+2]=255;id.data[o+3]=a;}
 x.putImageData(id,0,0);
 const out=document.createElement('canvas');out.width=w;out.height=h;const ox=out.getContext('2d',{willReadFrequently:true});ox.drawImage(src,0,0,w,h);return {mask:ox.getImageData(0,0,w,h),ratio:count/(sw*sh)};
}
function save(mask){
 const p=plan();if(!p)return;const n=p.filter(s=>s?.source==='magic-selection-v334').length+1;
 p.push({id:Date.now()+Math.random(),name:`Pièce magique ${n}`,depth:.34+n*.025,action:'explodeview',intensity:65,timing:'all',actionZones:[],explodeOrder:n,explodeDirection:'auto',explodeMode:window.HappyHoloExplodeViewState?.mode||'simple',source:'magic-selection-v334',confidence:1,mask,initialMask:clone(mask)});
 window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:p.length,source:'magic-selection-v334'}}));window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
}
async function open(){
 const src=window.HappyHoloReliefState?.sourceImg;
 if(!src?.naturalWidth){alert('Crée d’abord le relief à partir de la photo.');return;}
 const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:10000200;background:#05080bf8;color:white;display:flex;flex-direction:column;padding:10px;box-sizing:border-box;font-family:system-ui,sans-serif';
 const bar=document.createElement('div');bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px';
 const title=document.createElement('div');title.innerHTML=`<b style="font-size:20px">✨ Sélection magique V3.34</b><div style="font-size:12px;color:#cbd8e2">Touche UNE fois la roue, selle, phare, moteur… · Source ${src.naturalWidth}×${src.naturalHeight}</div>`;
 const close=document.createElement('button');close.textContent='Terminer';close.style.cssText='border:0;border-radius:10px;padding:10px 14px;font-weight:900';bar.append(title,close);
 const status=document.createElement('div');status.textContent='Préparation…';status.style.cssText='padding:9px 11px;background:#142531;border-radius:10px;margin-bottom:8px;font-size:13px';
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
 const validate=document.createElement('button');validate.textContent='✓ Valider la pièce';validate.disabled=true;const clear=document.createElement('button');clear.textContent='↺ Refaire';for(const b of [validate,clear])b.style.cssText='border:0;border-radius:10px;padding:10px 13px;font-weight:900';actions.append(validate,clear);
 const stage=document.createElement('div');stage.style.cssText='position:relative;flex:1;min-height:280px;background:#111;border:2px solid #27a8ee;border-radius:14px;overflow:hidden;touch-action:none';
 const image=document.createElement('canvas'),mask=document.createElement('canvas'),dot=document.createElement('canvas');for(const c of [image,mask,dot])c.style.cssText='position:absolute;pointer-events:none;display:block';mask.style.opacity='.72';stage.append(image,mask,dot);overlay.append(bar,status,actions,stage);document.body.appendChild(overlay);close.onclick=()=>overlay.remove();
 const W=Math.min(1200,src.naturalWidth),H=Math.max(1,Math.round(W*src.naturalHeight/src.naturalWidth));for(const c of [image,mask,dot]){c.width=W;c.height=H;}image.getContext('2d').drawImage(src,0,0,W,H);
 function layout(){const r=stage.getBoundingClientRect(),a=W/H;let dw=r.width,dh=dw/a;if(dh>r.height){dh=r.height;dw=dh*a;}const l=(r.width-dw)/2,t=(r.height-dh)/2;for(const c of [image,mask,dot]){c.style.left=l+'px';c.style.top=t+'px';c.style.width=dw+'px';c.style.height=dh+'px';}}
 layout();window.addEventListener('resize',layout,{passive:true});
 let seg,current=null,busy=false;
 try{seg=await segmenter(status);seg.setImage(image);status.textContent='Prêt : touche UNE fois une grosse pièce.';}catch(e){console.error(e);status.textContent='Erreur MediaPipe : '+(e?.message||e);return;}
 function pos(ev){const r=image.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;if(x<0||y<0||x>r.width||y>r.height)return null;return{x:x/r.width,y:y/r.height};}
 stage.addEventListener('pointerup',ev=>{
  if(busy)return;const p=pos(ev);if(!p)return;busy=true;status.textContent='Sélection magique en cours…';
  const dc=dot.getContext('2d');dc.clearRect(0,0,W,H);dc.fillStyle='#34c759';dc.beginPath();dc.arc(p.x*W,p.y*H,8,0,Math.PI*2);dc.fill();
  try{const a=apiP;const mode=a?.BrushMode?.POSITIVE;const stroke=[{brushMode:mode,point:[p],isCompleted:true}];const mp=seg.segment(stroke);if(!mp?.getAsFloat32Array)throw new Error('Aucun masque retourné');const r=toOverlay(mp,W,H,.42);current=r.mask;const mc=mask.getContext('2d');mc.clearRect(0,0,W,H);mc.putImageData(current,0,0);validate.disabled=false;status.textContent=`Sélection trouvée — ${Math.round(r.ratio*1000)/10}% de l’image. Si c’est la bonne pièce, valide.`;mp.close?.();}
  catch(e){console.error('[V3.34 selection]',e);status.textContent='Erreur de sélection : '+(e?.message||e);}finally{busy=false;}
 });
 clear.onclick=()=>{current=null;validate.disabled=true;mask.getContext('2d').clearRect(0,0,W,H);dot.getContext('2d').clearRect(0,0,W,H);status.textContent='Touche une autre zone de la pièce.';};
 validate.onclick=()=>{if(!current)return;save(clone(current));clear.click();status.textContent='Pièce validée. Touche la pièce suivante.';};
}
window.HappyHoloMagicSelectionV334={open};
console.log('[HAPPYHOLO] Sélection magique V3.34 chargée');
})();