/* HappyHolo — rendu support articulé forcé V2
   Quand un rig V3.27 validé est actif, ce renderer prend la main sur la fenêtre
   du support afin d'éviter toute concurrence avec l'ancien canvas support.
   Couvre les 4 actions : headTilt, headTurn, torso, wave.
*/
(()=>{
'use strict';
let overlay=null,ctx=null,badge=null,raf=0,start=0,last=0,base=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const labels={headTilt:'Inclinaison tête',headTurn:'Pivot tête',torso:'Déhanché',wave:'Salut bras droit'};
function rig(){return window.HappyHoloActionLocal||null;}
function rs(){return window.HappyHoloReliefState||null;}
function active(){const r=rig(),s=rs();return !!(r?.enabled&&r?.ready&&typeof r.renderSubject==='function'&&s?.subjectImg);}
function cover(sw,sh,dw,dh){const k=Math.max(dw/sw,dh/sh),w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}
function contain(sw,sh,dw,dh){const k=Math.min(dw/sw,dh/sh),w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}
function setup(){
  base=document.getElementById('supportCanvas');
  const win=base?.closest('.image-window');
  if(!base||!win)return false;
  win.style.setProperty('position','relative','important');
  win.style.setProperty('overflow','hidden','important');
  if(!overlay||!overlay.isConnected){
    overlay=document.createElement('canvas');overlay.id='hhSupportRigForcedCanvas';
    overlay.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:none;opacity:1;visibility:visible;';
    overlay.style.setProperty('z-index','2147483000','important');
    win.appendChild(overlay);ctx=overlay.getContext('2d');
  }
  const host=document.querySelector('.support-stage-wrap');
  if(host&&!badge){
    badge=document.createElement('div');badge.id='hhSupportRigStatus';
    badge.style.cssText='margin-top:7px;padding:7px 9px;border-radius:9px;background:#111;color:#fff;font:700 11px system-ui;display:none';
    host.appendChild(badge);
  }
  return true;
}
function size(){if(!base||!overlay)return;const r=base.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.round(r.width*d)),h=Math.max(2,Math.round(r.height*d));if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}}
function placement(img,W,H){
  const fit=document.getElementById('supportFit')?.value||'contain';
  let r=fit==='cover'?cover(img.naturalWidth||1,img.naturalHeight||1,W,H):contain(img.naturalWidth||1,img.naturalHeight||1,W,H);
  try{r=window.HappyHoloSubjectPlacement?.rect?.(img,W,H,{x:0,y:0,w:W,h:H})||r;}catch(_){ }
  const z=clamp(Number(document.getElementById('supportZoom')?.value||100),60,180)/100;
  const px=clamp(Number(document.getElementById('supportX')?.value||0),-50,50)/100;
  const py=clamp(Number(document.getElementById('supportY')?.value||0),-50,50)/100;
  const nw=r.w*z,nh=r.h*z;return{x:r.x+(r.w-nw)/2+px*W*.5,y:r.y+(r.h-nh)/2+py*H*.5,w:nw,h:nh};
}
function drawBg(s,W,H,phase){
  const bg=s.backgroundImg||s.sourceImg;if(!bg)return;
  try{if(window.HappyHoloCustomBackground?.draw?.(ctx,phase,W,H,{x:0,y:0,w:W,h:H}))return;}catch(_){ }
  const r=cover(bg.naturalWidth||1,bg.naturalHeight||1,W,H);ctx.drawImage(bg,r.x,r.y,r.w,r.h);
}
function showState(on,msg){
  if(!setup())return;
  if(on){
    base.style.setProperty('opacity','0','important');
    overlay.style.setProperty('display','block','important');overlay.style.setProperty('visibility','visible','important');overlay.style.setProperty('opacity','1','important');
    if(badge){badge.style.display='block';badge.textContent=msg;}
  }else{
    base.style.removeProperty('opacity');overlay.style.setProperty('display','none','important');if(badge)badge.style.display='none';
  }
}
function render(t){
  raf=requestAnimationFrame(render);if(t-last<32)return;last=t;if(!setup())return;
  if(!active()){showState(false,'');start=0;return;}
  if(!start)start=t;size();
  const r=rig(),s=rs(),W=overlay.width,H=overlay.height,img=s.subjectImg;
  // cycle volontairement plus court et plus lisible sur un petit porte-clé
  const speed=Math.max(1.8,Math.min(5,Number(document.getElementById('supportSpeed')?.value||3)));
  const phase=Math.sin((t-start)/(speed*1000)*Math.PI*2);
  showState(true,`✓ Action articulée active : ${labels[r.action]||r.action} · ${Math.round((r.intensity||.45)*100)}%`);
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);drawBg(s,W,H,phase);
  const fw=520,fh=Math.max(2,Math.round(fw*((img.naturalHeight||1)/(img.naturalWidth||1))));
  let frame=null;try{frame=r.renderSubject(img,fw,fh,phase);}catch(e){console.warn('[HAPPYHOLO] forced support rig',e);}
  if(frame){const p=placement(img,W,H);ctx.drawImage(frame,p.x,p.y,p.w,p.h);try{window.HappyHoloTextLayer?.draw?.(ctx,phase,p);}catch(_){ }}
  else if(badge)badge.textContent='⚠ Rig actif mais aucune image rendue';
}
function refresh(){setup();start=0;}
['happyholo-action-plan-changed','happyholo-relief-ready','happyholo-subject-placement-changed','happyholo-background-changed'].forEach(ev=>window.addEventListener(ev,refresh));
[100,400,900,1600,3000].forEach(ms=>setTimeout(refresh,ms));
raf=requestAnimationFrame(render);window.HappyHoloSupportForcedRig={refresh};
console.log('[HAPPYHOLO] support forced rig renderer V2 loaded');
})();
