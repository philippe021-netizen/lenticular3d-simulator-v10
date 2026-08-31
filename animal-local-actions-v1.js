/* HappyHolo — actions locales Chat / Chien V1
   Ciblage manuel au Pencil/doigt : tête, oreille, patte, queue.
   Rendu local + support, sans toucher au rig personne.
*/
(()=>{
'use strict';
const ACTIONS={
  animal_head_tilt:{label:'Tête penchée',angle:7},
  animal_ear:{label:'Oreille qui bouge',angle:10},
  animal_paw:{label:'Patte levée'},
  animal_tail:{label:'Queue qui remue',angle:12}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const plan=()=>Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:[];
const notify=()=>window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
function rs(){return window.HappyHoloReliefState||null;}
function activeItem(){return plan().find(s=>ACTIONS[s?.action]&&s?.actionZone?.kind==='paint')||null;}
function cover(sw,sh,dw,dh){const k=Math.max(dw/sw,dh/sh),w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}
function contain(sw,sh,dw,dh){const k=Math.min(dw/sw,dh/sh),w=sw*k,h=sh*k;return{x:(dw-w)/2,y:(dh-h)/2,w,h};}
function paintMask(zone,W,H){
  if(!zone||zone.kind!=='paint'||!Array.isArray(zone.strokes))return null;
  const sourceW=Math.max(1,Number(zone.sourceW)||W),sourceH=Math.max(1,Number(zone.sourceH)||H);
  const sc=Math.max(W/sourceW,H/sourceH),fw=sourceW*sc,fh=sourceH*sc,fx=(W-fw)/2,fy=(H-fh)/2;
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.lineCap='round';x.lineJoin='round';
  for(const st of zone.strokes){const pts=Array.isArray(st.points)?st.points:[];if(!pts.length)continue;x.save();x.globalCompositeOperation=st.erase?'destination-out':'source-over';x.strokeStyle='#fff';x.fillStyle='#fff';const brushSource=(Number(st.size)||.02)*Math.max(sourceW,sourceH);x.lineWidth=Math.max(2,brushSource*sc);const map=p=>[fx+p[0]*fw,fy+p[1]*fh],p0=map(pts[0]);x.beginPath();x.moveTo(p0[0],p0[1]);if(pts.length===1){x.arc(p0[0],p0[1],x.lineWidth/2,0,Math.PI*2);x.fill();}else{for(let i=1;i<pts.length;i++){const q=map(pts[i]);x.lineTo(q[0],q[1]);}x.stroke();}x.restore();}
  return c;
}
function bounds(mask){const W=mask.width,H=mask.height,d=mask.getContext('2d').getImageData(0,0,W,H).data;let minX=W,minY=H,maxX=-1,maxY=-1;for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){if(d[(y*W+x)*4+3]<12)continue;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return maxX<minX?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,cx:(minX+maxX)/2,cy:(minY+maxY)/2};}
function buildFrame(layer,item,phase,W,H){
  const zone=item?.actionZone,mask=paintMask(zone,W,H),b=mask&&bounds(mask);if(!mask||!b)return layer;
  const out=document.createElement('canvas');out.width=W;out.height=H;const ox=out.getContext('2d');ox.drawImage(layer,0,0,W,H);ox.globalCompositeOperation='destination-out';ox.drawImage(mask,0,0);ox.globalCompositeOperation='source-over';
  const part=document.createElement('canvas');part.width=W;part.height=H;const px=part.getContext('2d');px.drawImage(layer,0,0,W,H);px.globalCompositeOperation='destination-in';px.drawImage(mask,0,0);px.globalCompositeOperation='source-over';
  const k=clamp(Number(item.intensity||42)/100,.1,1),t=clamp(Number(phase)||0,-1,1),action=item.action;
  let pivotX=b.cx,pivotY=b.y+b.h*.86,angle=0,dx=0,dy=0;
  if(action==='animal_head_tilt'){angle=t*(ACTIONS[action].angle||7)*k*Math.PI/180;pivotY=b.y+b.h*.88;}
  else if(action==='animal_ear'){const side=b.cx<W/2?-1:1;angle=side*t*(ACTIONS[action].angle||10)*k*Math.PI/180;pivotY=b.y+b.h*.92;}
  else if(action==='animal_paw'){const lift=(t+1)/2;angle=t*4*k*Math.PI/180;dy=-b.h*.18*k*lift;dx=(b.cx<W/2?-1:1)*b.w*.05*k*lift;pivotY=b.y+b.h*.12;}
  else if(action==='animal_tail'){const side=b.cx<W/2?-1:1;angle=-side*t*(ACTIONS[action].angle||12)*k*Math.PI/180;pivotX=side<0?b.x+b.w*.90:b.x+b.w*.10;pivotY=b.cy;}
  ox.save();ox.translate(pivotX+dx,pivotY+dy);ox.rotate(angle);ox.drawImage(part,-pivotX,-pivotY);ox.restore();return out;
}
async function choose(index,action){
  const item=plan()[index];if(!item)return;if(typeof window.HappyHoloChooseActionZone!=='function'){alert('Outil Pencil indisponible. Recharge la page.');return;}
  const labels={animal_head_tilt:'Peins la tête entière à incliner',animal_ear:'Peins uniquement l’oreille à bouger',animal_paw:'Peins la patte à lever',animal_tail:'Peins la queue à faire remuer'};
  const z=await window.HappyHoloChooseActionZone({actionZone:item.action===action?item.actionZone:null,zoneMode:'paint'},labels[action]);if(!z)return;
  if(window.HappyHoloActionLocal?.enabled){window.HappyHoloActionLocal.enabled=false;window.HappyHoloActionLocal.__stopUnifiedPreview?.();}
  item.action=action;item.actionZone=z;item.intensity=action==='animal_ear'?45:action==='animal_tail'?48:40;notify();renderUI();
}
function clear(index){const item=plan()[index];if(!item)return;if(ACTIONS[item.action]){item.action='none';item.actionZone=null;notify();renderUI();}}
function preview(index){
  const item=plan()[index],s=rs(),img=s?.subjectImg;if(!item||!ACTIONS[item.action]||!item.actionZone||!img)return;
  document.getElementById('hhAnimalPreviewModal')?.remove();const m=document.createElement('div');m.id='hhAnimalPreviewModal';m.style.cssText='position:fixed;inset:0;z-index:10000060;background:#000e;display:flex;flex-direction:column;padding:8px';m.innerHTML='<div style="display:flex;gap:8px;align-items:center;color:#fff;padding:5px"><b style="flex:1">🐾 Aperçu animal — '+ACTIONS[item.action].label+'</b><button id="hhAnimalClose" style="padding:9px 12px">Fermer</button></div><canvas id="hhAnimalPreviewCanvas" width="900" height="900" style="max-width:100%;max-height:calc(100vh - 70px);margin:auto;background:#222;touch-action:none"></canvas>';document.body.appendChild(m);const c=m.querySelector('canvas'),x=c.getContext('2d');const ratio=img.naturalWidth/img.naturalHeight;if(ratio>=1)c.height=Math.max(400,Math.round(c.width/ratio));else c.width=Math.max(400,Math.round(c.height*ratio));const base=document.createElement('canvas');base.width=c.width;base.height=c.height;const bx=base.getContext('2d'),f=contain(img.naturalWidth,img.naturalHeight,c.width,c.height);bx.drawImage(img,f.x,f.y,f.w,f.h);let raf=0,t0=performance.now(),run=true;function loop(t){if(!run)return;const p=Math.sin((t-t0)/900*Math.PI*2),fr=buildFrame(base,item,p,c.width,c.height);x.clearRect(0,0,c.width,c.height);x.fillStyle='#222';x.fillRect(0,0,c.width,c.height);x.drawImage(fr,0,0);raf=requestAnimationFrame(loop);}raf=requestAnimationFrame(loop);m.querySelector('#hhAnimalClose').onclick=()=>{run=false;cancelAnimationFrame(raf);m.remove();};
}
function renderUI(){
  const p=plan();let host=document.getElementById('hhAnimalActionsCard');if(!p.length){host?.remove();return;}if(!host){host=document.createElement('section');host.id='hhAnimalActionsCard';host.style.cssText='margin:16px 0;padding:14px;border:2px solid #111;border-radius:16px;background:#fff';const anchor=document.getElementById('happyHoloLocalMiniActions')||document.getElementById('happyHoloSelectionControls');if(!anchor)return;anchor.insertAdjacentElement('afterend',host);}
  host.innerHTML='<div style="font-size:18px;font-weight:900">🐾 Chat / Chien — actions locales</div><div style="font-size:12px;color:#666;margin:5px 0 10px">Choisis la sélection puis peins précisément la partie à animer au Pencil/doigt. Pas de détection automatique fragile.</div>';
  p.forEach((item,i)=>{const row=document.createElement('div');row.style.cssText='padding:10px 0;border-top:'+(i?'1px solid #ddd':'0');const title=document.createElement('div');title.innerHTML='<b>'+(item.name||('Sélection '+(i+1)))+'</b> <span style="font-size:11px;color:#777">'+(ACTIONS[item.action]?('— '+ACTIONS[item.action].label):'— aucune action animal')+'</span>';row.appendChild(title);const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:7px;flex-wrap:wrap;margin-top:8px';Object.entries(ACTIONS).forEach(([a,cfg])=>{const b=document.createElement('button');b.textContent=cfg.label;b.style.cssText='padding:9px 10px;border-radius:10px;border:'+(item.action===a?'2px solid #0a84ff':'1px solid #bbb')+';background:'+(item.action===a?'#e8f2ff':'#f3f3f3')+';font-weight:800';b.onclick=()=>choose(i,a);wrap.appendChild(b);});row.appendChild(wrap);if(ACTIONS[item.action]&&item.actionZone){const tools=document.createElement('div');tools.style.cssText='margin-top:8px;display:flex;gap:7px;flex-wrap:wrap';const test=document.createElement('button');test.textContent='▶ Aperçu animal';test.onclick=()=>preview(i);const redo=document.createElement('button');redo.textContent='✏️ Repeindre la zone';redo.onclick=()=>choose(i,item.action);const off=document.createElement('button');off.textContent='Supprimer action';off.onclick=()=>clear(i);[test,redo,off].forEach(b=>{b.style.cssText='padding:8px 10px;border:1px solid #bbb;border-radius:9px;background:#fff;font-weight:750';tools.appendChild(b)});row.appendChild(tools);}host.appendChild(row);});
}
// Support forcé animal : n'entre en action que si une action animal ciblée existe.
let overlay=null,baseSupport=null,ctx=null,badge=null,start=0,last=0;
function setupSupport(){baseSupport=document.getElementById('supportCanvas');const win=baseSupport?.closest('.image-window');if(!baseSupport||!win)return false;win.style.setProperty('position','relative','important');win.style.setProperty('overflow','hidden','important');if(!overlay||!overlay.isConnected){overlay=document.createElement('canvas');overlay.id='hhAnimalSupportCanvas';overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none';overlay.style.setProperty('z-index','2147483100','important');win.appendChild(overlay);ctx=overlay.getContext('2d');}const host=document.querySelector('.support-stage-wrap');if(host&&!badge){badge=document.createElement('div');badge.id='hhAnimalSupportStatus';badge.style.cssText='margin-top:7px;padding:7px 9px;border-radius:9px;background:#151515;color:#fff;font:700 11px system-ui;display:none';host.appendChild(badge);}return true;}
function supportPlacement(img,W,H){let r=contain(img.naturalWidth||1,img.naturalHeight||1,W,H);try{r=window.HappyHoloSubjectPlacement?.rect?.(img,W,H,{x:0,y:0,w:W,h:H})||r;}catch(_){}const z=clamp(Number(document.getElementById('supportZoom')?.value||100),60,180)/100,px=clamp(Number(document.getElementById('supportX')?.value||0),-50,50)/100,py=clamp(Number(document.getElementById('supportY')?.value||0),-50,50)/100,nw=r.w*z,nh=r.h*z;return{x:r.x+(r.w-nw)/2+px*W*.5,y:r.y+(r.h-nh)/2+py*H*.5,w:nw,h:nh};}
function renderSupport(t){requestAnimationFrame(renderSupport);if(t-last<32)return;last=t;if(!setupSupport())return;const item=activeItem(),s=rs(),img=s?.subjectImg;if(!item||!img){if(overlay)overlay.style.setProperty('display','none','important');if(badge)badge.style.display='none';return;}if(window.HappyHoloActionLocal?.enabled)window.HappyHoloActionLocal.enabled=false;baseSupport.style.setProperty('opacity','0','important');overlay.style.setProperty('display','block','important');if(!start)start=t;const r=baseSupport.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),W=Math.max(2,Math.round(r.width*d)),H=Math.max(2,Math.round(r.height*d));if(overlay.width!==W||overlay.height!==H){overlay.width=W;overlay.height=H;}const phase=Math.sin((t-start)/2400*Math.PI*2);ctx.clearRect(0,0,W,H);const bg=s.backgroundImg||s.sourceImg;if(bg){const br=cover(bg.naturalWidth||1,bg.naturalHeight||1,W,H);ctx.drawImage(bg,br.x,br.y,br.w,br.h);}const iw=520,ih=Math.max(2,Math.round(iw*((img.naturalHeight||1)/(img.naturalWidth||1)))),layer=document.createElement('canvas');layer.width=iw;layer.height=ih;const lx=layer.getContext('2d'),fr=contain(img.naturalWidth||1,img.naturalHeight||1,iw,ih);lx.drawImage(img,fr.x,fr.y,fr.w,fr.h);const af=buildFrame(layer,item,phase,iw,ih),p=supportPlacement(img,W,H);ctx.drawImage(af,p.x,p.y,p.w,p.h);try{window.HappyHoloTextLayer?.draw?.(ctx,phase,p);}catch(_){}if(badge){badge.style.display='block';badge.textContent='✓ Action animal : '+ACTIONS[item.action].label+' · '+Math.round(Number(item.intensity||40))+' %';}}
function refresh(){renderUI();start=0;}
['happyholo-relief-ready','happyholo-action-plan-changed','happyholo-selection-plan-changed'].forEach(ev=>window.addEventListener(ev,()=>setTimeout(refresh,80)));
[500,1000,1800,3000].forEach(ms=>setTimeout(refresh,ms));requestAnimationFrame(renderSupport);
window.HappyHoloAnimalActions={ACTIONS,buildFrame,refresh};
console.log('[HAPPYHOLO] actions locales Chat/Chien V1 chargées');
})();