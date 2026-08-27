/* HappyHolo V3.5.4 — composition avancée + suivi automatique du fond
   - aperçu sticky animé
   - sujet : zoom/X/Y + rotation H/V
   - objet de fond peint au doigt/Pencil
   - objet de fond lié au sujet avec suivi automatique en phase
*/
(() => {
'use strict';
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bg=window.HappyHoloCustomBackground;
const placement=window.HappyHoloSubjectPlacement;
if(!bg?.state||!placement?.state)return;
const state=bg.state;
state.subject.yaw=Number(state.subject.yaw)||0;
state.subject.pitch=Number(state.subject.pitch)||0;
state.subject.motionYaw=Number(state.subject.motionYaw)||6;
state.subject.motionPitch=Number(state.subject.motionPitch)||3;
state.bgObject=Object.assign({
 enabled:false,slot:'a',strokes:[],bbox:null,zoom:100,x:0,y:0,yaw:0,pitch:0,
 follow:true,followStrength:45,driver:'subject'
},state.bgObject||{});

/* ---------- utilitaires rendu ---------- */
const originalRect=placement.rect;
function subjectBaseRect(img,W,H,rect={x:0,y:0,w:W,h:H}){
 return originalRect(img,W,H,rect);
}
placement.rect=function(img,W,H,rect={x:0,y:0,w:W,h:H}){
 const r=subjectBaseRect(img,W,H,rect);
 const yaw=clamp(Number(state.subject.yaw)||0,-12,12)*Math.PI/180;
 const pitch=clamp(Number(state.subject.pitch)||0,-10,10)*Math.PI/180;
 const w=r.w*Math.max(.88,Math.cos(yaw));
 const h=r.h*Math.max(.90,Math.cos(pitch));
 return{x:r.x+(r.w-w)/2,y:r.y+(r.h-h)/2,w,h};
};
const oldSig=placement.signature;
placement.signature=()=>`${oldSig?oldSig():''}|${state.subject.yaw}|${state.subject.pitch}|${state.subject.motionYaw}|${state.subject.motionPitch}`;
placement.serialize=()=>({zoom:state.subject.zoom,x:state.subject.x,y:state.subject.y,yaw:state.subject.yaw,pitch:state.subject.pitch,motionYaw:state.subject.motionYaw,motionPitch:state.subject.motionPitch});

function slotFor(norm){
 if(state.mode==='fixedA')return state.a;
 if(state.mode==='fixedB')return state.b;
 if(state.mode==='flipAB')return Number(norm||0)<=0?state.a:state.b;
 return null;
}
function displayedRect(slot,rect){
 const img=slot?.img;if(!img)return null;
 const iw=img.naturalWidth||img.width||1,ih=img.naturalHeight||img.height||1;
 const base=slot.fit==='contain'?Math.min(rect.w/iw,rect.h/ih):Math.max(rect.w/iw,rect.h/ih);
 const scale=base*(clamp(Number(slot.zoom)||100,50,200)/100);
 const w=iw*scale,h=ih*scale;
 return{x:rect.x+(rect.w-w)/2+(Number(slot.x)||0)/100*rect.w*.5,y:rect.y+(rect.h-h)/2+(Number(slot.y)||0)/100*rect.h*.5,w,h,iw,ih};
}
function driverFactor(){
 const plan=Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:[];
 if(!plan.length)return 1;
 const sel=plan.find((_,i)=>String(i+1)===String(state.bgObject.driver))||plan[0];
 const intensity=clamp(Number(sel?.intensity)||50,10,100)/50;
 const depth=clamp(Number(sel?.depth)||.48,.02,.8)/.48;
 return clamp((intensity*.55+depth*.45),.45,1.7);
}
function followMotion(norm,rect){
 const o=state.bgObject;
 if(!o.follow)return{x:0,y:0,yaw:0,pitch:0};
 const strength=clamp(Number(o.followStrength)||45,0,100)/100;
 const factor=driverFactor();
 const phase=Number(norm)||0;
 /* en phase avec le sujet, mais nettement atténué */
 return{
   x: phase*rect.w*.028*strength*factor,
   y: phase*rect.h*.010*strength*factor,
   yaw: phase*clamp(Number(state.subject.motionYaw)||6,0,12)*.48*strength*factor,
   pitch: phase*clamp(Number(state.subject.motionPitch)||3,0,8)*.36*strength*factor
 };
}

const oldBgDraw=bg.draw;
bg.draw=function(ctx,norm,W,H,rect={x:0,y:0,w:W,h:H}){
 const ok=oldBgDraw(ctx,norm,W,H,rect);
 const o=state.bgObject,slot=slotFor(norm);
 if(!ok||!o.enabled||!Array.isArray(o.strokes)||!o.strokes.length||!slot?.img)return ok;
 if((o.slot==='a'&&slot!==state.a)||(o.slot==='b'&&slot!==state.b))return ok;
 const dr=displayedRect(slot,rect);if(!dr)return ok;

 const obj=document.createElement('canvas');obj.width=W;obj.height=H;
 const ox=obj.getContext('2d');ox.drawImage(slot.img,dr.x,dr.y,dr.w,dr.h);
 const mask=document.createElement('canvas');mask.width=W;mask.height=H;
 const mx=mask.getContext('2d');mx.lineCap='round';mx.lineJoin='round';mx.strokeStyle='#fff';mx.fillStyle='#fff';
 for(const st of o.strokes){
   const pts=st.points||[];if(!pts.length)continue;
   mx.save();mx.globalCompositeOperation=st.erase?'destination-out':'source-over';
   mx.lineWidth=Math.max(3,(Number(st.size)||.025)*Math.max(dr.w,dr.h));
   mx.beginPath();const p0=pts[0];mx.moveTo(dr.x+p0[0]*dr.w,dr.y+p0[1]*dr.h);
   if(pts.length===1){mx.arc(dr.x+p0[0]*dr.w,dr.y+p0[1]*dr.h,mx.lineWidth/2,0,Math.PI*2);mx.fill();}
   else{for(let i=1;i<pts.length;i++){const p=pts[i];mx.lineTo(dr.x+p[0]*dr.w,dr.y+p[1]*dr.h);}mx.stroke();}
   mx.restore();
 }
 ox.globalCompositeOperation='destination-in';ox.drawImage(mask,0,0);ox.globalCompositeOperation='source-over';

 const b=o.bbox||{x:.25,y:.25,w:.5,h:.5};
 const bx=dr.x+b.x*dr.w,by=dr.y+b.y*dr.h,bw=b.w*dr.w,bh=b.h*dr.h;
 const follow=followMotion(norm,rect);
 const cx=bx+bw/2+(Number(o.x)||0)/100*rect.w*.35+follow.x;
 const cy=by+bh/2+(Number(o.y)||0)/100*rect.h*.35+follow.y;
 const zoom=clamp(Number(o.zoom)||100,60,160)/100;
 const yaw=(clamp(Number(o.yaw)||0,-15,15)+follow.yaw)*Math.PI/180;
 const pitch=(clamp(Number(o.pitch)||0,-12,12)+follow.pitch)*Math.PI/180;
 ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();ctx.translate(cx,cy);
 ctx.transform(Math.max(.84,Math.cos(yaw))*zoom,Math.tan(pitch)*.10,Math.tan(yaw)*.12,Math.max(.86,Math.cos(pitch))*zoom,0,0);
 ctx.translate(-(bx+bw/2),-(by+bh/2));ctx.drawImage(obj,0,0);ctx.restore();
 return ok;
};

/* ---------- rendu avancé pour vignette et appels externes ---------- */
const baseRender=window.renderAt;
function fitCover(img,W,H){const iw=img?.naturalWidth||img?.width||1,ih=img?.naturalHeight||img?.height||1,s=Math.max(W/iw,H/ih);return{x:(W-iw*s)/2,y:(H-ih*s)/2,w:iw*s,h:ih*s};}
function advancedRender(norm,target){
 const rs=window.HappyHoloReliefState;if(!rs?.subjectImg||!rs?.backgroundImg||!target)return baseRender?.(norm,target);
 const x=target.getContext('2d'),W=target.width,H=target.height;x.clearRect(0,0,W,H);
 const amplitude=Number($('#angle')?.value||7)/4,bgK=Number($('#bgDepth')?.value||.10)/.10,subK=Number($('#subjectDepth')?.value||.48)/.30,protect=Number($('#edgeProtect')?.value||84)/100;
 const custom=bg.draw?.(x,norm,W,H,{x:0,y:0,w:W,h:H});
 if(!custom){const fb=fitCover(rs.backgroundImg,W,H),shift=norm*6*amplitude*bgK;x.drawImage(rs.backgroundImg,fb.x+shift,fb.y,fb.w,fb.h);}
 const textDepth=Number(window.happyHoloTextLayer?.depth)||0;if(textDepth<0)window.HappyHoloTextLayer?.draw?.(x,norm,{x:0,y:0,w:W,h:H});

 const tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;const tx=tmp.getContext('2d');
 const r=subjectBaseRect(rs.subjectImg,W,H,{x:0,y:0,w:W,h:H});
 const phase=Number(norm)||0;
 const yaw=(clamp(Number(state.subject.yaw)||0,-12,12)+phase*clamp(Number(state.subject.motionYaw)||6,0,12))*Math.PI/180;
 const pitch=(clamp(Number(state.subject.pitch)||0,-10,10)+phase*clamp(Number(state.subject.motionPitch)||3,0,8))*Math.PI/180;
 const cx=r.x+r.w/2,cy=r.y+r.h/2;
 tx.save();tx.translate(cx,cy);tx.transform(Math.max(.84,Math.cos(yaw)),Math.tan(pitch)*.08,Math.tan(yaw)*.10,Math.max(.87,Math.cos(pitch)),0,0);tx.drawImage(rs.subjectImg,-r.w/2,-r.h/2,r.w,r.h);tx.restore();

 const subShift=phase*18*amplitude*subK,strips=96;let depthData=null,dw=0,dh=0;
 try{const dc=rs.subjectDepthCanvas,dctx=dc.getContext('2d',{willReadFrequently:true});depthData=dctx.getImageData(0,0,dc.width,dc.height).data;dw=dc.width;dh=dc.height;}catch(_){}
 for(let i=0;i<strips;i++){
   const sx=Math.floor(i*W/strips),ex=Math.floor((i+1)*W/strips),ww=Math.max(1,ex-sx);let d=.5;
   if(depthData){const dx=Math.min(dw-1,Math.floor((i+.5)/strips*dw)),dy=Math.floor(dh*.52);d=depthData[(dy*dw+dx)*4]/255;}
   const local=(d-.5)*2,internal=subShift*local*(.10*(1-protect)+.025);x.drawImage(tmp,sx,0,ww,H,sx+subShift+internal,0,ww+1,H);
 }
 x.globalAlpha=.24+protect*.28;x.drawImage(tmp,subShift,0);x.globalAlpha=1;
 if(textDepth>=0)window.HappyHoloTextLayer?.draw?.(x,norm,{x:0,y:0,w:W,h:H});
}
window.renderAt=advancedRender;

/* ---------- UI ---------- */
let preview=null,previewRAF=0,previewLoop=0,previewT0=0;
function requestPreview(){if(previewRAF)return;previewRAF=requestAnimationFrame(()=>{previewRAF=0;if(preview)advancedRender(0,preview);});}
function startStickyAnimation(){cancelAnimationFrame(previewLoop);previewT0=performance.now();const loop=t=>{if(preview&&window.HappyHoloReliefState){const n=Math.sin((t-previewT0)/4200*Math.PI*2);advancedRender(n,preview);}previewLoop=requestAnimationFrame(loop);};previewLoop=requestAnimationFrame(loop);}
function notify(){window.dispatchEvent(new CustomEvent('happyholo-background-changed'));window.dispatchEvent(new CustomEvent('happyholo-subject-placement-changed'));requestPreview();}
function control(label,min,max,value,onInput,suffix='°'){
 const wrap=document.createElement('label');wrap.style.cssText='display:grid;grid-template-columns:165px 1fr 52px;align-items:center;gap:8px;font-size:12px;font-weight:700';
 const t=document.createElement('span');t.textContent=label;const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step='1';i.value=value;
 const out=document.createElement('b');out.textContent=`${value}${suffix}`;out.style.textAlign='right';i.addEventListener('input',()=>{out.textContent=`${i.value}${suffix}`;onInput(Number(i.value));notify();});wrap._input=i;wrap._out=out;wrap.append(t,i,out);return wrap;
}
const host=$('#happyHoloCustomBackgrounds');if(!host)return;
let subjectCard=null;for(const div of host.querySelectorAll('div')){if(div.firstElementChild?.tagName==='B'&&div.firstElementChild.textContent.trim()==='Placement du sujet détouré'){subjectCard=div.parentElement;break;}}
if(subjectCard){
 const yaw=control('Rotation horizontale',-12,12,state.subject.yaw,v=>state.subject.yaw=v);
 const pitch=control('Rotation verticale',-10,10,state.subject.pitch,v=>state.subject.pitch=v);
 const motionYaw=control('Amplitude rotation H',0,12,state.subject.motionYaw,v=>state.subject.motionYaw=v);
 const motionPitch=control('Amplitude rotation V',0,8,state.subject.motionPitch,v=>state.subject.motionPitch=v);
 const reset=subjectCard.querySelector('button');for(const c of[yaw,pitch,motionYaw,motionPitch]){if(reset)subjectCard.insertBefore(c,reset);else subjectCard.append(c);}
 reset?.addEventListener('click',()=>{state.subject.yaw=0;state.subject.pitch=0;state.subject.motionYaw=6;state.subject.motionPitch=3;[[yaw,0],[pitch,0],[motionYaw,6],[motionPitch,3]].forEach(([c,v])=>{c._input.value=String(v);c._out.textContent=`${v}°`;});notify();});
}
const dock=document.createElement('div');dock.id='happyHoloStickyPreview';dock.style.cssText='position:sticky;top:78px;z-index:50;width:min(320px,42vw);margin:10px 0 12px auto;background:#17171a;border:2px solid #fff;border-radius:15px;padding:8px;box-shadow:0 8px 28px #0005';dock.innerHTML='<div style="color:#fff;font-size:12px;font-weight:850;margin:0 0 6px">Aperçu en direct — mouvement automatique</div>';
preview=document.createElement('canvas');preview.width=360;preview.height=480;preview.style.cssText='width:100%;height:auto;max-height:38vh;display:block;background:#111;border-radius:10px;object-fit:contain';dock.appendChild(preview);host.insertBefore(dock,subjectCard||host.firstElementChild?.nextSibling||null);

const objCard=document.createElement('div');objCard.style.cssText='margin-top:12px;border:2px solid #444;border-radius:14px;padding:12px;display:grid;gap:9px;background:#f8f8f8';objCard.innerHTML='<div><b>Objet du fond</b><div style="font-size:11px;color:#666;margin-top:3px">Peins le canapé ou l’objet au doigt/Pencil. Le suivi automatique le fait bouger en phase avec le sujet, mais avec une amplitude atténuée.</div></div>';
const slotSel=document.createElement('select');slotSel.style.cssText='width:100%;padding:9px;border:1px solid #bbb;border-radius:9px;background:#fff';slotSel.append(new Option('Objet dans le fond A','a'),new Option('Objet dans le fond B','b'));slotSel.value=state.bgObject.slot;
const choose=document.createElement('button');choose.type='button';choose.textContent='✏️ Peindre l’objet dans le fond';choose.style.cssText='padding:10px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:850';
const status=document.createElement('div');status.style.cssText='font-size:11px;color:#666';status.textContent=state.bgObject.strokes?.length?'✓ Objet sélectionné':'Aucun objet sélectionné';
const followRow=document.createElement('label');followRow.style.cssText='display:flex;align-items:center;gap:10px;font-size:12px;font-weight:800';const followCheck=document.createElement('input');followCheck.type='checkbox';followCheck.checked=!!state.bgObject.follow;followRow.append(followCheck,document.createTextNode('Suivre automatiquement le sujet'));
const driver=document.createElement('select');driver.style.cssText='width:100%;padding:9px;border:1px solid #bbb;border-radius:9px;background:#fff';
function refreshDrivers(){const current=String(state.bgObject.driver||'subject');driver.innerHTML='';driver.append(new Option('Sujet principal','subject'));const plan=Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:[];plan.forEach((s,i)=>driver.append(new Option(s.name||`Sélection ${i+1}`,String(i+1))));driver.value=[...driver.options].some(o=>o.value===current)?current:'subject';}
refreshDrivers();
const followStrength=control('Intensité du suivi',0,100,state.bgObject.followStrength,v=>state.bgObject.followStrength=v,'%');
const zoom=control('Zoom objet',60,160,state.bgObject.zoom,v=>state.bgObject.zoom=v,'%');const ox=control('Objet horizontal',-50,50,state.bgObject.x,v=>state.bgObject.x=v,'%');const oy=control('Objet vertical',-50,50,state.bgObject.y,v=>state.bgObject.y=v,'%');const oyaw=control('Pivot horizontal',-15,15,state.bgObject.yaw,v=>state.bgObject.yaw=v);const opitch=control('Pivot vertical',-12,12,state.bgObject.pitch,v=>state.bgObject.pitch=v);
const clear=document.createElement('button');clear.type='button';clear.textContent='Supprimer la sélection objet';clear.style.cssText='padding:9px;border:1px solid #aaa;border-radius:9px;background:#eee;color:#111;font-weight:800';objCard.append(slotSel,choose,status,followRow,driver,followStrength,zoom,ox,oy,oyaw,opitch,clear);host.appendChild(objCard);
slotSel.addEventListener('change',()=>{state.bgObject.slot=slotSel.value;notify();});followCheck.addEventListener('change',()=>{state.bgObject.follow=followCheck.checked;notify();});driver.addEventListener('change',()=>{state.bgObject.driver=driver.value;notify();});clear.addEventListener('click',()=>{state.bgObject.enabled=false;state.bgObject.strokes=[];state.bgObject.bbox=null;status.textContent='Aucun objet sélectionné';notify();});window.addEventListener('happyholo:selection-plan',refreshDrivers);

function recomputeBBox(strokes){const pts=strokes.filter(s=>!s.erase).flatMap(s=>s.points||[]);if(!pts.length)return null;let minX=1,minY=1,maxX=0,maxY=0;for(const p of pts){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}const pad=.025;return{x:clamp(minX-pad,0,1),y:clamp(minY-pad,0,1),w:clamp(maxX-minX+pad*2,.02,1),h:clamp(maxY-minY+pad*2,.02,1)};}
function paintObject(){
 const slot=state[state.bgObject.slot];if(!slot?.img){alert(`Charge d’abord le fond ${state.bgObject.slot.toUpperCase()}.`);return;}
 const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;z-index:1000010;background:#09090bf2;display:flex;flex-direction:column;color:#fff';
 const top=document.createElement('div');top.style.cssText='padding:10px;display:flex;gap:8px;align-items:center;background:#17171a;flex-wrap:wrap';const title=document.createElement('b');title.textContent='Peindre l’objet du fond';title.style.flex='1';
 const add=document.createElement('button');add.textContent='＋ Ajouter';const erase=document.createElement('button');erase.textContent='⌫ Gomme';const cancel=document.createElement('button');cancel.textContent='Annuler';const ok=document.createElement('button');ok.textContent='✓ Valider';for(const b of[add,erase,cancel,ok])b.style.cssText='padding:9px 12px;border-radius:9px;border:1px solid #555;font-weight:800';add.style.background='#087544';add.style.color='#fff';erase.style.background='#333';erase.style.color='#fff';ok.style.background='#0a84ff';ok.style.color='#fff';top.append(title,add,erase,cancel,ok);
 const brush=document.createElement('input');brush.type='range';brush.min='8';brush.max='100';brush.value='36';brush.style.cssText='width:180px;max-width:35vw';top.append(brush);
 const c=document.createElement('canvas');c.style.cssText='flex:1;min-height:0;width:100%;background:#111;touch-action:none';modal.append(top,c);document.body.appendChild(modal);
 requestAnimationFrame(()=>{
   const rr=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);c.width=Math.round(rr.width*d);c.height=Math.round(rr.height*d);const x=c.getContext('2d');const im=slot.img,iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,sc=Math.min(c.width/iw,c.height/ih),w=iw*sc,h=ih*sc,ix=(c.width-w)/2,iy=(c.height-h)/2;
   let strokes=(state.bgObject.strokes||[]).map(s=>({erase:!!s.erase,size:Number(s.size)||.025,points:(s.points||[]).map(p=>[p[0],p[1]])})),active=null,eraseMode=false;
   const draw=()=>{x.clearRect(0,0,c.width,c.height);x.drawImage(im,ix,iy,w,h);for(const st of strokes){const pts=st.points||[];if(!pts.length)continue;x.save();x.lineCap='round';x.lineJoin='round';x.strokeStyle=st.erase?'rgba(255,70,80,.85)':'rgba(0,229,255,.7)';x.fillStyle=x.strokeStyle;x.lineWidth=Math.max(3,st.size*Math.max(w,h));x.beginPath();const p0=pts[0];x.moveTo(ix+p0[0]*w,iy+p0[1]*h);if(pts.length===1){x.arc(ix+p0[0]*w,iy+p0[1]*h,x.lineWidth/2,0,Math.PI*2);x.fill();}else{for(let i=1;i<pts.length;i++){const p=pts[i];x.lineTo(ix+p[0]*w,iy+p[1]*h);}x.stroke();}x.restore();}};draw();
   const point=e=>{const r=c.getBoundingClientRect(),px=(e.clientX-r.left)*c.width/r.width,py=(e.clientY-r.top)*c.height/r.height;return[clamp((px-ix)/w,0,1),clamp((py-iy)/h,0,1)];};
   add.onclick=()=>{eraseMode=false;add.style.background='#087544';erase.style.background='#333';};erase.onclick=()=>{eraseMode=true;erase.style.background='#8b2732';add.style.background='#333';};
   c.onpointerdown=e=>{e.preventDefault();c.setPointerCapture?.(e.pointerId);active={erase:eraseMode,size:Number(brush.value)/Math.max(w,h),points:[point(e)]};strokes.push(active);draw();};
   c.onpointermove=e=>{if(!active)return;e.preventDefault();const q=point(e),last=active.points[active.points.length-1];if(Math.hypot((q[0]-last[0])*w,(q[1]-last[1])*h)>1.5){active.points.push(q);draw();}};c.onpointerup=c.onpointercancel=()=>{active=null;};
   cancel.onclick=()=>modal.remove();ok.onclick=()=>{const bbox=recomputeBBox(strokes);if(!bbox){alert('Peins d’abord l’objet.');return;}state.bgObject.strokes=strokes;state.bgObject.bbox=bbox;state.bgObject.enabled=true;status.textContent='✓ Objet sélectionné';modal.remove();notify();};
 });
}
choose.addEventListener('click',paintObject);
window.addEventListener('happyholo-relief-ready',()=>{requestPreview();startStickyAnimation();});window.addEventListener('happyholo-background-changed',requestPreview);window.addEventListener('happyholo-subject-placement-changed',requestPreview);
if(window.innerWidth<760){dock.style.width='min(260px,55vw)';dock.style.top='68px';}
requestPreview();startStickyAnimation();
console.log('[HAPPYHOLO] composition avancée V3.5.4 suivi automatique sujet/fond actif');
})();
