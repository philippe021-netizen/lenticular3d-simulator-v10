/* HappyHolo V3.27 — Action Local intégrée
   100 % local. Rig simple personne, 8 points, 4 micro-actions.
*/
(() => {
'use strict';

const state = {
  enabled:false,
  ready:false,
  subjectImg:null,
  action:'headTilt',
  intensity:0.45,
  softness:0.55,
  points:null,
  editorOpen:false
};
window.HappyHoloActionLocal = state;

const NAMES=['Tête','Cou','Épaule G','Épaule D','Main G','Main D','Bassin','Pieds'];
let overlay, panel, canvas, ctx, dragging=-1, box=null;

function fitContain(i,W,H){
  const r=Math.min(W/i.naturalWidth,H/i.naturalHeight);
  const w=i.naturalWidth*r,h=i.naturalHeight*r;
  return {x:(W-w)/2,y:(H-h)/2,w,h,r};
}
function fitCover(i,W,H){
  const r=Math.max(W/i.naturalWidth,H/i.naturalHeight);
  const w=i.naturalWidth*r,h=i.naturalHeight*r;
  return {x:(W-w)/2,y:(H-h)/2,w,h,r};
}
function defaultPoints(b){
  const P=(x,y)=>({x:b.x+x*b.w,y:b.y+y*b.h});
  return [
    P(.50,.17),P(.50,.27),P(.38,.31),P(.62,.31),
    P(.27,.53),P(.73,.53),P(.50,.58),P(.50,.91)
  ];
}
function normalizedPointsFromEditor(){
  if(!box||!state.points)return null;
  return state.points.map(p=>({
    x:(p.x-box.x)/box.w,
    y:(p.y-box.y)/box.h
  }));
}
function editorPointsFromNormalized(norm,b){
  return norm.map(p=>({x:b.x+p.x*b.w,y:b.y+p.y*b.h}));
}

function injectUI(){
  if(document.getElementById('hhActionLocalButton')) return;
  const build=document.getElementById('build');
  if(!build) return;

  const wrap=document.createElement('div');
  wrap.id='hhActionLocalCard';
  wrap.style.cssText='margin-top:14px;padding:12px;border:2px solid #111;border-radius:14px;background:#fafafa';
  wrap.innerHTML=`
    <div style="font-size:14px;font-weight:900;margin-bottom:6px">Action locale — hors ligne</div>
    <div style="font-size:12px;color:#555;line-height:1.4">Après création du relief, place 8 points sur la personne puis choisis une micro-action. Elle sera intégrée aux 9 vues.</div>
    <button id="hhActionLocalButton" type="button" class="secondary" disabled>Configurer l’action locale</button>
    <button id="hhActionLocalToggle" type="button" class="secondary" disabled>Action : désactivée</button>
    <div id="hhActionLocalSummary" style="font-size:12px;margin-top:8px;color:#555">Aucune action configurée.</div>`;
  build.parentNode.insertBefore(wrap, build.nextSibling);

  document.getElementById('hhActionLocalButton').addEventListener('click',openEditor);
  document.getElementById('hhActionLocalToggle').addEventListener('click',()=>{
    if(!state.ready) return;
    state.enabled=!state.enabled;
    updateSummary();
  });

  createEditor();
}

function createEditor(){
  overlay=document.createElement('div');
  overlay.id='hhActionOverlay';
  overlay.style.cssText='display:none;position:fixed;inset:0;z-index:100000;background:#000b;padding:10px;overflow:auto';
  overlay.innerHTML=`
  <div id="hhActionPanel" style="max-width:1000px;margin:0 auto;background:#fff;border-radius:18px;padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div><div style="font-size:20px;font-weight:900">Action locale — Personne</div>
      <div style="font-size:12px;color:#666">Déplace les 8 points au doigt ou à l’Apple Pencil.</div></div>
      <button id="hhActionClose" type="button" class="secondary">Fermer</button>
    </div>
    <div style="display:grid;grid-template-columns:minmax(250px,320px) 1fr;gap:14px;margin-top:12px" id="hhActionGrid">
      <div>
        <label>Action</label>
        <select id="hhActionSelect" style="width:100%;padding:10px;border:1px solid #bbb;border-radius:10px;background:white">
          <option value="headTilt">Inclinaison de tête</option>
          <option value="headTurn">Petit pivot de tête</option>
          <option value="torso">Léger pivot du buste</option>
          <option value="wave">Salut — bras droit</option>
        </select>
        <label>Intensité <b id="hhActionIntensityOut">45%</b></label>
        <input id="hhActionIntensity" type="range" min="10" max="100" value="45" step="1" style="width:100%">
        <label>Souplesse <b id="hhActionSoftnessOut">55%</b></label>
        <input id="hhActionSoftness" type="range" min="25" max="90" value="55" step="1" style="width:100%">
        <button id="hhActionReset" type="button" class="secondary">Replacer les points</button>
        <button id="hhActionPreview" type="button">Aperçu</button>
        <button id="hhActionApply" type="button">Valider l’action</button>
        <div id="hhActionPointList" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:10px;font-size:11px"></div>
      </div>
      <div style="background:#222;border-radius:14px;overflow:hidden;min-width:0">
        <canvas id="hhActionCanvas" width="900" height="900" style="width:100%;height:auto;display:block;touch-action:none"></canvas>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const style=document.createElement('style');
  style.textContent='@media(max-width:800px){#hhActionGrid{grid-template-columns:1fr!important}#hhActionOverlay{padding:4px!important}}';
  document.head.appendChild(style);

  panel=overlay.querySelector('#hhActionPanel');
  canvas=overlay.querySelector('#hhActionCanvas');
  ctx=canvas.getContext('2d');

  overlay.querySelector('#hhActionPointList').innerHTML=NAMES.map((n,i)=>`<div style="background:#f2f2f2;border-radius:7px;padding:5px"><b>${i+1}</b> ${n}</div>`).join('');

  overlay.querySelector('#hhActionClose').addEventListener('click',closeEditor);
  overlay.querySelector('#hhActionReset').addEventListener('click',resetEditorPoints);
  overlay.querySelector('#hhActionApply').addEventListener('click',applyEditor);
  overlay.querySelector('#hhActionPreview').addEventListener('click',previewEditor);

  overlay.querySelector('#hhActionSelect').addEventListener('change',e=>{state.action=e.target.value;drawEditor();});
  overlay.querySelector('#hhActionIntensity').addEventListener('input',e=>{
    state.intensity=Number(e.target.value)/100;
    overlay.querySelector('#hhActionIntensityOut').textContent=e.target.value+'%';
  });
  overlay.querySelector('#hhActionSoftness').addEventListener('input',e=>{
    state.softness=Number(e.target.value)/100;
    overlay.querySelector('#hhActionSoftnessOut').textContent=e.target.value+'%';
  });

  canvas.addEventListener('pointerdown',e=>{
    if(!state.subjectImg)return;
    const p=eventPos(e); dragging=nearestPoint(p);
    if(dragging>=0){ canvas.setPointerCapture?.(e.pointerId); drawEditor(); }
  });
  canvas.addEventListener('pointermove',e=>{
    if(dragging<0)return;
    const p=eventPos(e);
    state.points[dragging]=p;
    drawEditor();
  });
  canvas.addEventListener('pointerup',()=>{dragging=-1;drawEditor();});
  canvas.addEventListener('pointercancel',()=>{dragging=-1;drawEditor();});
}

function openEditor(){
  const rs=window.HappyHoloReliefState;
  if(!rs?.subjectImg) return;
  state.subjectImg=rs.subjectImg;
  const ratio=state.subjectImg.naturalWidth/state.subjectImg.naturalHeight;
  if(ratio>=1){canvas.width=900;canvas.height=Math.max(500,Math.round(900/ratio));}
  else {canvas.height=900;canvas.width=Math.max(500,Math.round(900*ratio));}
  box=fitContain(state.subjectImg,canvas.width,canvas.height);
  if(state.normalizedPoints) state.points=editorPointsFromNormalized(state.normalizedPoints,box);
  else state.points=defaultPoints(box);

  overlay.querySelector('#hhActionSelect').value=state.action;
  overlay.querySelector('#hhActionIntensity').value=Math.round(state.intensity*100);
  overlay.querySelector('#hhActionSoftness').value=Math.round(state.softness*100);
  overlay.querySelector('#hhActionIntensityOut').textContent=Math.round(state.intensity*100)+'%';
  overlay.querySelector('#hhActionSoftnessOut').textContent=Math.round(state.softness*100)+'%';

  overlay.style.display='block';
  state.editorOpen=true;
  drawEditor();
}
function closeEditor(){
  overlay.style.display='none'; state.editorOpen=false;
}
function resetEditorPoints(){
  if(!box)return; state.points=defaultPoints(box);drawEditor();
}
function applyEditor(){
  state.normalizedPoints=normalizedPointsFromEditor();
  state.ready=true;
  state.enabled=true;
  closeEditor();
  updateSummary();
}
function updateSummary(){
  const btn=document.getElementById('hhActionLocalButton');
  const tog=document.getElementById('hhActionLocalToggle');
  const sum=document.getElementById('hhActionLocalSummary');
  if(btn)btn.disabled=!window.HappyHoloReliefState?.subjectImg;
  if(tog){
    tog.disabled=!state.ready;
    tog.textContent='Action : '+(state.enabled?'activée':'désactivée');
    tog.style.background=state.enabled?'#111':'#e8e8e8';
    tog.style.color=state.enabled?'#fff':'#111';
  }
  if(sum){
    if(!state.ready) sum.textContent='Aucune action configurée.';
    else{
      const labels={headTilt:'Inclinaison tête',headTurn:'Pivot tête',torso:'Pivot buste',wave:'Salut bras droit'};
      sum.textContent=`${labels[state.action]} — intensité ${Math.round(state.intensity*100)} % — ${state.enabled?'ACTIVE':'désactivée'}`;
    }
  }
}
function eventPos(e){
  const r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
}
function nearestPoint(p){
  let best=-1,d=42;
  state.points.forEach((q,i)=>{const dd=Math.hypot(p.x-q.x,p.y-q.y);if(dd<d){d=dd;best=i;}});
  return best;
}
function drawEditor(){
  if(!state.subjectImg)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#222';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(state.subjectImg,box.x,box.y,box.w,box.h);
  ctx.save();
  const links=[[0,1],[1,2],[1,3],[2,4],[3,5],[1,6],[6,7]];
  ctx.strokeStyle='#fff';ctx.lineWidth=3;
  links.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(state.points[a].x,state.points[a].y);ctx.lineTo(state.points[b].x,state.points[b].y);ctx.stroke();});
  state.points.forEach((p,i)=>{
    ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);
    ctx.fillStyle=i===dragging?'#fff':'#111';ctx.fill();
    ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.stroke();
    ctx.fillStyle=i===dragging?'#111':'#fff';ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p.x,p.y);
  });
  ctx.restore();
}

function rotVec(p,c,ang){
  const s=Math.sin(ang),co=Math.cos(ang),x=p.x-c.x,y=p.y-c.y;
  return {x:c.x+x*co-y*s,y:c.y+x*s+y*co};
}
function controlsFor(points,t){
  const k=state.intensity;
  const C=[];
  const add=(idx,dx,dy,r=120,w=1)=>C.push({x:points[idx].x,y:points[idx].y,dx,dy,radius:r,weight:w});
  if(state.action==='headTilt'){
    const ang=t*k*0.18;
    const p=rotVec(points[0],points[1],ang);
    add(0,p.x-points[0].x,p.y-points[0].y,125,1.3);
  }else if(state.action==='headTurn'){
    const dx=t*k*28;
    add(0,dx,-Math.abs(t)*k*2,120,1.25);
    add(1,dx*.25,0,90,.75);
  }else if(state.action==='torso'){
    const dx=t*k*24;
    add(1,dx*.25,0,115,.8);
    add(2,-dx*.35,0,130,1);
    add(3,dx*.55,0,130,1);
  }else if(state.action==='wave'){
    /* 9-view friendly: rest -> arm lift, no full cinematic motion */
    const phase=(t+1)/2;
    const lift=phase*k;
    add(5,36*lift,-120*lift,115,1.4);
    add(3,12*lift,-20*lift,125,.85);
  }
  return C;
}
function radialMove(x,y,controls){
  let dx=0,dy=0,wSum=0;
  for(const c of controls){
    const d=Math.hypot(x-c.x,y-c.y);
    const sigma=Math.max(20,state.softness*c.radius);
    const w=Math.exp(-(d*d)/(2*sigma*sigma))*c.weight;
    dx+=c.dx*w;dy+=c.dy*w;wSum+=w;
  }
  return {x:x+dx/(1+0.12*wSum),y:y+dy/(1+0.12*wSum)};
}
function affineTri(target,img,s0,s1,s2,d0,d1,d2){
  const den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(den)<1e-5)return;
  const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const c=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const e=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const d=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const f=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  target.save();
  target.beginPath();target.moveTo(d0.x,d0.y);target.lineTo(d1.x,d1.y);target.lineTo(d2.x,d2.y);target.closePath();target.clip();
  target.setTransform(a,b,c,d,e,f);
  target.drawImage(img,0,0);
  target.restore();
}

/* Returns transparent subject canvas, already fitted to target and deformed for norm -1..1 */
function renderSubject(subjectImg,W,H,norm){
  const out=document.createElement('canvas');out.width=W;out.height=H;
  const x=out.getContext('2d');
  const fit=fitCover(subjectImg,W,H);

  if(!state.enabled||!state.ready||!state.normalizedPoints){
    x.drawImage(subjectImg,fit.x,fit.y,fit.w,fit.h);
    return out;
  }

  const points=state.normalizedPoints.map(p=>({x:fit.x+p.x*fit.w,y:fit.y+p.y*fit.h}));
  const controls=controlsFor(points,norm);

  /* Deform only the subject image's fitted rectangle */
  const cols=26,rows=26;
  const sx=subjectImg.naturalWidth/cols,sy=subjectImg.naturalHeight/rows;
  const dx=fit.w/cols,dy=fit.h/rows;
  function dest(gx,gy){
    const px=fit.x+gx*dx,py=fit.y+gy*dy;
    return radialMove(px,py,controls);
  }
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const s00={x:gx*sx,y:gy*sy},s10={x:(gx+1)*sx,y:gy*sy},s01={x:gx*sx,y:(gy+1)*sy},s11={x:(gx+1)*sx,y:(gy+1)*sy};
    const d00=dest(gx,gy),d10=dest(gx+1,gy),d01=dest(gx,gy+1),d11=dest(gx+1,gy+1);
    affineTri(x,subjectImg,s00,s10,s11,d00,d10,d11);
    affineTri(x,subjectImg,s00,s11,s01,d00,d11,d01);
  }
  x.setTransform(1,0,0,1,0,0);
  return out;
}
state.renderSubject=renderSubject;

let previewRAF=null;
function previewEditor(){
  cancelAnimationFrame(previewRAF);
  const t0=performance.now();
  function loop(now){
    const t=Math.sin((now-t0)/1200*Math.PI*2);
    const tmp=renderSubject(state.subjectImg,canvas.width,canvas.height,t);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#222';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(tmp,0,0);
    if(now-t0<2500) previewRAF=requestAnimationFrame(loop);
    else drawEditor();
  }
  previewRAF=requestAnimationFrame(loop);
}

window.addEventListener('happyholo-relief-ready',()=>{
  const rs=window.HappyHoloReliefState;
  state.subjectImg=rs?.subjectImg||null;
  state.ready=false;state.enabled=false;state.normalizedPoints=null;
  updateSummary();
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',injectUI,{once:true});
else injectUI();

})();