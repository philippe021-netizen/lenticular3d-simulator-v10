/* HappyHolo V3.5.0 — composition avancée iPad
   - aperçu sticky pendant les réglages
   - pseudo-rotation H/V du sujet détouré
   - objet de fond sélectionnable et transformable indépendamment
*/
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  const bg=window.HappyHoloCustomBackground;
  const placement=window.HappyHoloSubjectPlacement;
  if(!bg?.state || !placement?.state) return;

  const state=bg.state;
  state.subject.yaw=Number(state.subject.yaw)||0;
  state.subject.pitch=Number(state.subject.pitch)||0;
  state.bgObject=state.bgObject||{enabled:false,slot:'a',rect:null,zoom:100,x:0,y:0,yaw:0,pitch:0};

  const originalRect=placement.rect;
  placement.rect=function(img,W,H,rect={x:0,y:0,w:W,h:H}){
    const r=originalRect(img,W,H,rect);
    const yaw=clamp(Number(state.subject.yaw)||0,-12,12)*Math.PI/180;
    const pitch=clamp(Number(state.subject.pitch)||0,-10,10)*Math.PI/180;
    const w=r.w*Math.max(.88,Math.cos(yaw));
    const h=r.h*Math.max(.90,Math.cos(pitch));
    return{x:r.x+(r.w-w)/2,y:r.y+(r.h-h)/2,w,h};
  };
  const oldSig=placement.signature;
  placement.signature=()=>`${oldSig?oldSig():''}|${state.subject.yaw}|${state.subject.pitch}`;
  placement.serialize=()=>({zoom:state.subject.zoom,x:state.subject.x,y:state.subject.y,yaw:state.subject.yaw,pitch:state.subject.pitch});

  const oldDraw=bg.draw;
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
  bg.draw=function(ctx,norm,W,H,rect={x:0,y:0,w:W,h:H}){
    const ok=oldDraw(ctx,norm,W,H,rect);
    const o=state.bgObject,slot=slotFor(norm);
    if(!ok||!o?.enabled||!o.rect||!slot?.img)return ok;
    if((o.slot==='a'&&slot!==state.a)||(o.slot==='b'&&slot!==state.b))return ok;
    const dr=displayedRect(slot,rect);if(!dr)return ok;
    const sr=o.rect;
    const sx=sr.x*dr.iw,sy=sr.y*dr.ih,sw=sr.w*dr.iw,sh=sr.h*dr.ih;
    let dx=dr.x+sr.x*dr.w,dy=dr.y+sr.y*dr.h,dw=sr.w*dr.w,dh=sr.h*dr.h;
    const zoom=clamp(Number(o.zoom)||100,60,160)/100;
    dw*=zoom;dh*=zoom;
    dx=dx+(sr.w*dr.w-dw)/2+(Number(o.x)||0)/100*rect.w*.35;
    dy=dy+(sr.h*dr.h-dh)/2+(Number(o.y)||0)/100*rect.h*.35;
    const cx=dx+dw/2,cy=dy+dh/2;
    const yaw=clamp(Number(o.yaw)||0,-15,15)*Math.PI/180;
    const pitch=clamp(Number(o.pitch)||0,-12,12)*Math.PI/180;
    ctx.save();
    ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
    ctx.translate(cx,cy);
    ctx.transform(Math.max(.84,Math.cos(yaw)),Math.tan(pitch)*.10,Math.tan(yaw)*.12,Math.max(.86,Math.cos(pitch)),0,0);
    ctx.drawImage(slot.img,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);
    ctx.restore();
    return ok;
  };

  function notify(){
    window.dispatchEvent(new CustomEvent('happyholo-background-changed'));
    window.dispatchEvent(new CustomEvent('happyholo-subject-placement-changed'));
    requestPreview();
  }

  function control(label,min,max,value,onInput,suffix='°'){
    const wrap=document.createElement('label');
    wrap.style.cssText='display:grid;grid-template-columns:155px 1fr 50px;align-items:center;gap:8px;font-size:12px;font-weight:700';
    const t=document.createElement('span');t.textContent=label;
    const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step='1';i.value=value;
    const out=document.createElement('b');out.textContent=`${value}${suffix}`;out.style.textAlign='right';
    i.addEventListener('input',()=>{out.textContent=`${i.value}${suffix}`;onInput(Number(i.value));notify();});
    wrap._input=i;wrap._out=out;wrap.append(t,i,out);return wrap;
  }

  const host=$('#happyHoloCustomBackgrounds');
  if(!host)return;
  const cards=[...host.querySelectorAll('div')];
  const subjectHead=cards.find(n=>n.querySelector?.('b')?.textContent==='Placement du sujet détouré');
  const subjectCard=subjectHead?.parentElement;
  if(subjectCard){
    const yaw=control('Rotation horizontale',-12,12,state.subject.yaw,v=>state.subject.yaw=v);
    const pitch=control('Rotation verticale',-10,10,state.subject.pitch,v=>state.subject.pitch=v);
    const reset=subjectCard.querySelector('button');
    if(reset)subjectCard.insertBefore(yaw,reset),subjectCard.insertBefore(pitch,reset);
    else subjectCard.append(yaw,pitch);
    reset?.addEventListener('click',()=>{state.subject.yaw=0;state.subject.pitch=0;yaw._input.value='0';pitch._input.value='0';yaw._out.textContent='0°';pitch._out.textContent='0°';notify();});
  }

  const dock=document.createElement('div');
  dock.id='happyHoloStickyPreview';
  dock.style.cssText='position:sticky;top:78px;z-index:50;width:min(320px,42vw);margin:10px 0 12px auto;background:#17171a;border:2px solid #fff;border-radius:15px;padding:8px;box-shadow:0 8px 28px #0005';
  dock.innerHTML='<div style="color:#fff;font-size:12px;font-weight:850;margin:0 0 6px">Aperçu en direct</div>';
  const preview=document.createElement('canvas');preview.width=360;preview.height=480;preview.style.cssText='width:100%;height:auto;max-height:38vh;display:block;background:#111;border-radius:10px;object-fit:contain';dock.appendChild(preview);
  host.insertBefore(dock,subjectCard||host.children[1]||null);
  let previewRAF=0;
  function requestPreview(){if(previewRAF)return;previewRAF=requestAnimationFrame(()=>{previewRAF=0;try{window.renderAt?.(0,preview);}catch(_){}});}
  window.addEventListener('happyholo-relief-ready',requestPreview);
  window.addEventListener('happyholo-background-changed',requestPreview);
  window.addEventListener('happyholo-subject-placement-changed',requestPreview);

  const objCard=document.createElement('div');
  objCard.style.cssText='margin-top:12px;border:2px solid #444;border-radius:14px;padding:12px;display:grid;gap:9px;background:#f8f8f8';
  objCard.innerHTML='<div><b>Objet du fond</b><div style="font-size:11px;color:#666;margin-top:3px">Sélectionne par exemple le canapé, puis ajuste-le légèrement pour qu’il corresponde mieux à l’orientation du sujet.</div></div>';
  const slotSel=document.createElement('select');slotSel.style.cssText='width:100%;padding:9px;border:1px solid #bbb;border-radius:9px;background:#fff';slotSel.append(new Option('Objet dans le fond A','a'),new Option('Objet dans le fond B','b'));slotSel.value=state.bgObject.slot;
  const choose=document.createElement('button');choose.type='button';choose.textContent='Sélectionner l’objet dans le fond';choose.style.cssText='padding:10px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:850';
  const status=document.createElement('div');status.style.cssText='font-size:11px;color:#666';status.textContent=state.bgObject.rect?'✓ Objet sélectionné':'Aucun objet sélectionné';
  const zoom=control('Zoom objet',60,160,state.bgObject.zoom,v=>state.bgObject.zoom=v,'%');
  const ox=control('Objet horizontal',-50,50,state.bgObject.x,v=>state.bgObject.x=v,'%');
  const oy=control('Objet vertical',-50,50,state.bgObject.y,v=>state.bgObject.y=v,'%');
  const oyaw=control('Pivot horizontal',-15,15,state.bgObject.yaw,v=>state.bgObject.yaw=v);
  const opitch=control('Pivot vertical',-12,12,state.bgObject.pitch,v=>state.bgObject.pitch=v);
  const clear=document.createElement('button');clear.type='button';clear.textContent='Supprimer la sélection objet';clear.style.cssText='padding:9px;border:1px solid #aaa;border-radius:9px;background:#eee;color:#111;font-weight:800';
  objCard.append(slotSel,choose,status,zoom,ox,oy,oyaw,opitch,clear);
  host.appendChild(objCard);
  slotSel.addEventListener('change',()=>{state.bgObject.slot=slotSel.value;notify();});
  clear.addEventListener('click',()=>{state.bgObject.enabled=false;state.bgObject.rect=null;status.textContent='Aucun objet sélectionné';notify();});

  function chooseObject(){
    const slot=state[state.bgObject.slot];if(!slot?.img){alert(`Charge d’abord le fond ${state.bgObject.slot.toUpperCase()}.`);return;}
    const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;z-index:1000010;background:#09090bf2;display:flex;flex-direction:column;color:#fff';
    const top=document.createElement('div');top.style.cssText='padding:10px;display:flex;gap:10px;align-items:center;background:#17171a';top.innerHTML='<b style="flex:1">Sélectionner l’objet du fond</b>';
    const cancel=document.createElement('button');cancel.textContent='Annuler';const ok=document.createElement('button');ok.textContent='✓ Valider';for(const b of[cancel,ok])b.style.cssText='padding:10px 14px;border-radius:9px;border:0;font-weight:800';ok.style.background='#0a84ff';ok.style.color='#fff';top.append(cancel,ok);
    const c=document.createElement('canvas');c.style.cssText='flex:1;min-height:0;width:100%;background:#111;touch-action:none';modal.append(top,c);document.body.appendChild(modal);
    requestAnimationFrame(()=>{
      const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);const x=c.getContext('2d');
      const im=slot.img,iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,sc=Math.min(c.width/iw,c.height/ih),w=iw*sc,h=ih*sc,ix=(c.width-w)/2,iy=(c.height-h)/2;let box=null,start=null;
      const draw=()=>{x.clearRect(0,0,c.width,c.height);x.drawImage(im,ix,iy,w,h);if(box){x.save();x.strokeStyle='#00e5ff';x.lineWidth=4;x.fillStyle='rgba(0,229,255,.15)';x.fillRect(box.x,box.y,box.w,box.h);x.strokeRect(box.x,box.y,box.w,box.h);x.restore();}};draw();
      const p=e=>{const rr=c.getBoundingClientRect();return{x:(e.clientX-rr.left)*c.width/rr.width,y:(e.clientY-rr.top)*c.height/rr.height};};
      c.onpointerdown=e=>{e.preventDefault();start=p(e);c.setPointerCapture?.(e.pointerId);box={x:start.x,y:start.y,w:0,h:0};draw();};
      c.onpointermove=e=>{if(!start)return;e.preventDefault();const q=p(e);box={x:Math.min(start.x,q.x),y:Math.min(start.y,q.y),w:Math.abs(q.x-start.x),h:Math.abs(q.y-start.y)};draw();};
      c.onpointerup=()=>{start=null;};
      cancel.onclick=()=>modal.remove();
      ok.onclick=()=>{if(!box||box.w<12||box.h<12){alert('Encadre d’abord l’objet.');return;}const bx=clamp((box.x-ix)/w,0,1),by=clamp((box.y-iy)/h,0,1),bw=clamp(box.w/w,0,1-bx),bh=clamp(box.h/h,0,1-by);state.bgObject.rect={x:bx,y:by,w:bw,h:bh};state.bgObject.enabled=true;status.textContent='✓ Objet sélectionné';modal.remove();notify();};
    });
  }
  choose.addEventListener('click',chooseObject);

  if(window.innerWidth<760){dock.style.width='min(260px,55vw)';dock.style.top='68px';}
  requestPreview();
  console.log('[HAPPYHOLO] composition avancée V3.5.0 active');
})();
