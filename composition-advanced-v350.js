/* HappyHolo V3.5.3 — composition avancée iPad
   - aperçu sticky réellement synchronisé avec le rendu
   - zoom / X / Y / rotation H/V du sujet appliqués à renderAt + export
   - objet de fond sélectionné librement au doigt ou Apple Pencil
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
  state.bgObject=state.bgObject||{
    enabled:false,slot:'a',strokes:[],zoom:100,x:0,y:0,yaw:0,pitch:0,bbox:null
  };

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

  const oldBgDraw=bg.draw;
  bg.draw=function(ctx,norm,W,H,rect={x:0,y:0,w:W,h:H}){
    const ok=oldBgDraw(ctx,norm,W,H,rect);
    const o=state.bgObject,slot=slotFor(norm);
    if(!ok||!o?.enabled||!Array.isArray(o.strokes)||!o.strokes.length||!slot?.img)return ok;
    if((o.slot==='a'&&slot!==state.a)||(o.slot==='b'&&slot!==state.b))return ok;
    const dr=displayedRect(slot,rect);if(!dr)return ok;

    const obj=document.createElement('canvas');obj.width=W;obj.height=H;
    const ox=obj.getContext('2d');
    ox.drawImage(slot.img,dr.x,dr.y,dr.w,dr.h);

    const mask=document.createElement('canvas');mask.width=W;mask.height=H;
    const mx=mask.getContext('2d');mx.lineCap='round';mx.lineJoin='round';mx.strokeStyle='#fff';mx.fillStyle='#fff';
    for(const st of o.strokes){
      const pts=st.points||[];if(!pts.length)continue;
      mx.save();
      mx.globalCompositeOperation=st.erase?'destination-out':'source-over';
      mx.lineWidth=Math.max(3,(Number(st.size)||.025)*Math.max(dr.w,dr.h));
      mx.beginPath();
      const p0=pts[0];mx.moveTo(dr.x+p0[0]*dr.w,dr.y+p0[1]*dr.h);
      if(pts.length===1){mx.arc(dr.x+p0[0]*dr.w,dr.y+p0[1]*dr.h,mx.lineWidth/2,0,Math.PI*2);mx.fill();}
      else{for(let i=1;i<pts.length;i++){const p=pts[i];mx.lineTo(dr.x+p[0]*dr.w,dr.y+p[1]*dr.h);}mx.stroke();}
      mx.restore();
    }
    ox.globalCompositeOperation='destination-in';ox.drawImage(mask,0,0);ox.globalCompositeOperation='source-over';

    const b=o.bbox||{x:.25,y:.25,w:.5,h:.5};
    const bx=dr.x+b.x*dr.w,by=dr.y+b.y*dr.h,bw=b.w*dr.w,bh=b.h*dr.h;
    const cx=bx+bw/2+(Number(o.x)||0)/100*rect.w*.35;
    const cy=by+bh/2+(Number(o.y)||0)/100*rect.h*.35;
    const zoom=clamp(Number(o.zoom)||100,60,160)/100;
    const yaw=clamp(Number(o.yaw)||0,-15,15)*Math.PI/180;
    const pitch=clamp(Number(o.pitch)||0,-12,12)*Math.PI/180;

    ctx.save();
    ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
    ctx.translate(cx,cy);
    ctx.transform(Math.max(.84,Math.cos(yaw))*zoom,Math.tan(pitch)*.10,Math.tan(yaw)*.12,Math.max(.86,Math.cos(pitch))*zoom,0,0);
    ctx.translate(-(bx+bw/2),-(by+bh/2));
    ctx.drawImage(obj,0,0);
    ctx.restore();
    return ok;
  };

  const baseRender=window.renderAt;
  function fitCover(img,W,H){
    const iw=img?.naturalWidth||img?.width||1,ih=img?.naturalHeight||img?.height||1;
    const s=Math.max(W/iw,H/ih);return{x:(W-iw*s)/2,y:(H-ih*s)/2,w:iw*s,h:ih*s};
  }
  function advancedRender(norm,target){
    const rs=window.HappyHoloReliefState;
    if(!rs?.subjectImg||!rs?.backgroundImg||!target){return baseRender?.(norm,target);}
    const x=target.getContext('2d'),W=target.width,H=target.height;x.clearRect(0,0,W,H);
    const angleEl=$('#angle'),subDepthEl=$('#subjectDepth'),bgDepthEl=$('#bgDepth'),edgeEl=$('#edgeProtect');
    const amplitude=Number(angleEl?.value||7)/4;
    const bgK=Number(bgDepthEl?.value||.10)/.10;
    const subK=Number(subDepthEl?.value||.48)/.30;
    const protect=Number(edgeEl?.value||84)/100;

    const custom=bg.draw?.(x,norm,W,H,{x:0,y:0,w:W,h:H});
    if(!custom){const fb=fitCover(rs.backgroundImg,W,H),shift=norm*6*amplitude*bgK;x.drawImage(rs.backgroundImg,fb.x+shift,fb.y,fb.w,fb.h);}
    const textDepth=Number(window.happyHoloTextLayer?.depth)||0;
    if(textDepth<0)window.HappyHoloTextLayer?.draw?.(x,norm,{x:0,y:0,w:W,h:H});

    const tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;const tx=tmp.getContext('2d');
    const r=originalRect(rs.subjectImg,W,H,{x:0,y:0,w:W,h:H});
    const yaw=clamp(Number(state.subject.yaw)||0,-12,12)*Math.PI/180;
    const pitch=clamp(Number(state.subject.pitch)||0,-10,10)*Math.PI/180;
    const cx=r.x+r.w/2,cy=r.y+r.h/2;
    tx.save();tx.translate(cx,cy);
    tx.transform(Math.max(.88,Math.cos(yaw)),Math.tan(pitch)*.08,Math.tan(yaw)*.10,Math.max(.90,Math.cos(pitch)),0,0);
    tx.drawImage(rs.subjectImg,-r.w/2,-r.h/2,r.w,r.h);tx.restore();

    const subShift=norm*18*amplitude*subK,strips=96;
    let depthData=null,dw=0,dh=0;
    try{const dc=rs.subjectDepthCanvas;const dctx=dc.getContext('2d',{willReadFrequently:true});depthData=dctx.getImageData(0,0,dc.width,dc.height).data;dw=dc.width;dh=dc.height;}catch(_){ }
    for(let i=0;i<strips;i++){
      const sx=Math.floor(i*W/strips),ex=Math.floor((i+1)*W/strips),ww=Math.max(1,ex-sx);let d=.5;
      if(depthData){const dx=Math.min(dw-1,Math.floor((i+.5)/strips*dw)),dy=Math.floor(dh*.52);d=depthData[(dy*dw+dx)*4]/255;}
      const local=(d-.5)*2,internal=subShift*local*(0.10*(1-protect)+0.025);
      x.drawImage(tmp,sx,0,ww,H,sx+subShift+internal,0,ww+1,H);
    }
    x.globalAlpha=.24+protect*.28;x.drawImage(tmp,subShift,0);x.globalAlpha=1;
    if(textDepth>=0)window.HappyHoloTextLayer?.draw?.(x,norm,{x:0,y:0,w:W,h:H});
  }
  window.renderAt=advancedRender;

  let preview=null,previewRAF=0;
  function requestPreview(){if(previewRAF)return;previewRAF=requestAnimationFrame(()=>{previewRAF=0;if(preview)advancedRender(0,preview);try{const v=window.HappyHoloReliefState?.view;if(v)advancedRender(0,v);}catch(_){}});}
  function notify(){window.dispatchEvent(new CustomEvent('happyholo-background-changed'));window.dispatchEvent(new CustomEvent('happyholo-subject-placement-changed'));requestPreview();}

  function control(label,min,max,value,onInput,suffix='°'){
    const wrap=document.createElement('label');wrap.style.cssText='display:grid;grid-template-columns:155px 1fr 50px;align-items:center;gap:8px;font-size:12px;font-weight:700';
    const t=document.createElement('span');t.textContent=label;
    const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step='1';i.value=value;
    const out=document.createElement('b');out.textContent=`${value}${suffix}`;out.style.textAlign='right';
    i.addEventListener('input',()=>{out.textContent=`${i.value}${suffix}`;onInput(Number(i.value));notify();});
    wrap._input=i;wrap._out=out;wrap.append(t,i,out);return wrap;
  }

  const host=$('#happyHoloCustomBackgrounds');if(!host)return;
  let subjectCard=null;
  for(const div of host.querySelectorAll('div')){if(div.firstElementChild?.tagName==='B'&&div.firstElementChild.textContent.trim()==='Placement du sujet détouré'){subjectCard=div.parentElement;break;}}
  if(subjectCard){
    const yaw=control('Rotation horizontale',-12,12,state.subject.yaw,v=>state.subject.yaw=v);
    const pitch=control('Rotation verticale',-10,10,state.subject.pitch,v=>state.subject.pitch=v);
    const reset=subjectCard.querySelector('button');if(reset){subjectCard.insertBefore(yaw,reset);subjectCard.insertBefore(pitch,reset);}else subjectCard.append(yaw,pitch);
    reset?.addEventListener('click',()=>{state.subject.yaw=0;state.subject.pitch=0;yaw._input.value='0';pitch._input.value='0';yaw._out.textContent='0°';pitch._out.textContent='0°';notify();});
  }

  const dock=document.createElement('div');dock.id='happyHoloStickyPreview';dock.style.cssText='position:sticky;top:78px;z-index:50;width:min(320px,42vw);margin:10px 0 12px auto;background:#17171a;border:2px solid #fff;border-radius:15px;padding:8px;box-shadow:0 8px 28px #0005';
  dock.innerHTML='<div style="color:#fff;font-size:12px;font-weight:850;margin:0 0 6px">Aperçu en direct</div>';
  preview=document.createElement('canvas');preview.width=360;preview.height=480;preview.style.cssText='width:100%;height:auto;max-height:38vh;display:block;background:#111;border-radius:10px;object-fit:contain';dock.appendChild(preview);
  host.insertBefore(dock,subjectCard||host.firstElementChild?.nextSibling||null);

  const objCard=document.createElement('div');objCard.style.cssText='margin-top:12px;border:2px solid #444;border-radius:14px;padding:12px;display:grid;gap:9px;background:#f8f8f8';
  objCard.innerHTML='<div><b>Objet du fond</b><div style="font-size:11px;color:#666;margin-top:3px">Peins directement le canapé, meuble ou objet au doigt ou avec l’Apple Pencil. La gomme permet de corriger la sélection.</div></div>';
  const slotSel=document.createElement('select');slotSel.style.cssText='width:100%;padding:9px;border:1px solid #bbb;border-radius:9px;background:#fff';slotSel.append(new Option('Objet dans le fond A','a'),new Option('Objet dans le fond B','b'));slotSel.value=state.bgObject.slot;
  const choose=document.createElement('button');choose.type='button';choose.textContent='✏️ Peindre l’objet dans le fond';choose.style.cssText='padding:10px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:850';
  const status=document.createElement('div');status.style.cssText='font-size:11px;color:#666';status.textContent=state.bgObject.strokes?.length?'✓ Objet sélectionné':'Aucun objet sélectionné';
  const zoom=control('Zoom objet',60,160,state.bgObject.zoom,v=>state.bgObject.zoom=v,'%');
  const ox=control('Objet horizontal',-50,50,state.bgObject.x,v=>state.bgObject.x=v,'%');
  const oy=control('Objet vertical',-50,50,state.bgObject.y,v=>state.bgObject.y=v,'%');
  const oyaw=control('Pivot horizontal',-15,15,state.bgObject.yaw,v=>state.bgObject.yaw=v);
  const opitch=control('Pivot vertical',-12,12,state.bgObject.pitch,v=>state.bgObject.pitch=v);
  const clear=document.createElement('button');clear.type='button';clear.textContent='Supprimer la sélection objet';clear.style.cssText='padding:9px;border:1px solid #aaa;border-radius:9px;background:#eee;color:#111;font-weight:800';
  objCard.append(slotSel,choose,status,zoom,ox,oy,oyaw,opitch,clear);host.appendChild(objCard);
  slotSel.addEventListener('change',()=>{state.bgObject.slot=slotSel.value;notify();});
  clear.addEventListener('click',()=>{state.bgObject.enabled=false;state.bgObject.strokes=[];state.bgObject.bbox=null;status.textContent='Aucun objet sélectionné';notify();});

  function recomputeBBox(strokes){
    const pts=strokes.filter(s=>!s.erase).flatMap(s=>s.points||[]);if(!pts.length)return null;
    let minX=1,minY=1,maxX=0,maxY=0;for(const p of pts){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
    const pad=.025;return{x:clamp(minX-pad,0,1),y:clamp(minY-pad,0,1),w:clamp(maxX-minX+pad*2,.02,1),h:clamp(maxY-minY+pad*2,.02,1)};
  }

  function paintObject(){
    const slot=state[state.bgObject.slot];if(!slot?.img){alert(`Charge d’abord le fond ${state.bgObject.slot.toUpperCase()}.`);return;}
    const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;z-index:1000010;background:#09090bf2;display:flex;flex-direction:column;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    const top=document.createElement('div');top.style.cssText='padding:10px;display:flex;gap:8px;align-items:center;background:#17171a;flex-wrap:wrap';
    const title=document.createElement('b');title.textContent='Peindre l’objet du fond';title.style.flex='1';
    const add=document.createElement('button');add.textContent='＋ Sélectionner';const erase=document.createElement('button');erase.textContent='⌫ Gomme';const cancel=document.createElement('button');cancel.textContent='Annuler';const ok=document.createElement('button');ok.textContent='✓ Valider';
    for(const b of[add,erase,cancel,ok])b.style.cssText='padding:9px 11px;border-radius:9px;border:1px solid #555;background:#29292d;color:#fff;font-weight:800';ok.style.background='#0a84ff';
    const brush=document.createElement('input');brush.type='range';brush.min='8';brush.max='100';brush.value='42';brush.style.width='160px';top.append(title,add,erase,brush,cancel,ok);
    const c=document.createElement('canvas');c.style.cssText='flex:1;min-height:0;width:100%;background:#111;touch-action:none';
    const foot=document.createElement('div');foot.textContent='Doigt ou Apple Pencil : peindre • Gomme : retirer • Peins uniquement l’objet à faire pivoter';foot.style.cssText='padding:9px;text-align:center;font-size:12px;background:#17171a';
    modal.append(top,c,foot);document.body.appendChild(modal);
    requestAnimationFrame(()=>{
      const rr=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);c.width=Math.round(rr.width*d);c.height=Math.round(rr.height*d);const cx=c.getContext('2d');
      const im=slot.img,iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,sc=Math.min(c.width/iw,c.height/ih),w=iw*sc,h=ih*sc,ix=(c.width-w)/2,iy=(c.height-h)/2;
      let strokes=(state.bgObject.strokes||[]).map(s=>({erase:!!s.erase,size:Number(s.size)||.025,points:(s.points||[]).map(p=>[p[0],p[1]])})),active=null,eraseMode=false;
      const draw=()=>{cx.clearRect(0,0,c.width,c.height);cx.drawImage(im,ix,iy,w,h);for(const st of strokes){const pts=st.points;if(!pts.length)continue;cx.save();cx.lineCap='round';cx.lineJoin='round';cx.strokeStyle=st.erase?'rgba(255,70,70,.8)':'rgba(0,210,255,.72)';cx.lineWidth=Math.max(3,st.size*Math.max(w,h));cx.beginPath();cx.moveTo(ix+pts[0][0]*w,iy+pts[0][1]*h);if(pts.length===1){cx.arc(ix+pts[0][0]*w,iy+pts[0][1]*h,cx.lineWidth/2,0,Math.PI*2);cx.fillStyle=cx.strokeStyle;cx.fill();}else{for(let i=1;i<pts.length;i++)cx.lineTo(ix+pts[i][0]*w,iy+pts[i][1]*h);cx.stroke();}cx.restore();}};
      const point=e=>{const r=c.getBoundingClientRect(),px=(e.clientX-r.left)*c.width/r.width,py=(e.clientY-r.top)*c.height/r.height;return[clamp((px-ix)/w,0,1),clamp((py-iy)/h,0,1)];};
      const setMode=v=>{eraseMode=v;add.style.background=v?'#29292d':'#087544';erase.style.background=v?'#8b2732':'#29292d';};setMode(false);
      add.onclick=()=>setMode(false);erase.onclick=()=>setMode(true);
      c.onpointerdown=e=>{e.preventDefault();c.setPointerCapture?.(e.pointerId);active={erase:eraseMode,size:Number(brush.value)/Math.max(w,h),points:[point(e)]};strokes.push(active);draw();};
      c.onpointermove=e=>{if(!active)return;e.preventDefault();const q=point(e),last=active.points[active.points.length-1];if(Math.hypot((q[0]-last[0])*w,(q[1]-last[1])*h)>1.5){active.points.push(q);draw();}};
      const end=()=>{active=null;};c.onpointerup=end;c.onpointercancel=end;
      draw();
      cancel.onclick=()=>modal.remove();
      ok.onclick=()=>{const bbox=recomputeBBox(strokes);if(!bbox){alert('Peins d’abord l’objet.');return;}state.bgObject.strokes=strokes;state.bgObject.bbox=bbox;state.bgObject.enabled=true;status.textContent='✓ Objet sélectionné';modal.remove();notify();};
    });
  }
  choose.addEventListener('click',paintObject);

  window.addEventListener('happyholo-relief-ready',requestPreview);
  window.addEventListener('happyholo-background-changed',requestPreview);
  window.addEventListener('happyholo-subject-placement-changed',requestPreview);
  if(window.innerWidth<760){dock.style.width='min(260px,55vw)';dock.style.top='68px';}
  requestPreview();
  console.log('[HAPPYHOLO] composition avancée V3.5.3 — rendu maître + sélection libre active');
})();
