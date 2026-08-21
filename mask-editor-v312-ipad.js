/* HappyHolo — éditeur de masque V3.1.2 iPad robuste */
(() => {
  'use strict';

  const originalLocalRemoveBackground = window.localRemoveBackground;
  if (typeof originalLocalRemoveBackground !== 'function') return;

  let modal, work, canvas, ctx, loupe, lctx;
  let originalCanvas, octx, maskCanvas, mctx, overlayCanvas, ovctx;
  let tool='add', brush=34, zoom=1, panX=0, panY=0;
  let drawing=false, panning=false, lastX=0, lastY=0, startPanX=0, startPanY=0;
  let pointerX=0, pointerY=0, resolveEditor=null;
  let history=[], redoStack=[];
  let pointers=new Map(), pinchDist=0, pinchZoom=1;
  let raf=0, overlayDirty=true;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const el=(tag,props={},parent)=>{
    const n=document.createElement(tag);
    Object.entries(props).forEach(([k,v])=>{
      if(k==='style') Object.assign(n.style,v);
      else if(k==='text') n.textContent=v;
      else n[k]=v;
    });
    if(parent) parent.appendChild(n);
    return n;
  };

  function button(text,parent,fn,accent=false){
    const b=el('button',{type:'button',text,style:{
      margin:'0',padding:'12px 14px',borderRadius:'10px',minHeight:'44px',
      border:accent?'2px solid #0a84ff':'1px solid #444',
      background:accent?'#0a84ff':'#242424',color:'#fff',fontWeight:'750',fontSize:'14px'
    }},parent);
    b.addEventListener('click',fn);
    return b;
  }

  function buildUI(){
    if(modal) return;
    modal=el('div',{style:{position:'fixed',inset:'0',zIndex:'999999',background:'#0c0c0f',display:'none',flexDirection:'column',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'}},document.body);

    const top=el('div',{style:{display:'flex',alignItems:'center',gap:'8px',padding:'9px 12px',background:'#17171a',borderBottom:'1px solid #333',flexWrap:'wrap'}},modal);
    button('← Annuler',top,cancelEditor);
    el('div',{text:'Correction du sujet',style:{fontWeight:'800',fontSize:'18px',flex:'1'}},top);
    modal._undo=button('↶',top,undo);
    modal._redo=button('↷',top,redo);
    button('✓ Valider',top,validateEditor,true);

    const body=el('div',{style:{display:'flex',flex:'1',minHeight:'0',overflow:'hidden'}},modal);
    const tools=el('div',{style:{width:'150px',maxWidth:'34vw',padding:'10px',background:'#17171a',borderRight:'1px solid #333',display:'flex',flexDirection:'column',gap:'8px',overflowY:'auto'}},body);
    modal._add=button('＋ Ajouter',tools,()=>setTool('add'),true);
    modal._erase=button('⌫ Gomme',tools,()=>setTool('erase'));
    modal._pan=button('✋ Déplacer',tools,()=>setTool('pan'));
    button('＋ Zoom',tools,()=>setZoom(zoom*1.35));
    button('− Zoom',tools,()=>setZoom(zoom/1.35));
    button('Ajuster',tools,fit);
    button('100 %',tools,()=>setZoom(1));
    button('Réinit. masque',tools,resetMask);

    work=el('div',{style:{position:'relative',flex:'1',minWidth:'0',minHeight:'0',overflow:'hidden',background:'#111'}},body);
    canvas=el('canvas',{style:{position:'absolute',inset:'0',width:'100%',height:'100%',touchAction:'none',display:'block'}},work);
    ctx=canvas.getContext('2d');

    const lw=el('div',{style:{position:'absolute',right:'14px',top:'14px',width:'190px',height:'190px',maxWidth:'40vw',maxHeight:'40vw',border:'2px solid white',borderRadius:'50%',overflow:'hidden',background:'#000',boxShadow:'0 4px 22px #0009',pointerEvents:'none'}},work);
    loupe=el('canvas',{width:320,height:320,style:{width:'100%',height:'100%'}},lw);
    lctx=loupe.getContext('2d');

    const bottom=el('div',{style:{padding:'9px 12px',background:'#17171a',borderTop:'1px solid #333',display:'flex',gap:'14px',alignItems:'center',flexWrap:'wrap'}},modal);
    const lab=el('label',{text:'Pinceau',style:{display:'flex',gap:'8px',alignItems:'center',margin:'0',color:'#fff'}},bottom);
    const range=el('input',{type:'range',min:4,max:160,value:brush,style:{width:'155px'}},lab);
    range.addEventListener('input',()=>{brush=Number(range.value); requestRender();});
    el('span',{text:'Vert = ajouter • Rouge = retirer • 2 doigts = zoom',style:{fontSize:'12px',opacity:'.75'}},bottom);

    originalCanvas=document.createElement('canvas'); octx=originalCanvas.getContext('2d');
    maskCanvas=document.createElement('canvas'); mctx=maskCanvas.getContext('2d',{willReadFrequently:true});
    overlayCanvas=document.createElement('canvas'); ovctx=overlayCanvas.getContext('2d');
    bindEvents();
  }

  function setTool(t){
    tool=t;
    [['add',modal._add],['erase',modal._erase],['pan',modal._pan]].forEach(([k,b])=>{
      const active=k===t;
      b.style.background=active?'#0a84ff':'#242424';
      b.style.borderColor=active?'#0a84ff':'#444';
    });
    requestRender();
  }

  function resize(){
    const r=work.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(2,Math.round(r.width*dpr));
    const h=Math.max(2,Math.round(r.height*dpr));
    if(canvas.width!==w || canvas.height!==h){ canvas.width=w; canvas.height=h; }
    requestRender();
  }

  function fit(){
    const r=work.getBoundingClientRect();
    if(!originalCanvas.width || r.width<10 || r.height<10) return;
    zoom=Math.min(r.width/originalCanvas.width,r.height/originalCanvas.height)*0.94;
    panX=(r.width-originalCanvas.width*zoom)/2;
    panY=(r.height-originalCanvas.height*zoom)/2;
    requestRender();
  }

  function setZoom(z,cx,cy){
    const r=work.getBoundingClientRect();
    cx=cx??r.width/2; cy=cy??r.height/2;
    const old=zoom||1;
    const ix=(cx-panX)/old, iy=(cy-panY)/old;
    zoom=clamp(z,.03,16);
    panX=cx-ix*zoom; panY=cy-iy*zoom;
    requestRender();
  }

  function rebuildOverlay(){
    if(!overlayDirty) return;
    overlayDirty=false;
    overlayCanvas.width=maskCanvas.width; overlayCanvas.height=maskCanvas.height;
    ovctx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
    ovctx.fillStyle='rgba(0,160,255,.46)';
    ovctx.fillRect(0,0,overlayCanvas.width,overlayCanvas.height);
    ovctx.globalCompositeOperation='destination-in';
    ovctx.drawImage(maskCanvas,0,0);
    ovctx.globalCompositeOperation='source-over';
  }

  function requestRender(){
    if(raf) return;
    raf=requestAnimationFrame(()=>{raf=0; render();});
  }

  function render(){
    if(!canvas || !originalCanvas.width) return;
    rebuildOverlay();
    const r=work.getBoundingClientRect();
    const dpr=canvas.width/Math.max(1,r.width);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const dx=panX*dpr, dy=panY*dpr;
    const dw=originalCanvas.width*zoom*dpr;
    const dh=originalCanvas.height*zoom*dpr;

    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(originalCanvas,0,0,originalCanvas.width,originalCanvas.height,dx,dy,dw,dh);
    ctx.drawImage(overlayCanvas,0,0,overlayCanvas.width,overlayCanvas.height,dx,dy,dw,dh);

    if(tool!=='pan' && pointers.size<2){
      ctx.beginPath();
      ctx.arc(pointerX*dpr,pointerY*dpr,Math.max(5,brush*zoom*dpr/2),0,Math.PI*2);
      ctx.lineWidth=2*dpr;
      ctx.strokeStyle=tool==='erase'?'#ff5252':'#22e67b';
      ctx.stroke();
    }
    renderLoupe();
  }

  function renderLoupe(){
    if(!lctx||!originalCanvas.width) return;
    const p=toImage(pointerX,pointerY);
    const src=Math.max(24,Math.min(180,120/Math.max(.05,zoom)));
    const sx=p.x-src/2, sy=p.y-src/2;
    lctx.clearRect(0,0,loupe.width,loupe.height);
    lctx.drawImage(originalCanvas,sx,sy,src,src,0,0,loupe.width,loupe.height);
    lctx.drawImage(overlayCanvas,sx,sy,src,src,0,0,loupe.width,loupe.height);
    const c=loupe.width/2;
    lctx.beginPath(); lctx.moveTo(c-24,c); lctx.lineTo(c+24,c); lctx.moveTo(c,c-24); lctx.lineTo(c,c+24);
    lctx.strokeStyle='#fff'; lctx.lineWidth=2; lctx.stroke();
  }

  function toImage(x,y){ return {x:(x-panX)/zoom,y:(y-panY)/zoom}; }
  function pos(e){const r=canvas.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top};}

  function paintAt(x,y){
    if(x<0||y<0||x>maskCanvas.width||y>maskCanvas.height) return;
    mctx.save();
    mctx.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';
    mctx.fillStyle='#fff';
    mctx.beginPath(); mctx.arc(x,y,brush/2,0,Math.PI*2); mctx.fill();
    mctx.restore(); overlayDirty=true;
  }

  function paintLine(x1,y1,x2,y2){
    const a=toImage(x1,y1), b=toImage(x2,y2);
    const d=Math.hypot(b.x-a.x,b.y-a.y), step=Math.max(1.5,brush*.22);
    const n=Math.max(1,Math.ceil(d/step));
    for(let i=0;i<=n;i++){const t=i/n; paintAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);}
    requestRender();
  }

  function snapshot(){
    history.push(mctx.getImageData(0,0,maskCanvas.width,maskCanvas.height));
    if(history.length>20) history.shift(); redoStack=[]; updateHistory();
  }
  function updateHistory(){
    modal._undo.disabled=history.length<=1; modal._redo.disabled=!redoStack.length;
    modal._undo.style.opacity=modal._undo.disabled?'.4':'1'; modal._redo.style.opacity=modal._redo.disabled?'.4':'1';
  }
  function undo(){if(history.length<=1)return; redoStack.push(history.pop()); mctx.putImageData(history[history.length-1],0,0); overlayDirty=true; updateHistory(); requestRender();}
  function redo(){if(!redoStack.length)return; const s=redoStack.pop(); history.push(s); mctx.putImageData(s,0,0); overlayDirty=true; updateHistory(); requestRender();}
  function resetMask(){if(!history.length)return; mctx.putImageData(history[0],0,0); history=[history[0]]; redoStack=[]; overlayDirty=true; updateHistory(); requestRender();}

  function bindEvents(){
    canvas.addEventListener('pointerdown',e=>{
      e.preventDefault(); const p=pos(e); pointerX=p.x; pointerY=p.y; pointers.set(e.pointerId,p); canvas.setPointerCapture?.(e.pointerId);
      if(pointers.size>=2){const a=[...pointers.values()]; pinchDist=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y); pinchZoom=zoom; drawing=false; panning=false; return;}
      if(tool==='pan'){panning=true; startPanX=p.x-panX; startPanY=p.y-panY; return;}
      drawing=true; lastX=p.x; lastY=p.y; const q=toImage(p.x,p.y); paintAt(q.x,q.y); requestRender();
    },{passive:false});

    canvas.addEventListener('pointermove',e=>{
      e.preventDefault(); const p=pos(e); pointerX=p.x; pointerY=p.y; if(pointers.has(e.pointerId)) pointers.set(e.pointerId,p);
      if(pointers.size>=2){const a=[...pointers.values()]; const d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y); const cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2; if(pinchDist) setZoom(pinchZoom*d/pinchDist,cx,cy); return;}
      if(panning){panX=p.x-startPanX; panY=p.y-startPanY; requestRender(); return;}
      if(drawing){paintLine(lastX,lastY,p.x,p.y); lastX=p.x; lastY=p.y;} else requestRender();
    },{passive:false});

    const end=e=>{const was=drawing; pointers.delete(e.pointerId); drawing=false; panning=false; if(was) snapshot(); requestRender();};
    canvas.addEventListener('pointerup',end); canvas.addEventListener('pointercancel',end);
    window.addEventListener('resize',()=>{if(modal&&modal.style.display!=='none'){resize();fit();}});
  }

  function cancelEditor(){modal.style.display='none'; document.body.style.overflow=''; if(resolveEditor){resolveEditor(null);resolveEditor=null;}}

  async function validateEditor(){
    const out=document.createElement('canvas'); out.width=originalCanvas.width; out.height=originalCanvas.height;
    const x=out.getContext('2d'); x.drawImage(originalCanvas,0,0); x.globalCompositeOperation='destination-in'; x.drawImage(maskCanvas,0,0);
    const blob=await new Promise((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error('PNG masque impossible')),'image/png'));
    modal.style.display='none'; document.body.style.overflow=''; if(resolveEditor){resolveEditor(blob);resolveEditor=null;}
  }

  async function editSegmentation(segmentedBlob){
    buildUI();
    const segmented=await new Promise((res,rej)=>{const u=URL.createObjectURL(segmentedBlob); const i=new Image(); i.onload=()=>{URL.revokeObjectURL(u);res(i)}; i.onerror=rej; i.src=u;});

    let original=null;
    try{ if(typeof sourceImg!=='undefined' && sourceImg) original=sourceImg; }catch(_){}
    if(!original) original=segmented;

    const w=original.naturalWidth||original.width, h=original.naturalHeight||original.height;
    originalCanvas.width=w; originalCanvas.height=h; octx.clearRect(0,0,w,h); octx.drawImage(original,0,0,w,h);
    maskCanvas.width=w; maskCanvas.height=h; mctx.clearRect(0,0,w,h);

    const sc=document.createElement('canvas'); sc.width=w; sc.height=h; const sx=sc.getContext('2d',{willReadFrequently:true}); sx.drawImage(segmented,0,0,w,h);
    const d=sx.getImageData(0,0,w,h), out=mctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){const a=d.data[i*4+3]; out.data[i*4]=255; out.data[i*4+1]=255; out.data[i*4+2]=255; out.data[i*4+3]=a;}
    mctx.putImageData(out,0,0);

    overlayCanvas.width=w; overlayCanvas.height=h; overlayDirty=true;
    history=[]; redoStack=[]; snapshot(); setTool('add');
    modal.style.display='flex'; document.body.style.overflow='hidden';

    setTimeout(()=>{resize(); fit();},80);
    setTimeout(()=>{resize(); fit();},260);

    return new Promise(resolve=>{resolveEditor=resolve;});
  }

  window.localRemoveBackground=async function(file){
    const segmented=await originalLocalRemoveBackground(file);
    const corrected=await editSegmentation(segmented);
    if(!corrected) throw new Error('Correction du masque annulée.');
    return corrected;
  };

  console.log('[HAPPYHOLO] éditeur masque V3.1.2 iPad actif');
})();
