/* HappyHolo V3.35.6 — Sélection magique au lasso doigt / Apple Pencil */
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
function pointInPoly(x,y,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;const hit=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi||1e-9)+xi);if(hit)inside=!inside;}return inside;}
function bbox(pts,W,H){let minX=W,minY=H,maxX=0,maxY=0;for(const p of pts){const x=p.x*W,y=p.y*H;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}const pad=Math.max(8,Math.round(Math.min(W,H)*.015));minX=Math.max(0,Math.floor(minX-pad));minY=Math.max(0,Math.floor(minY-pad));maxX=Math.min(W,Math.ceil(maxX+pad));maxY=Math.min(H,Math.ceil(maxY+pad));return{x:minX,y:minY,w:Math.max(2,maxX-minX),h:Math.max(2,maxY-minY)};}
function centroid(pts){let x=0,y=0;for(const p of pts){x+=p.x;y+=p.y;}return{x:x/pts.length,y:y/pts.length};}
function maskToFull(mp,W,H,roi,lasso,threshold=.42){
  const vals=mp.getAsFloat32Array(),sw=mp.width,sh=mp.height;
  const raw=document.createElement('canvas');raw.width=sw;raw.height=sh;
  const rx=raw.getContext('2d',{willReadFrequently:true}),id=rx.createImageData(sw,sh);let count=0;
  for(let yy=0;yy<sh;yy++)for(let xx=0;xx<sw;xx++){
    const i=yy*sw+xx,v=vals[i],o=i*4;
    const gx=(roi.x+(xx+.5)/sw*roi.w)/W,gy=(roi.y+(yy+.5)/sh*roi.h)/H;
    const keep=pointInPoly(gx,gy,lasso);
    const alpha=keep&&v>=threshold?Math.max(110,Math.round(v*235)):0;
    if(alpha)count++;
    id.data[o]=255;id.data[o+1]=0;id.data[o+2]=255;id.data[o+3]=alpha;
  }
  rx.putImageData(id,0,0);
  const full=document.createElement('canvas');full.width=W;full.height=H;
  const fx=full.getContext('2d',{willReadFrequently:true});fx.drawImage(raw,roi.x,roi.y,roi.w,roi.h);
  return{mask:fx.getImageData(0,0,W,H),ratio:count/(sw*sh)};
}
function save(mask){
  const p=plan();if(!p)return;
  const n=p.filter(s=>s?.source==='magic-selection-v3356').length+1;
  p.push({id:Date.now()+Math.random(),name:`Pièce magique ${n}`,depth:.34+n*.025,action:'explodeview',intensity:65,timing:'all',actionZones:[],explodeOrder:n,explodeDirection:'auto',explodeMode:window.HappyHoloExplodeViewState?.mode||'simple',source:'magic-selection-v3356',confidence:1,mask,initialMask:clone(mask)});
  window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:p.length,source:'magic-selection-v3356'}}));
  window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
}
async function open(){
  const file=document.getElementById('file')?.files?.[0];if(!file){alert('Choisis d’abord une photo.');return;}
  const url=URL.createObjectURL(file);
  const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:10000220;background:#05080bf8;color:#fff;display:flex;flex-direction:column;padding:10px;box-sizing:border-box;font-family:system-ui,sans-serif';
  const bar=document.createElement('div');bar.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px';
  const title=document.createElement('div');title.innerHTML='<b style="font-size:20px">✨ Sélection magique V3.35.6</b><div style="font-size:12px;color:#cbd8e2">Lasso libre · doigt ou Apple Pencil</div>';
  const close=document.createElement('button');close.textContent='Terminer';close.style.cssText='border:0;border-radius:10px;padding:10px 14px;font-weight:900';bar.append(title,close);
  const status=document.createElement('div');status.textContent='Chargement de la photo…';status.style.cssText='padding:9px 11px;background:#142531;border-radius:10px;margin-bottom:8px;font-size:13px';
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
  const validate=document.createElement('button');validate.textContent='✓ Valider la pièce';validate.disabled=true;
  const clear=document.createElement('button');clear.textContent='↺ Refaire le contour';
  for(const b of [validate,clear])b.style.cssText='border:0;border-radius:10px;padding:10px 13px;font-weight:900';actions.append(validate,clear);
  const stage=document.createElement('div');stage.style.cssText='position:relative;flex:1;min-height:280px;background:#111;border:2px solid #27a8ee;border-radius:14px;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none';
  const img=document.createElement('img');img.alt='Photo à sélectionner';img.style.cssText='position:absolute;display:block;pointer-events:none;max-width:none!important;max-height:none!important;object-fit:fill!important;background:transparent!important';
  const mask=document.createElement('canvas'),guide=document.createElement('canvas');
  for(const c of [mask,guide])c.style.cssText='position:absolute;display:block;pointer-events:none;background:transparent!important;aspect-ratio:auto!important;border-radius:0!important;object-fit:fill!important';
  mask.style.opacity='.72';stage.append(img,mask,guide);overlay.append(bar,status,actions,stage);document.body.appendChild(overlay);
  close.onclick=()=>{URL.revokeObjectURL(url);overlay.remove();};
  img.src=url;try{if(img.decode)await img.decode();else await new Promise((r,j)=>{img.onload=r;img.onerror=j;});}catch(e){status.textContent='Erreur photo : '+(e?.message||e);return;}
  const maxW=1200,s=Math.min(1,maxW/img.naturalWidth),W=Math.max(1,Math.round(img.naturalWidth*s)),H=Math.max(1,Math.round(img.naturalHeight*s));mask.width=guide.width=W;mask.height=guide.height=H;
  function layout(){const r=stage.getBoundingClientRect(),a=W/H;let dw=r.width,dh=dw/a;if(dh>r.height){dh=r.height;dw=dh*a;}const l=(r.width-dw)/2,t=(r.height-dh)/2;for(const el of [img,mask,guide]){el.style.left=l+'px';el.style.top=t+'px';el.style.width=dw+'px';el.style.height=dh+'px';}}
  layout();window.addEventListener('resize',layout,{passive:true});
  let seg,current=null,drawing=false,pts=[],activePointer=null,busy=false;
  try{seg=await segmenter(status);status.textContent='Entoure la pièce avec le doigt ou l’Apple Pencil, puis relâche. L’IA analysera uniquement ce contour.';}catch(e){console.error(e);status.textContent='Erreur MediaPipe : '+(e?.message||e);return;}
  function norm(clientX,clientY){const r=img.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;if(x<0||y<0||x>r.width||y>r.height)return null;return{x:x/r.width,y:y/r.height};}
  function redrawGuide(closePath=false){const c=guide.getContext('2d');c.clearRect(0,0,W,H);if(!pts.length)return;c.strokeStyle='#22c8ff';c.lineWidth=4;c.lineJoin='round';c.lineCap='round';c.fillStyle='rgba(34,200,255,.10)';c.beginPath();c.moveTo(pts[0].x*W,pts[0].y*H);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x*W,pts[i].y*H);if(closePath){c.closePath();c.fill();}c.stroke();}
  async function analyze(){if(busy||pts.length<8)return;busy=true;redrawGuide(true);status.textContent='Contour reçu — analyse de la pièce…';await new Promise(r=>requestAnimationFrame(()=>r()));try{
    const roi=bbox(pts,W,H),crop=document.createElement('canvas');crop.width=512;crop.height=512;const cx=crop.getContext('2d');
    const sx=roi.x/W*img.naturalWidth,sy=roi.y/H*img.naturalHeight,sw=roi.w/W*img.naturalWidth,sh=roi.h/H*img.naturalHeight;cx.drawImage(img,sx,sy,sw,sh,0,0,512,512);
    seg.setImage(crop);const center=centroid(pts),localX=(center.x*W-roi.x)/roi.w,localY=(center.y*H-roi.y)/roi.h;
    const a=await api(),lassoMode=a.BrushMode?.LASSO ?? 3,positiveMode=a.BrushMode?.POSITIVE ?? 1;
    let strokePts=pts.map(p=>({x:Math.max(0,Math.min(1,(p.x*W-roi.x)/roi.w)),y:Math.max(0,Math.min(1,(p.y*H-roi.y)/roi.h))}));
    let result;
    try{result=seg.segment([{brushMode:lassoMode,point:strokePts,isCompleted:true}]);}catch(_){result=seg.segment([{brushMode:positiveMode,point:[{x:Math.max(0,Math.min(1,localX)),y:Math.max(0,Math.min(1,localY))}],isCompleted:true}]);}
    const mp=result?.confidenceMasks?.[0]||result?.categoryMask||result;if(!mp?.getAsFloat32Array)throw new Error('Aucun masque retourné');
    const out=maskToFull(mp,W,H,roi,pts,.42);current=out.mask;const mc=mask.getContext('2d');mc.clearRect(0,0,W,H);mc.putImageData(current,0,0);validate.disabled=false;status.textContent='Pièce détectée dans ton contour. Valide si le magenta correspond, sinon refais le contour.';mp.close?.();crop.width=1;crop.height=1;
  }catch(e){console.error('[V3.35.6]',e);status.textContent='Erreur de sélection : '+(e?.message||e);}finally{busy=false;}}
  stage.addEventListener('pointerdown',e=>{if(busy)return;e.preventDefault();const p=norm(e.clientX,e.clientY);if(!p)return;activePointer=e.pointerId;try{stage.setPointerCapture(e.pointerId);}catch(_){}drawing=true;pts=[p];current=null;validate.disabled=true;mask.getContext('2d').clearRect(0,0,W,H);redrawGuide(false);status.textContent=e.pointerType==='pen'?'Apple Pencil : entoure la pièce…':'Doigt : entoure la pièce…';},{passive:false});
  stage.addEventListener('pointermove',e=>{if(!drawing||e.pointerId!==activePointer)return;e.preventDefault();const p=norm(e.clientX,e.clientY);if(!p)return;const last=pts[pts.length-1],dx=(p.x-last.x)*W,dy=(p.y-last.y)*H;if(dx*dx+dy*dy<9)return;pts.push(p);redrawGuide(false);},{passive:false});
  async function finish(e){if(!drawing||e.pointerId!==activePointer)return;e.preventDefault();drawing=false;try{stage.releasePointerCapture(e.pointerId);}catch(_){}activePointer=null;if(pts.length<8){status.textContent='Contour trop court : entoure complètement la pièce.';return;}await analyze();}
  stage.addEventListener('pointerup',finish,{passive:false});stage.addEventListener('pointercancel',e=>{drawing=false;activePointer=null;status.textContent='Contour annulé. Recommence.';},{passive:false});
  clear.onclick=()=>{pts=[];current=null;validate.disabled=true;mask.getContext('2d').clearRect(0,0,W,H);guide.getContext('2d').clearRect(0,0,W,H);status.textContent='Entoure à nouveau la pièce avec le doigt ou l’Apple Pencil.';};
  validate.onclick=()=>{if(!current)return;save(clone(current));clear.click();status.textContent='Pièce validée. Entoure maintenant la pièce suivante.';};
}
window.HappyHoloMagicSelectionV334={open};
console.log('[HAPPYHOLO] Sélection magique V3.35.6 lasso doigt Apple Pencil');
})();