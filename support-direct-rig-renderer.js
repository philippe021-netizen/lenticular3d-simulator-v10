/* HappyHolo — rendu direct des actions articulées dans les supports.
   Ne dépend pas du plan yaw3d. Couvre porte-clé / médaillon / carte avec
   le rendu V3.27 validé : tête, pivot tête, déhanché, salut bras.
*/
(()=>{
'use strict';
let overlay=null,ctx=null,raf=0,start=0,last=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function activeRig(){
  const r=window.HappyHoloActionLocal;
  return !!(r?.enabled&&r?.ready&&typeof r.renderSubject==='function'&&window.HappyHoloReliefState?.subjectImg);
}
function ensureOverlay(){
  const base=document.getElementById('supportCanvas');
  const win=base?.closest('.image-window');
  if(!base||!win)return false;
  if(overlay&&overlay.isConnected)return true;
  win.style.position='relative';
  overlay=document.createElement('canvas');
  overlay.id='hhSupportDirectRigCanvas';
  overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none;z-index:8';
  win.appendChild(overlay);
  ctx=overlay.getContext('2d');
  return true;
}
function syncSize(){
  const base=document.getElementById('supportCanvas');
  if(!base||!overlay)return;
  const w=Math.max(2,base.width||Math.round(base.getBoundingClientRect().width*(devicePixelRatio||1)));
  const h=Math.max(2,base.height||Math.round(base.getBoundingClientRect().height*(devicePixelRatio||1)));
  if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}
}
function coverRect(sw,sh,dw,dh){const k=Math.max(dw/sw,dh/sh);const w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}
function containRect(sw,sh,dw,dh){const k=Math.min(dw/sw,dh/sh);const w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}
function supportPlacement(img,W,H){
  const full={x:0,y:0,w:W,h:H};
  let r=window.HappyHoloSubjectPlacement?.rect?.(img,W,H,full)||containRect(img.naturalWidth||1,img.naturalHeight||1,W,H);
  const zoom=clamp(Number(document.getElementById('supportZoom')?.value||100),60,180)/100;
  const px=clamp(Number(document.getElementById('supportX')?.value||0),-50,50)/100;
  const py=clamp(Number(document.getElementById('supportY')?.value||0),-50,50)/100;
  const nw=r.w*zoom,nh=r.h*zoom;
  r={x:r.x+(r.w-nw)/2+px*W*.5,y:r.y+(r.h-nh)/2+py*H*.5,w:nw,h:nh};
  return r;
}
function drawBackground(rs,W,H,phase){
  const full={x:0,y:0,w:W,h:H};
  if(window.HappyHoloCustomBackground?.draw?.(ctx,phase,W,H,full))return;
  const bg=rs.backgroundImg||rs.sourceImg;
  if(!bg)return;
  const r=coverRect(bg.naturalWidth||1,bg.naturalHeight||1,W,H);
  const shift=phase*2.5;
  ctx.drawImage(bg,r.x+shift,r.y,r.w,r.h);
}
function drawText(phase,rect){
  try{window.HappyHoloTextLayer?.draw?.(ctx,phase,rect);}catch(_){ }
}
function render(ts){
  raf=requestAnimationFrame(render);
  if(ts-last<32)return; last=ts;
  if(!ensureOverlay())return;
  if(!activeRig()){
    overlay.style.display='none'; start=0; return;
  }
  overlay.style.display='block';
  syncSize();
  if(!start)start=ts;
  const W=overlay.width,H=overlay.height,rs=window.HappyHoloReliefState,rig=window.HappyHoloActionLocal;
  const speed=Math.max(2,Number(document.getElementById('supportSpeed')?.value||5));
  const phase=Math.sin((ts-start)/(speed*1000)*Math.PI*2);
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);
  drawBackground(rs,W,H,phase);
  const img=rs.subjectImg;
  const iw=420, ih=Math.max(2,Math.round(iw*((img.naturalHeight||1)/(img.naturalWidth||1))));
  let frame=null;
  try{frame=rig.renderSubject(img,iw,ih,phase);}catch(e){console.warn('[HAPPYHOLO] direct rig render',e);}
  if(frame){
    const r=supportPlacement(img,W,H);
    const parallax=phase*5;
    ctx.drawImage(frame,r.x+parallax,r.y,r.w,r.h);
    drawText(phase,r);
  }
}
function refresh(){
  ensureOverlay();
  if(activeRig()){overlay.style.display='block';start=0;}else if(overlay)overlay.style.display='none';
}
window.addEventListener('happyholo-action-plan-changed',refresh);
window.addEventListener('happyholo-relief-ready',refresh);
window.addEventListener('happyholo-subject-placement-changed',refresh);
window.addEventListener('resize',refresh);
[300,800,1500,2800].forEach(ms=>setTimeout(refresh,ms));
raf=requestAnimationFrame(render);
window.HappyHoloSupportDirectRig={refresh};
console.log('[HAPPYHOLO] direct support rig renderer loaded');
})();
