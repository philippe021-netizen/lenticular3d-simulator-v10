/* LentiPrint Lab V3.3.26 — correction manuelle du masque
   Fonctionne avec relief3d-test-v3325.html chargé en script classique.
*/
(() => {
  'use strict';

  const originalLocalRemoveBackground = window.localRemoveBackground;
  if (typeof originalLocalRemoveBackground !== 'function') {
    console.error('[MASK3326] localRemoveBackground introuvable');
    return;
  }

  let modal, canvas, ctx, loupe, lctx, maskCanvas, mctx, originalCanvas, octx;
  let tool='add', brush=34, zoom=1, panX=0, panY=0;
  let drawing=false, panning=false, lastX=0, lastY=0, startPanX=0, startPanY=0;
  let pointerX=0, pointerY=0, resolveEditor=null;
  let history=[], redoStack=[];
  let pointers=new Map(), pinchDist=0, pinchZoom=1;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function el(tag, props={}, parent){
    const n=document.createElement(tag);
    Object.entries(props).forEach(([k,v])=>{
      if(k==='style') Object.assign(n.style,v);
      else if(k==='text') n.textContent=v;
      else n[k]=v;
    });
    if(parent) parent.appendChild(n);
    return n;
  }

  function mkButton(text,parent,fn,accent=false){
    const b=el('button',{type:'button',text,style:{
      margin:'0',padding:'10px 12px',borderRadius:'10px',
      border:accent?'2px solid #0a84ff':'1px solid #444',
      background:accent?'#0a84ff':'#242424',color:'#fff',
      fontWeight:'700',fontSize:'14px',minHeight:'42px'
    }},parent);
    b.addEventListener('click',fn);
    return b;
  }

  function buildUI(){
    if(modal) return;

    modal=el('div',{style:{
      position:'fixed',inset:'0',zIndex:'999999',background:'#0c0c0f',
      display:'none',flexDirection:'column',color:'#fff',
      fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'
    }},document.body);

    const top=el('div',{style:{
      display:'flex',alignItems:'center',gap:'8px',padding:'9px 12px',
      background:'#17171a',borderBottom:'1px solid #333',flexWrap:'wrap'
    }},modal);

    mkButton('← Annuler',top,cancelEditor);
    el('div',{text:'Correction du sujet',style:{
      fontWeight:'800',fontSize:'18px',flex:'1',minWidth:'150px'
    }},top);

    modal._undo=mkButton('↶',top,undo);
    modal._redo=mkButton('↷',top,redo);
    mkButton('✓ Valider',top,validateEditor,true);

    const body=el('div',{style:{
      display:'flex',flex:'1',minHeight:'0',overflow:'hidden'
    }},modal);

    const tools=el('div',{style:{
      width:'150px',maxWidth:'34vw',padding:'10px',background:'#17171a',
      borderRight:'1px solid #333',display:'flex',flexDirection:'column',
      gap:'8px',overflowY:'auto'
    }},body);

    modal._add=mkButton('＋ Ajouter',tools,()=>setTool('add'),true);
    modal._erase=mkButton('⌫ Gomme',tools,()=>setTool('erase'));
    modal._pan=mkButton('✋ Déplacer',tools,()=>setTool('pan'));

    mkButton('＋ Zoom',tools,()=>setZoom(zoom*1.35));
    mkButton('− Zoom',tools,()=>setZoom(zoom/1.35));
    mkButton('Ajuster',tools,fit);
    mkButton('100 %',tools,()=>setZoom(1));
    mkButton('Réinit. masque',tools,resetMask);

    const work=el('div',{style:{
      position:'relative',flex:'1',minWidth:'0',minHeight:'0',overflow:'hidden',
      background:'repeating-conic-gradient(#272727 0 25%,#1d1d1d 0 50%) 50% / 24px 24px'
    }},body);

    canvas=el('canvas',{style:{
      position:'absolute',inset:'0',width:'100%',height:'100%',
      touchAction:'none',cursor:'crosshair'
    }},work);
    ctx=canvas.getContext('2d');

    const lw=el('div',{style:{
      position:'absolute',right:'14px',top:'14px',width:'190px',height:'190px',
      maxWidth:'40vw',maxHeight:'40vw',border:'2px solid white',
      borderRadius:'50%',overflow:'hidden',background:'#000',
      boxShadow:'0 4px 22px #0009',pointerEvents:'none'
    }},work);

    loupe=el('canvas',{width:380,height:380,style:{width:'100%',height:'100%'}},lw);
    lctx=loupe.getContext('2d');

    const bottom=el('div',{style:{
      padding:'9px 12px',background:'#17171a',borderTop:'1px solid #333',
      display:'flex',gap:'14px',alignItems:'center',flexWrap:'wrap'
    }},modal);

    const lab=el('label',{text:'Pinceau',style:{
      display:'flex',gap:'8px',alignItems:'center',margin:'0',color:'#fff'
    }},bottom);

    const range=el('input',{type:'range',min:4,max:120,value:brush,style:{width:'150px'}},lab);
    range.addEventListener('input',()=>{brush=Number(range.value);render();});

    el('span',{text:'Vert = ajouter • Rouge = retirer • 2 doigts = zoom',style:{
      fontSize:'12px',opacity:'.75'
    }},bottom);

    originalCanvas=document.createElement('canvas');
    octx=originalCanvas.getContext('2d');
    maskCanvas=document.createElement('canvas');
    mctx=maskCanvas.getContext('2d',{willReadFrequently:true});

    bindEvents();
  }

  function setTool(t){
    tool=t;
    [['add',modal._add],['erase',modal._erase],['pan',modal._pan]].forEach(([k,b])=>{
      const active=k===t;
      b.style.background=active?'#0a84ff':'#242424';
      b.style.borderColor=active?'#0a84ff':'#444';
    });
    canvas.style.cursor=t==='pan'?'grab':'crosshair';
    render();
  }

  function snapshot(){
    history.push(mctx.getImageData(0,0,maskCanvas.width,maskCanvas.height));
    if(history.length>20) history.shift();
    redoStack=[];
    updateHistory();
  }

  function updateHistory(){
    if(!modal) return;
    modal._undo.disabled=history.length<=1;
    modal._redo.disabled=redoStack.length===0;
    modal._undo.style.opacity=modal._undo.disabled?'.4':'1';
    modal._redo.style.opacity=modal._redo.disabled?'.4':'1';
  }

  function undo(){
    if(history.length<=1) return;
    redoStack.push(history.pop());
    mctx.putImageData(history[history.length-1],0,0);
    updateHistory(); render();
  }

  function redo(){
    if(!redoStack.length) return;
    const s=redoStack.pop();
    history.push(s);
    mctx.putImageData(s,0,0);
    updateHistory(); render();
  }

  function resize(){
    const r=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(r.width*dpr));
    canvas.height=Math.max(1,Math.round(r.height*dpr));
    render();
  }

  function fit(){
    const r=canvas.getBoundingClientRect();
    zoom=Math.min(r.width/originalCanvas.width,r.height/originalCanvas.height)*.94;
    panX=(r.width-originalCanvas.width*zoom)/2;
    panY=(r.height-originalCanvas.height*zoom)/2;
    render();
  }

  function setZoom(z,cx,cy){
    const r=canvas.getBoundingClientRect();
    cx=cx??r.width/2; cy=cy??r.height/2;
    const old=zoom, ix=(cx-panX)/old, iy=(cy-panY)/old;
    zoom=clamp(z,.08,12);
    panX=cx-ix*zoom; panY=cy-iy*zoom;
    render();
  }

  function toImage(x,y){ return {x:(x-panX)/zoom,y:(y-panY)/zoom}; }

  function paint(sx,sy){
    const p=toImage(sx,sy), radius=brush/2;
    if(p.x<0||p.y<0||p.x>maskCanvas.width||p.y>maskCanvas.height) return;
    mctx.save();
    mctx.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';
    mctx.fillStyle=tool==='erase'?'rgba(0,0,0,1)':'rgba(255,255,255,1)';
    mctx.beginPath(); mctx.arc(p.x,p.y,radius,0,Math.PI*2); mctx.fill();
    mctx.restore();
  }

  function paintLine(x1,y1,x2,y2){
    const a=toImage(x1,y1), b=toImage(x2,y2);
    const d=Math.hypot(b.x-a.x,b.y-a.y);
    const step=Math.max(1,brush*.2);
    const n=Math.max(1,Math.ceil(d/step));
    for(let i=0;i<=n;i++){
      const t=i/n, px=a.x+(b.x-a.x)*t, py=a.y+(b.y-a.y)*t;
      paint(panX+px*zoom,panY+py*zoom);
    }
    render();
  }

  function render(){
    if(!canvas||!originalCanvas.width) return;
    const dpr=window.devicePixelRatio||1, r=canvas.getBoundingClientRect();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,r.width,r.height);

    ctx.save();
    ctx.translate(panX,panY);
    ctx.scale(zoom,zoom);
    ctx.drawImage(originalCanvas,0,0);

    const tmp=document.createElement('canvas');
    tmp.width=maskCanvas.width; tmp.height=maskCanvas.height;
    const t=tmp.getContext('2d');
    t.fillStyle='rgba(0,160,255,.46)';
    t.fillRect(0,0,tmp.width,tmp.height);
    t.globalCompositeOperation='destination-in';
    t.drawImage(maskCanvas,0,0);
    ctx.drawImage(tmp,0,0);
    ctx.restore();

    if(tool!=='pan'){
      ctx.beginPath();
      ctx.arc(pointerX,pointerY,brush*zoom/2,0,Math.PI*2);
      ctx.lineWidth=2;
      ctx.strokeStyle=tool==='erase'?'#ff5252':'#22e67b';
      ctx.stroke();
    }
    renderLoupe();
  }

  function renderLoupe(){
    if(!lctx||!originalCanvas.width) return;
    const p=toImage(pointerX,pointerY), src=loupe.width/4;
    const sx=p.x-src/2, sy=p.y-src/2;
    lctx.clearRect(0,0,loupe.width,loupe.height);
    lctx.drawImage(originalCanvas,sx,sy,src,src,0,0,loupe.width,loupe.height);

    const mt=document.createElement('canvas');
    mt.width=loupe.width; mt.height=loupe.height;
    const m=mt.getContext('2d');
    m.drawImage(maskCanvas,sx,sy,src,src,0,0,mt.width,mt.height);
    m.globalCompositeOperation='source-in';
    m.fillStyle='rgba(0,160,255,.46)';
    m.fillRect(0,0,mt.width,mt.height);
    lctx.drawImage(mt,0,0);

    const c=loupe.width/2;
    lctx.beginPath();
    lctx.moveTo(c-25,c); lctx.lineTo(c+25,c);
    lctx.moveTo(c,c-25); lctx.lineTo(c,c+25);
    lctx.strokeStyle='#fff'; lctx.lineWidth=2; lctx.stroke();
  }

  function pos(e){
    const r=canvas.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
  }

  function bindEvents(){
    canvas.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const p=pos(e);
      pointerX=p.x; pointerY=p.y;
      pointers.set(e.pointerId,p);
      canvas.setPointerCapture?.(e.pointerId);

      if(pointers.size>=2){ startPinch(); drawing=false; panning=false; return; }

      if(tool==='pan'){
        panning=true; startPanX=p.x-panX; startPanY=p.y-panY; return;
      }

      drawing=true; lastX=p.x; lastY=p.y;
      paint(p.x,p.y); render();
    });

    canvas.addEventListener('pointermove',e=>{
      const p=pos(e);
      pointerX=p.x; pointerY=p.y;
      if(pointers.has(e.pointerId)) pointers.set(e.pointerId,p);

      if(pointers.size>=2){ handlePinch(); return; }

      if(panning){
        panX=p.x-startPanX; panY=p.y-startPanY; render(); return;
      }

      if(drawing){
        paintLine(lastX,lastY,p.x,p.y);
        lastX=p.x; lastY=p.y;
      } else render();
    });

    const end=e=>{
      const was=drawing;
      pointers.delete(e.pointerId);
      drawing=false; panning=false;
      if(was) snapshot();
    };

    canvas.addEventListener('pointerup',end);
    canvas.addEventListener('pointercancel',end);

    canvas.addEventListener('wheel',e=>{
      e.preventDefault();
      const p=pos(e);
      setZoom(zoom*(e.deltaY<0?1.15:1/1.15),p.x,p.y);
    },{passive:false});

    window.addEventListener('resize',()=>{
      if(modal&&modal.style.display!=='none'){ resize(); render(); }
    });
  }

  function startPinch(){
    const a=[...pointers.values()];
    if(a.length<2) return;
    pinchDist=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);
    pinchZoom=zoom;
  }

  function handlePinch(){
    const a=[...pointers.values()];
    if(a.length<2||!pinchDist) return;
    const d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);
    const cx=(a[0].x+a[1].x)/2, cy=(a[0].y+a[1].y)/2;
    setZoom(pinchZoom*d/pinchDist,cx,cy);
  }

  function resetMask(){
    if(!history.length) return;
    mctx.putImageData(history[0],0,0);
    history=[history[0]];
    redoStack=[];
    updateHistory();
    render();
  }

  function cancelEditor(){
    modal.style.display='none';
    document.body.style.overflow='';
    if(resolveEditor){ resolveEditor(null); resolveEditor=null; }
  }

  async function validateEditor(){
    const out=document.createElement('canvas');
    out.width=originalCanvas.width; out.height=originalCanvas.height;
    const x=out.getContext('2d');
    x.drawImage(originalCanvas,0,0);
    x.globalCompositeOperation='destination-in';
    x.drawImage(maskCanvas,0,0);
    const blob=await new Promise((res,rej)=>
      out.toBlob(b=>b?res(b):rej(new Error('PNG masque impossible')),'image/png')
    );
    modal.style.display='none';
    document.body.style.overflow='';
    if(resolveEditor){ resolveEditor(blob); resolveEditor=null; }
  }

  async function editSegmentation(segmentedBlob){
    buildUI();

    const segmented=await new Promise((res,rej)=>{
      const u=URL.createObjectURL(segmentedBlob),i=new Image();
      i.onload=()=>{URL.revokeObjectURL(u);res(i)};
      i.onerror=rej;i.src=u;
    });

    let original=null;
    try{ if(typeof sourceImg!=='undefined' && sourceImg) original=sourceImg; }catch(_){}
    if(!original) original=segmented;

    const w=original.naturalWidth||original.width;
    const h=original.naturalHeight||original.height;

    originalCanvas.width=w; originalCanvas.height=h;
    octx.clearRect(0,0,w,h); octx.drawImage(original,0,0,w,h);

    maskCanvas.width=w; maskCanvas.height=h;
    mctx.clearRect(0,0,w,h);

    const sc=document.createElement('canvas');
    sc.width=w; sc.height=h;
    const sx=sc.getContext('2d',{willReadFrequently:true});
    sx.drawImage(segmented,0,0,w,h);
    const d=sx.getImageData(0,0,w,h), out=mctx.createImageData(w,h);

    for(let i=0;i<w*h;i++){
      const a=d.data[i*4+3];
      out.data[i*4]=255;
      out.data[i*4+1]=255;
      out.data[i*4+2]=255;
      out.data[i*4+3]=a;
    }

    mctx.putImageData(out,0,0);
    history=[]; redoStack=[]; snapshot();
    setTool('add');

    modal.style.display='flex';
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>{resize();fit();});

    return new Promise(resolve=>{resolveEditor=resolve;});
  }

  window.localRemoveBackground = async function(file){
    const segmented=await originalLocalRemoveBackground(file);
    try{
      if(typeof setStatus==='function')
        setStatus('Détourage automatique terminé — corrige le masque puis valide.');
    }catch(_){}

    const corrected=await editSegmentation(segmented);
    if(!corrected) throw new Error('Correction du masque annulée.');
    return corrected;
  };

  console.log('[MASK3326] correction manuelle active');
})();
