/* HappyHolo — éditeur masque V3.2.2 multi-sélections
   iPad / Apple Pencil
   - retouche Ajouter / Gomme
   - baguette magique couleur
   - plusieurs sélections indépendantes
   - profondeur + action + intensité + moment par sélection
   - validation compatible avec le moteur actuel : union des sélections
*/
(() => {
  'use strict';

  const originalLocalRemoveBackground = window.localRemoveBackground;
  if (typeof originalLocalRemoveBackground !== 'function') return;

  let modal, work, tools;
  let baseCanvas, baseCtx, editCanvas, editCtx, loupe, lctx;
  let originalCanvas, octx, maskCanvas, mctx, colorMaskCanvas, cmctx;
  let tool='add', brush=34, zoom=1, panX=0, panY=0;
  let drawing=false, panning=false, lastX=0, lastY=0, startPanX=0, startPanY=0;
  let pointerX=0, pointerY=0, resolveEditor=null;
  let history=[], redoStack=[];
  let pointers=new Map(), pinchDist=0, pinchZoom=1, activePanPointer=null;
  let baseDirty=true, maskDirty=true;
  let renderRAF=0, loupeRAF=0, lastLoupe=0;
  let originalImageData=null, originalPixels=null;
  let wandTolerance=34, wandMode='connected', wandAction='add';
  let tapCandidate=false, tapPointerId=null, tapStartX=0, tapStartY=0;

  // Multi-sélections
  let selections=[];
  let activeSelection=0;
  let planList, planDepth, planDepthOut, planAction, planIntensity, planIntensityOut, planTiming;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  async function prepareSegmentationFile(file,maxSide=1280){
    const img=await new Promise((resolve,reject)=>{
      const u=URL.createObjectURL(file);
      const im=new Image();
      im.onload=()=>{ URL.revokeObjectURL(u); resolve(im); };
      im.onerror=e=>{ URL.revokeObjectURL(u); reject(e); };
      im.src=u;
    });

    const w0=img.naturalWidth||img.width;
    const h0=img.naturalHeight||img.height;
    const longest=Math.max(w0,h0);

    if(longest<=maxSide) return file;

    const scale=maxSide/longest;
    const w=Math.max(64,Math.round(w0*scale));
    const h=Math.max(64,Math.round(h0*scale));

    const c=document.createElement('canvas');
    c.width=w; c.height=h;
    const x=c.getContext('2d',{alpha:false});
    x.imageSmoothingEnabled=true;
    x.imageSmoothingQuality='high';
    x.drawImage(img,0,0,w,h);

    const blob=await new Promise((resolve,reject)=>
      c.toBlob(
        b=>b?resolve(b):reject(new Error('Réduction mémoire impossible')),
        'image/jpeg',
        0.90
      )
    );

    const base=(file.name||'photo').replace(/\.[^.]+$/,'');
    return new File([blob],`${base}-happyholo-1280.jpg`,{
      type:'image/jpeg',
      lastModified:Date.now()
    });
  }


  function cloneImageData(img){
    return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  }

  function blankMask(w,h){
    const d=new ImageData(w,h);
    for(let i=0;i<w*h;i++){
      const o=i*4;
      d.data[o]=255; d.data[o+1]=255; d.data[o+2]=255; d.data[o+3]=0;
    }
    return d;
  }

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

  function button(text,parent,fn,accent=false){
    const b=el('button',{type:'button',text,style:{
      margin:'0',padding:'12px 14px',borderRadius:'10px',minHeight:'44px',
      border:accent?'2px solid #0a84ff':'1px solid #444',
      background:accent?'#0a84ff':'#242424',color:'#fff',
      fontWeight:'750',fontSize:'14px'
    }},parent);
    b.addEventListener('click',fn);
    return b;
  }

  function makeSelect(parent){
    return el('select',{style:{
      width:'100%',padding:'9px',borderRadius:'9px',border:'1px solid #555',
      background:'#101014',color:'#fff',font:'inherit'
    }},parent);
  }

  function saveActiveSelection(){
    if(!selections.length || !maskCanvas.width) return;
    const s=selections[activeSelection];
    if(!s) return;
    s.mask=cloneImageData(mctx.getImageData(0,0,maskCanvas.width,maskCanvas.height));
  }

  function loadActiveSelection(){
    const s=selections[activeSelection];
    if(!s || !s.mask) return;
    mctx.putImageData(cloneImageData(s.mask),0,0);
    history=[cloneImageData(s.mask)];
    redoStack=[];
    maskDirty=true;
    updateHistory();
    updatePlanControls();
    renderPlanList();
    requestRender(false,true);
    requestLoupe(true);
  }

  function addSelection(){
    if(selections.length>=5) return;
    saveActiveSelection();
    const w=maskCanvas.width, h=maskCanvas.height;
    const blank=blankMask(w,h);
    selections.push({
      id:Date.now()+Math.random(),
      name:`Sélection ${selections.length+1}`,
      depth:0.35,
      action:'none',
      intensity:50,
      timing:'all',
      mask:blank,
      initialMask:cloneImageData(blank)
    });
    activeSelection=selections.length-1;
    loadActiveSelection();
  }

  function removeActiveSelection(){
    if(selections.length<=1) return;
    selections.splice(activeSelection,1);
    activeSelection=Math.max(0,Math.min(activeSelection,selections.length-1));
    selections.forEach((s,i)=>s.name=`Sélection ${i+1}`);
    loadActiveSelection();
  }

  function switchSelection(i){
    if(i===activeSelection || !selections[i]) return;
    saveActiveSelection();
    activeSelection=i;
    loadActiveSelection();
  }

  function renderPlanList(){
    if(!planList) return;
    planList.innerHTML='';
    selections.forEach((s,i)=>{
      const b=el('button',{type:'button',text:s.name,style:{
        width:'100%',margin:'0 0 5px',padding:'9px 8px',borderRadius:'9px',
        border:i===activeSelection?'2px solid #0a84ff':'1px solid #555',
        background:i===activeSelection?'#0a84ff':'#151519',color:'#fff',
        fontWeight:'750',textAlign:'left'
      }},planList);
      b.addEventListener('click',()=>switchSelection(i));
    });
  }

  function updatePlanControls(){
    const s=selections[activeSelection];
    if(!s || !planDepth) return;
    planDepth.value=s.depth;
    planDepthOut.textContent=Number(s.depth).toFixed(2);
    planAction.value=s.action;
    planIntensity.value=s.intensity;
    planIntensityOut.textContent=`${s.intensity}%`;
    planTiming.value=s.timing;
  }

  function buildPlanCard(parent){
    const card=el('div',{style:{
      padding:'10px',border:'1px solid #3b3b3f',borderRadius:'12px',
      background:'#1e1e22',display:'flex',flexDirection:'column',gap:'8px'
    }},parent);
    el('div',{text:'Plans / sélections',style:{fontSize:'13px',fontWeight:'850'}},card);
    el('div',{text:'Chaque zone peut avoir sa propre profondeur et sa propre action.',style:{fontSize:'10px',opacity:'.72',lineHeight:'1.3'}},card);

    planList=el('div',{},card);

    const add=button('＋ Nouvelle sélection',card,addSelection);
    add.style.padding='9px'; add.style.minHeight='38px';

    const del=button('Supprimer sélection',card,removeActiveSelection);
    del.style.padding='8px'; del.style.minHeight='34px'; del.style.fontSize='11px'; del.style.background='#3a2424';

    const depthLab=el('label',{style:{display:'flex',flexDirection:'column',gap:'5px',fontSize:'11px'}},card);
    const depthHead=el('div',{style:{display:'flex',justifyContent:'space-between'}},depthLab);
    el('span',{text:'Profondeur'},depthHead);
    planDepthOut=el('b',{text:'0.48'},depthHead);
    planDepth=el('input',{type:'range',min:'0.02',max:'0.80',step:'0.01',value:'0.48',style:{width:'100%'}},depthLab);
    planDepth.addEventListener('input',()=>{
      const s=selections[activeSelection]; if(!s) return;
      s.depth=Number(planDepth.value); planDepthOut.textContent=s.depth.toFixed(2);
    });

    el('label',{text:'Action',style:{fontSize:'11px',fontWeight:'700'}},card);
    planAction=makeSelect(card);
    [
      ['Aucune action','none'],['Personne — clin d’œil','person_wink'],['Personne — sourire léger','person_smile'],
      ['Personne — petit bisou','person_kiss'],['Chat — clignement lent','cat_blink'],['Chat — miaulement','cat_meow'],
      ['Chien — tête penchée','dog_tilt'],['Chien — petit aboiement','dog_bark'],['Moto/voiture — appel de phare','headlight'],
      ['Moto/voiture — clignotant','indicator'],['Logo — brillance','logo_shine'],['Objet/logo — pivot léger','pivot']
    ].forEach(([t,v])=>planAction.appendChild(new Option(t,v)));
    planAction.addEventListener('change',()=>{ const s=selections[activeSelection]; if(s) s.action=planAction.value; });

    const intLab=el('label',{style:{display:'flex',flexDirection:'column',gap:'5px',fontSize:'11px'}},card);
    const intHead=el('div',{style:{display:'flex',justifyContent:'space-between'}},intLab);
    el('span',{text:'Intensité'},intHead);
    planIntensityOut=el('b',{text:'50%'},intHead);
    planIntensity=el('input',{type:'range',min:'10',max:'100',step:'5',value:'50',style:{width:'100%'}},intLab);
    planIntensity.addEventListener('input',()=>{
      const s=selections[activeSelection]; if(!s) return;
      s.intensity=Number(planIntensity.value); planIntensityOut.textContent=`${s.intensity}%`;
    });

    el('label',{text:'Moment dans les 9 vues',style:{fontSize:'11px',fontWeight:'700'}},card);
    planTiming=makeSelect(card);
    [['Toute la séquence','all'],['Vues 1–3','1-3'],['Vues 4–6','4-6'],['Vues 7–9','7-9']].forEach(([t,v])=>planTiming.appendChild(new Option(t,v)));
    planTiming.addEventListener('change',()=>{ const s=selections[activeSelection]; if(s) s.timing=planTiming.value; });

    const previewRow=el('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'7px',marginTop:'3px'}},card);
    const one=button('▶ Voir cette sélection',previewRow,()=>openActionPreview(false),true);
    one.style.padding='9px 7px'; one.style.minHeight='40px'; one.style.fontSize='11px';
    const all=button('▶ Voir toutes les actions',previewRow,()=>openActionPreview(true));
    all.style.padding='9px 7px'; all.style.minHeight='40px'; all.style.fontSize='11px';
    el('div',{text:'Aperçu local instantané : permet de contrôler le sens et l’intensité avant de valider.',style:{fontSize:'9px',opacity:'.65',lineHeight:'1.25'}},card);
  }

  let actionPreviewModal=null, actionPreviewCanvas=null, actionPreviewCtx=null, actionPreviewRAF=0;

  function maskedLayerForSelection(sel,W,H){
    if(!sel?.mask || !originalCanvas?.width) return null;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const x=c.getContext('2d');
    x.drawImage(originalCanvas,0,0,W,H);
    const mc=document.createElement('canvas'); mc.width=sel.mask.width; mc.height=sel.mask.height;
    mc.getContext('2d').putImageData(sel.mask,0,0);
    x.globalCompositeOperation='destination-in';
    x.drawImage(mc,0,0,mc.width,mc.height,0,0,W,H);
    x.globalCompositeOperation='source-over';
    return c;
  }

  function drawActionLayer(ctx,layer,sel,t,W,H){
    const intensity=clamp(Number(sel.intensity||50)/100,.1,1);
    const a=sel.action||'none';
    const phase=Math.sin(t*Math.PI*2);
    const pulse=(1-Math.cos(t*Math.PI*2))/2;
    let rot=0, sx=1, sy=1, dx=0, dy=0, alpha=1, flash=0;

    if(a==='person_wink' || a==='cat_blink'){
      sy=1-(pulse*.055*intensity);
    }else if(a==='person_smile'){
      sy=1+(phase*.018*intensity); sx=1+(pulse*.012*intensity);
    }else if(a==='person_kiss'){
      sx=1+(pulse*.022*intensity); sy=1+(pulse*.022*intensity); dy=-pulse*2*intensity;
    }else if(a==='cat_meow' || a==='dog_bark'){
      sy=1+(phase*.025*intensity); dx=phase*1.5*intensity;
    }else if(a==='dog_tilt'){
      rot=phase*4.5*intensity;
    }else if(a==='pivot'){
      rot=phase*5.5*intensity; sx=1-Math.abs(phase)*.045*intensity;
    }else if(a==='headlight'){
      flash=pulse>.72 ? .55*intensity : 0;
    }else if(a==='indicator'){
      flash=(Math.sin(t*Math.PI*6)>0 ? .38 : 0)*intensity;
    }else if(a==='logo_shine'){
      flash=(.10+.25*pulse)*intensity; dx=phase*1.2*intensity;
    }

    ctx.save();
    ctx.translate(W/2+dx,H/2+dy);
    ctx.rotate(rot*Math.PI/180);
    ctx.scale(sx,sy);
    ctx.globalAlpha=alpha;
    ctx.drawImage(layer,-W/2,-H/2,W,H);
    ctx.restore();

    if(flash>0){
      ctx.save();
      ctx.globalCompositeOperation='screen';
      ctx.globalAlpha=flash;
      ctx.filter='brightness(1.9) saturate(1.15)';
      ctx.drawImage(layer,0,0,W,H);
      ctx.restore();
    }
  }

  function closeActionPreview(){
    cancelAnimationFrame(actionPreviewRAF); actionPreviewRAF=0;
    if(actionPreviewModal) actionPreviewModal.style.display='none';
  }

  function ensureActionPreviewUI(){
    if(actionPreviewModal) return;
    actionPreviewModal=el('div',{style:{position:'fixed',inset:'0',zIndex:'1000001',background:'rgba(5,5,8,.96)',display:'none',flexDirection:'column',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'}},document.body);
    const bar=el('div',{style:{display:'flex',gap:'10px',alignItems:'center',padding:'10px 12px',background:'#17171a',borderBottom:'1px solid #333'}},actionPreviewModal);
    button('← Retour',bar,closeActionPreview);
    actionPreviewModal._title=el('div',{text:'Aperçu action',style:{fontWeight:'850',fontSize:'17px',flex:'1'}},bar);
    actionPreviewModal._hint=el('div',{text:'Aperçu local',style:{fontSize:'11px',opacity:'.7'}},bar);
    const body=el('div',{style:{flex:'1',minHeight:'0',display:'flex',alignItems:'center',justifyContent:'center',padding:'12px'}},actionPreviewModal);
    actionPreviewCanvas=el('canvas',{style:{maxWidth:'100%',maxHeight:'100%',borderRadius:'12px',background:'#111',boxShadow:'0 12px 40px rgba(0,0,0,.45)'}},body);
    actionPreviewCtx=actionPreviewCanvas.getContext('2d');
    const foot=el('div',{style:{padding:'8px 12px 12px',textAlign:'center',fontSize:'11px',opacity:'.72'}},actionPreviewModal);
    foot.textContent='Cet aperçu vérifie le mouvement choisi. La génération finale des 9 vues reste séparée.';
  }

  function openActionPreview(showAll){
    saveActiveSelection();
    ensureActionPreviewUI();
    if(!originalCanvas?.width || !selections.length) return;
    const maxW=Math.min(1100,originalCanvas.width);
    const scale=maxW/originalCanvas.width;
    const W=Math.round(originalCanvas.width*scale), H=Math.round(originalCanvas.height*scale);
    actionPreviewCanvas.width=W; actionPreviewCanvas.height=H;
    const indices=showAll ? selections.map((_,i)=>i) : [activeSelection];
    const layers=new Map(indices.map(i=>[i,maskedLayerForSelection(selections[i],W,H)]));
    actionPreviewModal._title.textContent=showAll?'Aperçu — toutes les actions':`Aperçu — ${selections[activeSelection]?.name||'sélection'}`;
    actionPreviewModal.style.display='flex';
    cancelAnimationFrame(actionPreviewRAF);
    const start=performance.now();
    const frame=(now)=>{
      if(actionPreviewModal.style.display==='none') return;
      const tt=((now-start)%2400)/2400;
      const x=actionPreviewCtx;
      x.clearRect(0,0,W,H);
      x.drawImage(originalCanvas,0,0,W,H);

      // Retire d'abord les zones animées de l'image fixe pour éviter le dédoublement.
      for(const i of indices){
        const layer=layers.get(i); if(!layer) continue;
        x.save(); x.globalCompositeOperation='destination-out'; x.drawImage(layer,0,0,W,H); x.restore();
      }
      for(const i of indices){
        const layer=layers.get(i); if(!layer) continue;
        drawActionLayer(x,layer,selections[i],tt,W,H);
      }
      actionPreviewRAF=requestAnimationFrame(frame);
    };
    actionPreviewRAF=requestAnimationFrame(frame);
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

    button('← Annuler',top,cancelEditor);
    el('div',{text:'Correction du sujet',style:{fontWeight:'800',fontSize:'18px',flex:'1'}},top);
    modal._undo=button('↶',top,undo);
    modal._redo=button('↷',top,redo);
    button('✓ Valider',top,validateEditor,true);

    const body=el('div',{style:{display:'flex',flex:'1',minHeight:'0',overflow:'hidden'}},modal);

    tools=el('div',{style:{
      width:'188px',maxWidth:'42vw',padding:'10px',background:'#17171a',
      borderRight:'1px solid #333',display:'flex',flexDirection:'column',
      gap:'8px',overflowY:'auto'
    }},body);

    modal._add=button('＋ Ajouter',tools,()=>setTool('add'),true);
    modal._erase=button('⌫ Gomme',tools,()=>setTool('erase'));
    modal._wand=button('🪄 Baguette',tools,()=>setTool('wand'));
    modal._pan=button('✋ Déplacer',tools,()=>setTool('pan'));
    button('＋ Zoom',tools,()=>setZoom(zoom*1.35));
    button('− Zoom',tools,()=>setZoom(zoom/1.35));
    button('Ajuster',tools,fit);
    button('100 %',tools,()=>setZoom(1));
    button('Réinit. masque',tools,resetMask);

    buildPlanCard(tools);

    const wandCard=el('div',{style:{
      marginTop:'2px',padding:'10px',border:'1px solid #3b3b3f',borderRadius:'12px',
      background:'#1e1e22',display:'flex',flexDirection:'column',gap:'8px'
    }},tools);
    el('div',{text:'Baguette',style:{fontSize:'13px',fontWeight:'800',opacity:'.95'}},wandCard);

    el('label',{text:'Action',style:{fontSize:'12px',fontWeight:'700'}},wandCard);
    modal._wandAction=makeSelect(wandCard);
    modal._wandAction.appendChild(new Option('Ajouter au masque','add'));
    modal._wandAction.appendChild(new Option('Retirer du masque','erase'));
    modal._wandAction.value=wandAction;
    modal._wandAction.addEventListener('change',()=>{ wandAction=modal._wandAction.value==='erase'?'erase':'add'; requestRender(false,true); });

    el('label',{text:'Portée',style:{fontSize:'12px',fontWeight:'700'}},wandCard);
    modal._wandMode=makeSelect(wandCard);
    modal._wandMode.appendChild(new Option('Zone connectée','connected'));
    modal._wandMode.appendChild(new Option('Toutes couleurs similaires','global'));
    modal._wandMode.value=wandMode;
    modal._wandMode.addEventListener('change',()=>{ wandMode=modal._wandMode.value; });

    const tolWrap=el('label',{style:{display:'flex',flexDirection:'column',gap:'6px'}},wandCard);
    modal._wandTolLabel=el('div',{text:`Tolérance ${wandTolerance}`,style:{fontSize:'12px',fontWeight:'700'}},tolWrap);
    modal._wandTolerance=el('input',{type:'range',min:0,max:120,value:wandTolerance,style:{width:'100%'}},tolWrap);
    modal._wandTolerance.addEventListener('input',()=>{ wandTolerance=Number(modal._wandTolerance.value); modal._wandTolLabel.textContent=`Tolérance ${wandTolerance}`; });
    modal._wandHint=el('div',{text:'Touchez une couleur pour sélectionner. Le pinceau reste disponible pour les retouches.',style:{fontSize:'11px',opacity:'.82',lineHeight:'1.35'}},wandCard);

    work=el('div',{style:{position:'relative',flex:'1',minWidth:'0',minHeight:'0',overflow:'hidden',background:'#111'}},body);
    const canvasStyle={position:'absolute',left:'0',top:'0',right:'0',bottom:'0',width:'100%',height:'100%',display:'block',aspectRatio:'auto',objectFit:'fill',borderRadius:'0',background:'transparent',maxWidth:'none',maxHeight:'none',margin:'0',padding:'0'};
    baseCanvas=el('canvas',{style:{...canvasStyle,pointerEvents:'none'}},work); baseCtx=baseCanvas.getContext('2d');
    editCanvas=el('canvas',{style:{...canvasStyle,touchAction:'none'}},work); editCtx=editCanvas.getContext('2d');

    const lw=el('div',{style:{position:'absolute',right:'14px',top:'14px',width:'190px',height:'190px',maxWidth:'40vw',maxHeight:'40vw',border:'2px solid white',borderRadius:'50%',overflow:'hidden',background:'#000',boxShadow:'0 4px 22px #0009',pointerEvents:'none'}},work);
    loupe=el('canvas',{width:260,height:260,style:{width:'100%',height:'100%',display:'block',aspectRatio:'auto',borderRadius:'0',background:'#000'}},lw); lctx=loupe.getContext('2d');

    const bottom=el('div',{style:{padding:'9px 12px',background:'#17171a',borderTop:'1px solid #333',display:'flex',gap:'14px',alignItems:'center',flexWrap:'wrap'}},modal);
    const lab=el('label',{text:'Pinceau',style:{display:'flex',gap:'8px',alignItems:'center',margin:'0',color:'#fff'}},bottom);
    const range=el('input',{type:'range',min:4,max:160,value:brush,style:{width:'155px'}},lab);
    range.addEventListener('input',()=>{ brush=Number(range.value); requestRender(false,true); requestLoupe(true); });
    modal._statusText=el('span',{text:'Vert = ajouter • Rouge = retirer • 2 doigts = zoom',style:{fontSize:'12px',opacity:'.75'}},bottom);

    originalCanvas=document.createElement('canvas'); octx=originalCanvas.getContext('2d');
    maskCanvas=document.createElement('canvas'); mctx=maskCanvas.getContext('2d',{willReadFrequently:true});
    colorMaskCanvas=document.createElement('canvas'); cmctx=colorMaskCanvas.getContext('2d');
    bindEvents();
  }

  function rect(){ return editCanvas.getBoundingClientRect(); }

  function updateToolUI(){
    [['add',modal._add],['erase',modal._erase],['wand',modal._wand],['pan',modal._pan]].forEach(([k,b])=>{
      const active=k===tool; b.style.background=active?'#0a84ff':'#242424'; b.style.borderColor=active?'#0a84ff':'#444';
    });
    const wandOn=tool==='wand';
    modal._wandAction.disabled=!wandOn; modal._wandMode.disabled=!wandOn; modal._wandTolerance.disabled=!wandOn; modal._wandHint.style.opacity=wandOn?'.95':'.55';
    if(modal._statusText){
      if(tool==='wand') modal._statusText.textContent=`Baguette — ${selections[activeSelection]?.name||''} • toucher pour sélectionner • 2 doigts = zoom`;
      else if(tool==='pan') modal._statusText.textContent='Déplacer : glisser pour translater l’image';
      else modal._statusText.textContent=`${selections[activeSelection]?.name||''} • Vert = ajouter • Rouge = retirer • 2 doigts = zoom`;
    }
  }

  function setTool(t){ tool=t; updateToolUI(); requestRender(false,true); requestLoupe(true); }

  function resize(){
    const r=rect(), dpr=Math.min(window.devicePixelRatio||1,1.5);
    const w=Math.max(2,Math.round(r.width*dpr)), h=Math.max(2,Math.round(r.height*dpr));
    if(baseCanvas.width!==w || baseCanvas.height!==h){ baseCanvas.width=w; baseCanvas.height=h; editCanvas.width=w; editCanvas.height=h; baseDirty=true; maskDirty=true; }
    requestRender(true,true);
  }

  function fit(){
    const r=rect(); if(!originalCanvas.width || r.width<10 || r.height<10) return;
    zoom=Math.min(r.width/originalCanvas.width,r.height/originalCanvas.height)*0.94;
    panX=(r.width-originalCanvas.width*zoom)/2; panY=(r.height-originalCanvas.height*zoom)/2;
    baseDirty=true; maskDirty=true; requestRender(true,true); requestLoupe(true);
  }

  function setZoom(z,cx,cy){
    const r=rect(); cx=cx??r.width/2; cy=cy??r.height/2;
    const old=zoom||1, ix=(cx-panX)/old, iy=(cy-panY)/old;
    zoom=clamp(z,.03,16); panX=cx-ix*zoom; panY=cy-iy*zoom;
    baseDirty=true; maskDirty=true; requestRender(true,true); requestLoupe(true);
  }

  function rebuildColorMask(){
    if(!maskDirty) return; maskDirty=false;
    if(colorMaskCanvas.width!==maskCanvas.width || colorMaskCanvas.height!==maskCanvas.height){ colorMaskCanvas.width=maskCanvas.width; colorMaskCanvas.height=maskCanvas.height; }
    cmctx.setTransform(1,0,0,1,0,0); cmctx.clearRect(0,0,colorMaskCanvas.width,colorMaskCanvas.height);
    cmctx.fillStyle='rgba(0,160,255,.46)'; cmctx.fillRect(0,0,colorMaskCanvas.width,colorMaskCanvas.height);
    cmctx.globalCompositeOperation='destination-in'; cmctx.drawImage(maskCanvas,0,0); cmctx.globalCompositeOperation='source-over';
  }

  function requestRender(base=false,overlay=true){
    if(base) baseDirty=true; if(overlay) maskDirty=true; if(renderRAF) return;
    renderRAF=requestAnimationFrame(()=>{ renderRAF=0; drawBase(); drawOverlay(); });
  }

  function drawBase(){
    if(!baseDirty) return; baseDirty=false;
    const r=rect(), sx=baseCanvas.width/Math.max(1,r.width), sy=baseCanvas.height/Math.max(1,r.height);
    baseCtx.setTransform(1,0,0,1,0,0); baseCtx.clearRect(0,0,baseCanvas.width,baseCanvas.height); baseCtx.imageSmoothingEnabled=true;
    baseCtx.drawImage(originalCanvas,0,0,originalCanvas.width,originalCanvas.height,panX*sx,panY*sy,originalCanvas.width*zoom*sx,originalCanvas.height*zoom*sy);
  }

  function drawOverlay(){
    rebuildColorMask();
    const r=rect(), sx=editCanvas.width/Math.max(1,r.width), sy=editCanvas.height/Math.max(1,r.height);
    editCtx.setTransform(1,0,0,1,0,0); editCtx.clearRect(0,0,editCanvas.width,editCanvas.height); editCtx.imageSmoothingEnabled=true;
    editCtx.drawImage(colorMaskCanvas,0,0,colorMaskCanvas.width,colorMaskCanvas.height,panX*sx,panY*sy,originalCanvas.width*zoom*sx,originalCanvas.height*zoom*sy);
    if(tool!=='pan' && pointers.size<2){
      if(tool==='wand'){
        const px=pointerX*sx, py=pointerY*sy; editCtx.beginPath(); editCtx.moveTo(px-18*sx,py); editCtx.lineTo(px+18*sx,py); editCtx.moveTo(px,py-18*sy); editCtx.lineTo(px,py+18*sy); editCtx.lineWidth=2*Math.max(sx,sy); editCtx.strokeStyle=wandAction==='erase'?'#ff6b6b':'#7ef3ac'; editCtx.stroke();
      }else{
        const radiusCss=Math.max(5,brush*zoom/2); editCtx.beginPath(); editCtx.ellipse(pointerX*sx,pointerY*sy,radiusCss*sx,radiusCss*sy,0,0,Math.PI*2); editCtx.lineWidth=2*Math.max(sx,sy); editCtx.strokeStyle=tool==='erase'?'#ff5252':'#22e67b'; editCtx.stroke();
      }
    }
  }

  function requestLoupe(force=false){
    if(force) lastLoupe=0; if(loupeRAF) return;
    loupeRAF=requestAnimationFrame(ts=>{ loupeRAF=0; const delay=drawing?70:40; if(force || ts-lastLoupe>=delay){ lastLoupe=ts; renderLoupe(); } });
  }

  function renderLoupe(){
    if(!lctx||!originalCanvas.width) return; rebuildColorMask();
    const p=toImage(pointerX,pointerY), src=Math.max(30,Math.min(190,130/Math.max(.05,zoom))), sx=p.x-src/2, sy=p.y-src/2;
    lctx.clearRect(0,0,loupe.width,loupe.height); lctx.imageSmoothingEnabled=true; lctx.drawImage(originalCanvas,sx,sy,src,src,0,0,loupe.width,loupe.height); lctx.drawImage(colorMaskCanvas,sx,sy,src,src,0,0,loupe.width,loupe.height);
    const c=loupe.width/2; lctx.beginPath(); lctx.moveTo(c-22,c); lctx.lineTo(c+22,c); lctx.moveTo(c,c-22); lctx.lineTo(c,c+22); lctx.strokeStyle='#fff'; lctx.lineWidth=2; lctx.stroke();
  }

  function toImage(x,y){ return {x:(x-panX)/zoom,y:(y-panY)/zoom}; }
  function pos(e){ const r=rect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; }

  function paintAt(x,y){
    if(x<0||y<0||x>maskCanvas.width||y>maskCanvas.height) return;
    mctx.save(); mctx.globalCompositeOperation=tool==='erase'?'destination-out':'source-over'; mctx.fillStyle='#fff'; mctx.beginPath(); mctx.arc(x,y,brush/2,0,Math.PI*2); mctx.fill(); mctx.restore(); maskDirty=true;
  }

  function paintLine(x1,y1,x2,y2){
    const a=toImage(x1,y1), b=toImage(x2,y2), d=Math.hypot(b.x-a.x,b.y-a.y), step=Math.max(1.2,brush*.18), n=Math.max(1,Math.ceil(d/step));
    for(let i=0;i<=n;i++){ const t=i/n; paintAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t); }
  }

  function colorDistanceSq(i,tr,tg,tb){ const dr=originalPixels[i]-tr,dg=originalPixels[i+1]-tg,db=originalPixels[i+2]-tb; return dr*dr+dg*dg+db*db; }

  function applyMaskIndices(selected){
    const img=mctx.getImageData(0,0,maskCanvas.width,maskCanvas.height), data=img.data;
    for(let i=0;i<selected.length;i++){ const o=selected[i]*4; data[o]=255; data[o+1]=255; data[o+2]=255; data[o+3]=wandAction==='erase'?0:255; }
    mctx.putImageData(img,0,0); maskDirty=true;
  }

  function buildConnectedSelection(seedX,seedY,tolSq){
    const w=originalCanvas.width,h=originalCanvas.height,total=w*h,sx=clamp(Math.round(seedX),0,w-1),sy=clamp(Math.round(seedY),0,h-1),seedIndex=sy*w+sx,base=seedIndex*4,tr=originalPixels[base],tg=originalPixels[base+1],tb=originalPixels[base+2],visited=new Uint8Array(total),queue=new Int32Array(total),selected=[];
    let qh=0,qt=0; queue[qt++]=seedIndex; visited[seedIndex]=1;
    while(qh<qt){ const idx=queue[qh++],off=idx*4; if(colorDistanceSq(off,tr,tg,tb)>tolSq) continue; selected.push(idx); const x=idx%w,y=(idx/w)|0; let n; if(x>0){n=idx-1;if(!visited[n]){visited[n]=1;queue[qt++]=n;}} if(x<w-1){n=idx+1;if(!visited[n]){visited[n]=1;queue[qt++]=n;}} if(y>0){n=idx-w;if(!visited[n]){visited[n]=1;queue[qt++]=n;}} if(y<h-1){n=idx+w;if(!visited[n]){visited[n]=1;queue[qt++]=n;}} }
    return selected;
  }

  function buildGlobalSelection(seedX,seedY,tolSq){
    const w=originalCanvas.width,h=originalCanvas.height,sx=clamp(Math.round(seedX),0,w-1),sy=clamp(Math.round(seedY),0,h-1),seedIndex=(sy*w+sx)*4,tr=originalPixels[seedIndex],tg=originalPixels[seedIndex+1],tb=originalPixels[seedIndex+2],selected=[];
    for(let i=0;i<w*h;i++){ if(colorDistanceSq(i*4,tr,tg,tb)<=tolSq) selected.push(i); }
    return selected;
  }

  function applyWandAt(cssX,cssY){
    if(!originalPixels || !originalCanvas.width || !originalCanvas.height) return;
    const q=toImage(cssX,cssY), tolSq=Math.max(0,wandTolerance*wandTolerance*3.2), selected=wandMode==='global'?buildGlobalSelection(q.x,q.y,tolSq):buildConnectedSelection(q.x,q.y,tolSq);
    if(!selected.length) return; applyMaskIndices(selected); snapshot(); requestRender(false,true); requestLoupe(true);
  }

  function snapshot(){ history.push(mctx.getImageData(0,0,maskCanvas.width,maskCanvas.height)); if(history.length>20) history.shift(); redoStack=[]; updateHistory(); }
  function updateHistory(){ if(!modal) return; modal._undo.disabled=history.length<=1; modal._redo.disabled=!redoStack.length; modal._undo.style.opacity=modal._undo.disabled?'.4':'1'; modal._redo.style.opacity=modal._redo.disabled?'.4':'1'; }
  function undo(){ if(history.length<=1) return; redoStack.push(history.pop()); mctx.putImageData(history[history.length-1],0,0); maskDirty=true; updateHistory(); requestRender(false,true); requestLoupe(true); }
  function redo(){ if(!redoStack.length) return; const s=redoStack.pop(); history.push(s); mctx.putImageData(s,0,0); maskDirty=true; updateHistory(); requestRender(false,true); requestLoupe(true); }
  function resetMask(){ const s=selections[activeSelection]; if(!s?.initialMask) return; mctx.putImageData(cloneImageData(s.initialMask),0,0); history=[cloneImageData(s.initialMask)]; redoStack=[]; maskDirty=true; updateHistory(); requestRender(false,true); requestLoupe(true); }

  function bindEvents(){
    editCanvas.addEventListener('pointerdown',e=>{
      e.preventDefault(); const p=pos(e); pointerX=p.x; pointerY=p.y;
      if(tool==='pan'){ if(activePanPointer!==null && activePanPointer!==e.pointerId) return; activePanPointer=e.pointerId; pointers.clear(); pointers.set(e.pointerId,p); editCanvas.setPointerCapture?.(e.pointerId); panning=true; drawing=false; tapCandidate=false; startPanX=p.x-panX; startPanY=p.y-panY; return; }
      pointers.set(e.pointerId,p); editCanvas.setPointerCapture?.(e.pointerId);
      if(pointers.size>=2){ const a=[...pointers.values()]; pinchDist=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y); pinchZoom=zoom; drawing=false; panning=false; tapCandidate=false; return; }
      if(tool==='wand'){ tapCandidate=true; tapPointerId=e.pointerId; tapStartX=p.x; tapStartY=p.y; drawing=false; panning=false; requestRender(false,true); requestLoupe(); return; }
      drawing=true; lastX=p.x; lastY=p.y; const q=toImage(p.x,p.y); paintAt(q.x,q.y); requestRender(false,true); requestLoupe();
    },{passive:false});

    editCanvas.addEventListener('pointermove',e=>{
      e.preventDefault(); const evs=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[e];
      for(const ev of evs){ const p=pos(ev); pointerX=p.x; pointerY=p.y; if(tool==='pan'){ if(e.pointerId!==activePanPointer||!panning) continue; panX=p.x-startPanX; panY=p.y-startPanY; baseDirty=true; maskDirty=true; continue; } if(pointers.has(e.pointerId)) pointers.set(e.pointerId,p); if(tool==='wand'&&tapCandidate&&e.pointerId===tapPointerId&&Math.hypot(p.x-tapStartX,p.y-tapStartY)>8) tapCandidate=false; if(pointers.size>=2) continue; if(drawing){ paintLine(lastX,lastY,p.x,p.y); lastX=p.x; lastY=p.y; } }
      if(tool!=='pan'&&pointers.size>=2){ const a=[...pointers.values()]; if(a.length>=2&&pinchDist){ const d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2; setZoom(pinchZoom*d/pinchDist,cx,cy); return; } }
      requestRender(tool==='pan',true); requestLoupe();
    },{passive:false});

    const end=e=>{ const wasDrawing=drawing, shouldApplyWand=tool==='wand'&&tapCandidate&&e.pointerId===tapPointerId&&pointers.size<=1; pointers.delete(e.pointerId); if(e.pointerId===activePanPointer){activePanPointer=null;panning=false;} drawing=false; if(wasDrawing) snapshot(); if(shouldApplyWand) applyWandAt(pointerX,pointerY); if(e.pointerId===tapPointerId){tapCandidate=false;tapPointerId=null;} requestRender(false,true); requestLoupe(true); };
    editCanvas.addEventListener('pointerup',end); editCanvas.addEventListener('pointercancel',end);
    window.addEventListener('resize',()=>{ if(modal&&modal.style.display!=='none'){resize();fit();} });
  }

  function cancelEditor(){ modal.style.display='none'; document.body.style.overflow=''; if(resolveEditor){resolveEditor(null);resolveEditor=null;} }

  function buildUnionMask(){
    saveActiveSelection();
    const w=maskCanvas.width,h=maskCanvas.height,union=blankMask(w,h),ud=union.data;
    selections.forEach(s=>{ const d=s.mask?.data; if(!d) return; for(let i=0;i<w*h;i++){ const o=i*4; if(d[o+3]>ud[o+3]) ud[o+3]=d[o+3]; } });
    return union;
  }

  async function validateEditor(){
    const union=buildUnionMask();
    // expose le plan pour le moteur multi-profondeur / actions suivant
    window.happyHoloSelectionPlan=selections.map((s,i)=>({
      index:i+1,name:s.name,depth:s.depth,action:s.action,intensity:s.intensity,timing:s.timing,
      width:s.mask.width,height:s.mask.height,mask:cloneImageData(s.mask)
    }));
    window.dispatchEvent(new CustomEvent('happyholo:selection-plan',{detail:{count:selections.length}}));

    const out=document.createElement('canvas'); out.width=originalCanvas.width; out.height=originalCanvas.height;
    const x=out.getContext('2d'); x.drawImage(originalCanvas,0,0);
    const uc=document.createElement('canvas'); uc.width=out.width; uc.height=out.height; uc.getContext('2d').putImageData(union,0,0);
    x.globalCompositeOperation='destination-in'; x.drawImage(uc,0,0);
    const blob=await new Promise((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error('PNG masque impossible')),'image/png'));
    modal.style.display='none'; document.body.style.overflow=''; if(resolveEditor){resolveEditor(blob);resolveEditor=null;}
  }

  async function editSegmentation(segmentedBlob){
    buildUI();
    const segmented=await new Promise((res,rej)=>{ const u=URL.createObjectURL(segmentedBlob),i=new Image(); i.onload=()=>{URL.revokeObjectURL(u);res(i);}; i.onerror=rej; i.src=u; });
    let original=null; try{ if(typeof sourceImg!=='undefined'&&sourceImg) original=sourceImg; }catch(_){}
    if(!original) original=segmented;
    const w=original.naturalWidth||original.width,h=original.naturalHeight||original.height;
    originalCanvas.width=w; originalCanvas.height=h; octx.clearRect(0,0,w,h); octx.drawImage(original,0,0,w,h); originalImageData=octx.getImageData(0,0,w,h); originalPixels=originalImageData.data;
    maskCanvas.width=w; maskCanvas.height=h; mctx.clearRect(0,0,w,h);
    const sc=document.createElement('canvas'); sc.width=w; sc.height=h; const sx=sc.getContext('2d',{willReadFrequently:true}); sx.drawImage(segmented,0,0,w,h); const d=sx.getImageData(0,0,w,h),out=mctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){ const a=d.data[i*4+3],o=i*4; out.data[o]=255; out.data[o+1]=255; out.data[o+2]=255; out.data[o+3]=a; }
    mctx.putImageData(out,0,0); colorMaskCanvas.width=w; colorMaskCanvas.height=h;

    selections=[{id:Date.now(),name:'Sélection 1',depth:0.48,action:'none',intensity:50,timing:'all',mask:cloneImageData(out),initialMask:cloneImageData(out)}];
    activeSelection=0;
    history=[cloneImageData(out)]; redoStack=[]; pointers.clear(); drawing=false; panning=false; tapCandidate=false; tapPointerId=null; baseDirty=true; maskDirty=true;
    renderPlanList(); updatePlanControls(); updateHistory(); setTool('add');
    modal.style.display='flex'; document.body.style.overflow='hidden'; setTimeout(()=>{resize();fit();},60); setTimeout(()=>{resize();fit();},220);
    return new Promise(resolve=>{resolveEditor=resolve;});
  }

  window.localRemoveBackground=async function(file){
    const workFile=await prepareSegmentationFile(file,1280);
    try{
      const originalLongSide=Math.max(
        (typeof sourceImg!=='undefined' && sourceImg?.naturalWidth)||0,
        (typeof sourceImg!=='undefined' && sourceImg?.naturalHeight)||0
      );
      if(originalLongSide>1280){
        const status=document.querySelector('#status');
        if(status) status.textContent='Optimisation mémoire iPad : détourage calculé sur une copie 1280 px, original conservé pour le rendu.';
      }
    }catch(_){}
    const segmented=await originalLocalRemoveBackground(workFile);
    const corrected=await editSegmentation(segmented);
    if(!corrected) throw new Error('Correction du masque annulée.');
    return corrected;
  };

  console.log('[HAPPYHOLO] éditeur V3.2.5 multi-sélections + aperçu actions + mémoire actif');
})();


/* ===== HappyHolo V3.2.6 — aperçu actions visible + rendu multi-profondeur ===== */
(() => {
  'use strict';

  let originalRenderAt = null;
  try {
    if (typeof renderAt === 'function') originalRenderAt = renderAt;
  } catch (_) {}

  const actionOptions = [
    ['Aucune action','none'],
    ['Personne — clin d’œil','person_wink'],
    ['Personne — sourire léger','person_smile'],
    ['Personne — petit bisou','person_kiss'],
    ['Chat — clignement lent','cat_blink'],
    ['Chat — miaulement','cat_meow'],
    ['Chien — tête penchée','dog_tilt'],
    ['Chien — petit aboiement','dog_bark'],
    ['Moto/voiture — appel de phare','headlight'],
    ['Moto/voiture — clignotant','indicator'],
    ['Logo — brillance','logo_shine'],
    ['Objet/logo — pivot léger','pivot']
  ];

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function plan(){
    return Array.isArray(window.happyHoloSelectionPlan)
      ? window.happyHoloSelectionPlan
      : [];
  }

  function clearCaches(){
    for(const s of plan()){
      delete s._maskSourceCanvas;
      delete s._maskTargets;
      delete s._layers;
    }
  }

  function fitCoverLocal(img,W,H){
    const iw=img.naturalWidth||img.width||1;
    const ih=img.naturalHeight||img.height||1;
    const sc=Math.max(W/iw,H/ih);
    const w=iw*sc,h=ih*sc;
    return {x:(W-w)/2,y:(H-h)/2,w,h};
  }

  function sourceImage(){
    try { if(typeof sourceImg!=='undefined' && sourceImg) return sourceImg; } catch(_){}
    return window.HappyHoloReliefState?.sourceImg || null;
  }

  function bgImage(){
    try { if(typeof backgroundImg!=='undefined' && backgroundImg) return backgroundImg; } catch(_){}
    return window.HappyHoloReliefState?.backgroundImg || null;
  }

  function getMaskSourceCanvas(s){
    if(s._maskSourceCanvas) return s._maskSourceCanvas;
    const m=s.mask;
    if(!m || !m.width || !m.height || !m.data) return null;
    const c=document.createElement('canvas');
    c.width=m.width; c.height=m.height;
    c.getContext('2d').putImageData(m,0,0);
    s._maskSourceCanvas=c;
    return c;
  }

  function getMaskTarget(s,W,H){
    s._maskTargets ||= new Map();
    const key=`${W}x${H}`;
    if(s._maskTargets.has(key)) return s._maskTargets.get(key);

    const src=sourceImage();
    const mc=getMaskSourceCanvas(s);
    if(!src || !mc) return null;

    const c=document.createElement('canvas');
    c.width=W;c.height=H;
    const x=c.getContext('2d');
    const f=fitCoverLocal(src,W,H);
    x.drawImage(mc,0,0,mc.width,mc.height,f.x,f.y,f.w,f.h);
    s._maskTargets.set(key,c);
    return c;
  }

  function getExclusiveLayer(index,W,H){
    const selections=plan();
    const s=selections[index];
    if(!s) return null;

    s._layers ||= new Map();
    const key=`${W}x${H}|${selections.length}`;
    if(s._layers.has(key)) return s._layers.get(key);

    const src=sourceImage();
    const ownMask=getMaskTarget(s,W,H);
    if(!src || !ownMask) return null;

    const c=document.createElement('canvas');
    c.width=W;c.height=H;
    const x=c.getContext('2d');
    const f=fitCoverLocal(src,W,H);

    x.drawImage(src,f.x,f.y,f.w,f.h);
    x.globalCompositeOperation='destination-in';
    x.drawImage(ownMask,0,0);

    // Une sélection créée plus tard prend la priorité dans les zones de recouvrement.
    for(let j=index+1;j<selections.length;j++){
      const later=getMaskTarget(selections[j],W,H);
      if(!later) continue;
      x.globalCompositeOperation='destination-out';
      x.drawImage(later,0,0);
    }
    x.globalCompositeOperation='source-over';

    s._layers.set(key,c);
    return c;
  }

  function multiRenderAt(norm,target){
    const selections=plan();
    if(selections.length<2 || !sourceImage() || !bgImage()){
      if(originalRenderAt) return originalRenderAt(norm,target);
      return;
    }

    try{
      if(!target){
        if(typeof view!=='undefined') target=view;
        else target=window.HappyHoloReliefState?.view;
      }
    }catch(_){
      target=window.HappyHoloReliefState?.view;
    }
    if(!target) return;

    const x=target.getContext('2d');
    const W=target.width,H=target.height;
    x.clearRect(0,0,W,H);

    let amplitude=1.75,bgD=.10;
    try{
      if(typeof angle!=='undefined') amplitude=Number(angle.value)/4;
      if(typeof bgDepth!=='undefined') bgD=Number(bgDepth.value);
    }catch(_){}

    const bg=bgImage();
    const fb=fitCoverLocal(bg,W,H);
    const bgShift=norm*6*amplitude*(bgD/.10);
    x.drawImage(bg,fb.x+bgShift,fb.y,fb.w,fb.h);

    // Les plans les plus éloignés sont dessinés d'abord.
    const order=selections
      .map((s,i)=>({s,i,d:Number(s.depth)||0}))
      .sort((a,b)=>a.d-b.d);

    for(const it of order){
      const layer=getExclusiveLayer(it.i,W,H);
      if(!layer) continue;

      // Échelle compatible avec le réglage historique 0,48.
      const k=clamp((Number(it.s.depth)||0.02)/0.30,0.05,3);
      const shift=norm*18*amplitude*k;
      x.drawImage(layer,shift,0);

      // léger renfort anti-trous, volontairement discret
      x.globalAlpha=.18;
      x.drawImage(layer,shift*.985,0);
      x.globalAlpha=1;
    }
  }

  if(originalRenderAt){
    try { renderAt = multiRenderAt; } catch(_){}
    try { window.renderAt = multiRenderAt; } catch(_){}
  }

  function makeSelect(){
    const s=document.createElement('select');
    Object.assign(s.style,{
      width:'100%',padding:'9px 10px',border:'1px solid #ccc',
      borderRadius:'10px',background:'#fff',font:'inherit'
    });
    return s;
  }

  let mainActionPreviewModal=null, mainActionPreviewCanvas=null, mainActionPreviewCtx=null, mainActionPreviewRAF=0;

  function stopMainActionPreview(){
    cancelAnimationFrame(mainActionPreviewRAF); mainActionPreviewRAF=0;
    if(mainActionPreviewModal) mainActionPreviewModal.style.display='none';
  }

  function ensureMainActionPreviewUI(){
    if(mainActionPreviewModal) return;
    mainActionPreviewModal=document.createElement('div');
    mainActionPreviewModal.id='happyHoloMainActionPreview';
    Object.assign(mainActionPreviewModal.style,{position:'fixed',inset:'0',zIndex:'1000002',background:'rgba(8,8,10,.96)',display:'none',flexDirection:'column',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',color:'#fff'});

    const top=document.createElement('div');
    Object.assign(top.style,{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'#17171a',borderBottom:'1px solid #333'});
    const back=document.createElement('button');
    back.type='button'; back.textContent='← Retour';
    Object.assign(back.style,{padding:'10px 14px',borderRadius:'10px',border:'1px solid #555',background:'#26262a',color:'#fff',fontWeight:'800'});
    back.addEventListener('click',stopMainActionPreview);
    const title=document.createElement('div');
    title.textContent='Aperçu action';
    Object.assign(title.style,{fontWeight:'850',fontSize:'17px',flex:'1'});
    mainActionPreviewModal._title=title;
    const stop=document.createElement('button');
    stop.type='button'; stop.textContent='■ Stop';
    Object.assign(stop.style,{padding:'10px 14px',borderRadius:'10px',border:'1px solid #7a3434',background:'#3a2020',color:'#fff',fontWeight:'800'});
    stop.addEventListener('click',()=>{ cancelAnimationFrame(mainActionPreviewRAF); mainActionPreviewRAF=0; });
    top.append(back,title,stop);

    const body=document.createElement('div');
    Object.assign(body.style,{flex:'1',minHeight:'0',display:'flex',alignItems:'center',justifyContent:'center',padding:'12px'});
    mainActionPreviewCanvas=document.createElement('canvas');
    Object.assign(mainActionPreviewCanvas.style,{maxWidth:'100%',maxHeight:'100%',borderRadius:'14px',background:'#111',boxShadow:'0 12px 40px rgba(0,0,0,.5)'});
    mainActionPreviewCtx=mainActionPreviewCanvas.getContext('2d');
    body.appendChild(mainActionPreviewCanvas);

    const foot=document.createElement('div');
    foot.textContent='Aperçu local de l’action : mouvement + intensité. Les 9 vues ne sont pas encore générées.';
    Object.assign(foot.style,{padding:'9px 12px 13px',textAlign:'center',fontSize:'11px',opacity:'.75'});

    mainActionPreviewModal.append(top,body,foot);
    document.body.appendChild(mainActionPreviewModal);
  }

  function drawActionTransform(ctx,layer,s,t,W,H){
    const intensity=clamp(Number(s.intensity||50)/100,.1,1);
    const action=s.action||'none';
    const phase=Math.sin(t*Math.PI*2);
    const pulse=(1-Math.cos(t*Math.PI*2))/2;
    let rot=0,sx=1,sy=1,dx=0,dy=0,flash=0;

    if(action==='person_wink' || action==='cat_blink') sy=1-pulse*.055*intensity;
    else if(action==='person_smile'){ sy=1+phase*.018*intensity; sx=1+pulse*.012*intensity; }
    else if(action==='person_kiss'){ sx=1+pulse*.028*intensity; sy=1+pulse*.028*intensity; dy=-pulse*3*intensity; }
    else if(action==='cat_meow' || action==='dog_bark'){ sy=1+phase*.026*intensity; dx=phase*2*intensity; }
    else if(action==='dog_tilt') rot=phase*5*intensity;
    else if(action==='pivot'){ rot=phase*6*intensity; sx=1-Math.abs(phase)*.05*intensity; }
    else if(action==='headlight') flash=pulse>.68?.68*intensity:0;
    else if(action==='indicator') flash=(Math.sin(t*Math.PI*6)>0?.48:0)*intensity;
    else if(action==='logo_shine'){ flash=(.10+.28*pulse)*intensity; dx=phase*1.5*intensity; }

    ctx.save();
    ctx.translate(W/2+dx,H/2+dy);
    ctx.rotate(rot*Math.PI/180);
    ctx.scale(sx,sy);
    ctx.drawImage(layer,-W/2,-H/2,W,H);
    ctx.restore();

    if(flash>0){
      ctx.save();
      ctx.globalCompositeOperation='screen';
      ctx.globalAlpha=flash;
      ctx.filter='brightness(2.1) saturate(1.15)';
      ctx.drawImage(layer,0,0,W,H);
      ctx.restore();
    }
  }

  function openMainActionPreview(indices,titleText){
    const selections=plan();
    const src=sourceImage();
    if(!src || !selections.length) return;
    ensureMainActionPreviewUI();

    const valid=indices.filter(i=>selections[i]);
    if(!valid.length) return;
    const maxSide=1050;
    const sw=src.naturalWidth||src.width||1, sh=src.naturalHeight||src.height||1;
    const scale=Math.min(1,maxSide/Math.max(sw,sh));
    const W=Math.max(2,Math.round(sw*scale)), H=Math.max(2,Math.round(sh*scale));
    mainActionPreviewCanvas.width=W; mainActionPreviewCanvas.height=H;

    // Layer exclusif de chaque sélection, déjà aligné sur le cadrage de production.
    const layers=new Map();
    selections.forEach((s,i)=>layers.set(i,getExclusiveLayer(i,W,H)));

    mainActionPreviewModal._title.textContent=titleText||'Aperçu action';
    mainActionPreviewModal.style.display='flex';
    cancelAnimationFrame(mainActionPreviewRAF);
    const start=performance.now();

    const frame=(now)=>{
      if(mainActionPreviewModal.style.display==='none') return;
      const t=((now-start)%2400)/2400;
      const x=mainActionPreviewCtx;
      x.clearRect(0,0,W,H);

      // Fond reconstruit quand il est disponible : évite le sujet doublé.
      const bg=bgImage();
      if(bg){
        const f=fitCoverLocal(bg,W,H);
        x.drawImage(bg,f.x,f.y,f.w,f.h);
      }else{
        const f=fitCoverLocal(src,W,H);
        x.drawImage(src,f.x,f.y,f.w,f.h);
      }

      // Toutes les sélections restent visibles. Seules celles demandées sont animées.
      selections.forEach((s,i)=>{
        const layer=layers.get(i); if(!layer) return;
        if(valid.includes(i) && (s.action||'none')!=='none') drawActionTransform(x,layer,s,t,W,H);
        else x.drawImage(layer,0,0,W,H);
      });

      mainActionPreviewRAF=requestAnimationFrame(frame);
    };
    mainActionPreviewRAF=requestAnimationFrame(frame);
  }

  function ensureControlPanel(){
    const selections=plan();
    if(!selections.length) return;

    let card=document.getElementById('happyHoloSelectionControls');
    if(!card){
      card=document.createElement('div');
      card.id='happyHoloSelectionControls';
      Object.assign(card.style,{
        background:'#fff',border:'2px solid #111',borderRadius:'18px',
        padding:'16px',margin:'16px 0'
      });

      const main=document.querySelector('.card.grid');
      if(main?.parentNode) main.parentNode.insertBefore(card,main.nextSibling);
      else document.body.appendChild(card);
    }

    card.innerHTML='';

    const head=document.createElement('div');
    Object.assign(head.style,{display:'flex',justifyContent:'space-between',gap:'12px',alignItems:'center',marginBottom:'8px'});
    const title=document.createElement('div');
    title.innerHTML='<div style="font-size:19px;font-weight:850">Réglages par sélection</div><div style="font-size:12px;color:#666;margin-top:2px">Les changements de profondeur sont visibles immédiatement dans l’aperçu 3D et seront repris dans les 9 vues.</div>';
    head.appendChild(title);
    const badge=document.createElement('span');
    badge.textContent=`${selections.length} plan${selections.length>1?'s':''}`;
    Object.assign(badge.style,{background:'#e7f7eb',color:'#17652c',padding:'6px 9px',borderRadius:'999px',fontSize:'12px',fontWeight:'800'});
    head.appendChild(badge);
    card.appendChild(head);

    selections.forEach((s,i)=>{
      const row=document.createElement('div');
      Object.assign(row.style,{
        display:'grid',gridTemplateColumns:'150px minmax(180px,1fr) minmax(180px,1fr)',
        gap:'12px',alignItems:'end',padding:'12px 0',
        borderTop:i?'1px solid #ddd':'0'
      });

      const name=document.createElement('div');
      name.innerHTML=`<b>${s.name||`Sélection ${i+1}`}</b><div style="font-size:11px;color:#777;margin-top:4px">Plan ${i+1}</div>`;
      row.appendChild(name);

      const dwrap=document.createElement('label');
      dwrap.style.margin='0';
      const dh=document.createElement('div');
      Object.assign(dh.style,{display:'flex',justifyContent:'space-between',fontSize:'12px',marginBottom:'5px'});
      const dt=document.createElement('span');dt.textContent='Profondeur';
      const dv=document.createElement('b');dv.textContent=Number(s.depth||0).toFixed(2);
      dh.append(dt,dv); dwrap.appendChild(dh);
      const dr=document.createElement('input');
      dr.type='range';dr.min='.02';dr.max='.80';dr.step='.01';dr.value=s.depth||.35;dr.style.width='100%';
      dr.addEventListener('input',()=>{
        s.depth=Number(dr.value);dv.textContent=s.depth.toFixed(2);
      });
      dwrap.appendChild(dr);
      row.appendChild(dwrap);

      const awrap=document.createElement('div');
      const alab=document.createElement('div');
      alab.textContent='Action';
      Object.assign(alab.style,{fontSize:'12px',fontWeight:'700',marginBottom:'5px'});
      awrap.appendChild(alab);
      const asel=makeSelect();
      actionOptions.forEach(([t,v])=>asel.appendChild(new Option(t,v)));
      asel.value=s.action||'none';
      asel.addEventListener('change',()=>{s.action=asel.value;});
      awrap.appendChild(asel);

      const intensityLine=document.createElement('div');
      Object.assign(intensityLine.style,{display:'flex',alignItems:'center',gap:'8px',marginTop:'7px'});
      const intensityLabel=document.createElement('span');
      intensityLabel.textContent='Intensité';
      Object.assign(intensityLabel.style,{fontSize:'10px',color:'#666',minWidth:'48px'});
      const intensity=document.createElement('input');
      intensity.type='range'; intensity.min='10'; intensity.max='100'; intensity.step='5'; intensity.value=Number(s.intensity||50);
      intensity.style.flex='1';
      const intensityOut=document.createElement('b');
      intensityOut.textContent=`${Number(s.intensity||50)}%`;
      Object.assign(intensityOut.style,{fontSize:'10px',minWidth:'34px',textAlign:'right'});
      intensity.addEventListener('input',()=>{ s.intensity=Number(intensity.value); intensityOut.textContent=`${s.intensity}%`; });
      intensityLine.append(intensityLabel,intensity,intensityOut);
      awrap.appendChild(intensityLine);

      const actionButtons=document.createElement('div');
      Object.assign(actionButtons.style,{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'7px',marginTop:'8px'});
      const oneBtn=document.createElement('button');
      oneBtn.type='button'; oneBtn.textContent='▶ Voir cette action';
      const allBtn=document.createElement('button');
      allBtn.type='button'; allBtn.textContent='▶ Voir toutes';
      for(const b of [oneBtn,allBtn]) Object.assign(b.style,{minHeight:'38px',padding:'8px 10px',borderRadius:'10px',border:'1px solid #222',fontWeight:'800',fontSize:'11px',cursor:'pointer'});
      Object.assign(oneBtn.style,{background:'#111',color:'#fff'});
      Object.assign(allBtn.style,{background:'#f1f1f1',color:'#111'});
      oneBtn.addEventListener('click',()=>openMainActionPreview([i],`Aperçu — ${s.name||`Sélection ${i+1}`}`));
      allBtn.addEventListener('click',()=>openMainActionPreview(selections.map((_,j)=>j),'Aperçu — toutes les actions'));
      actionButtons.append(oneBtn,allBtn);
      awrap.appendChild(actionButtons);

      const sub=document.createElement('div');
      sub.textContent='Aperçu local immédiat avant génération des 9 vues.';
      Object.assign(sub.style,{fontSize:'10px',color:'#777',marginTop:'5px'});
      awrap.appendChild(sub);
      row.appendChild(awrap);

      card.appendChild(row);
    });

    // Responsive iPad étroit
    if(window.innerWidth<850){
      card.querySelectorAll(':scope > div').forEach(()=>{});
      for(const row of card.children){
        if(row.style?.display==='grid') row.style.gridTemplateColumns='1fr';
      }
    }
  }

  window.addEventListener('happyholo:selection-plan',()=>{
    clearCaches();
    setTimeout(ensureControlPanel,0);
  });

  window.addEventListener('happyholo-relief-ready',()=>{
    clearCaches();
    ensureControlPanel();
  });

  // Au cas où le plan existe déjà lors d'un rechargement partiel.
  setTimeout(ensureControlPanel,300);

  console.log('[HAPPYHOLO] V3.2.6 rendu multi-profondeur + aperçu actions visible actif');
})();

/* ===== HappyHolo V3.2.7 — vrai aperçu OFFLINE 7 frames ===== */
(() => {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const enabledActions=new Set(['none','person_wink','headlight','pivot']);
  let zoneModal=null,zoneCanvas=null,zoneCtx=null,zoneResolve=null,drag=null;

  function plan(){return Array.isArray(window.happyHoloSelectionPlan)?window.happyHoloSelectionPlan:[];}
  function src(){try{if(typeof sourceImg!=='undefined'&&sourceImg)return sourceImg;}catch(_){} return window.HappyHoloReliefState?.sourceImg||null;}
  function bg(){try{if(typeof backgroundImg!=='undefined'&&backgroundImg)return backgroundImg;}catch(_){} return window.HappyHoloReliefState?.backgroundImg||null;}
  function fit(img,W,H){const iw=img.naturalWidth||img.width||1,ih=img.naturalHeight||img.height||1,sc=Math.max(W/iw,H/ih),w=iw*sc,h=ih*sc;return{x:(W-w)/2,y:(H-h)/2,w,h};}

  function maskCanvas(s,W,H){
    const m=s?.mask;if(!m?.data)return null;
    const raw=document.createElement('canvas');raw.width=m.width;raw.height=m.height;raw.getContext('2d').putImageData(m,0,0);
    const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');const f=fit(src(),W,H);x.drawImage(raw,0,0,raw.width,raw.height,f.x,f.y,f.w,f.h);return c;
  }
  function layerFor(i,W,H){
    const ss=plan(),s=ss[i],im=src(); if(!s||!im)return null;
    const own=maskCanvas(s,W,H);if(!own)return null;
    const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d'),f=fit(im,W,H);x.drawImage(im,f.x,f.y,f.w,f.h);x.globalCompositeOperation='destination-in';x.drawImage(own,0,0);
    for(let j=i+1;j<ss.length;j++){const later=maskCanvas(ss[j],W,H);if(later){x.globalCompositeOperation='destination-out';x.drawImage(later,0,0);}}
    x.globalCompositeOperation='source-over';return c;
  }
  function baseFor(W,H){
    const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');const im=bg()||src();if(im){const f=fit(im,W,H);x.drawImage(im,f.x,f.y,f.w,f.h);}return c;
  }

  function ensureZoneUI(){
    if(zoneModal)return;
    zoneModal=document.createElement('div');Object.assign(zoneModal.style,{position:'fixed',inset:'0',zIndex:'1000008',background:'rgba(8,8,10,.97)',display:'none',flexDirection:'column',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'});
    const top=document.createElement('div');Object.assign(top.style,{padding:'10px 12px',display:'flex',gap:'10px',alignItems:'center',background:'#17171a'});
    const title=document.createElement('b');title.textContent='Définir zone action';title.style.flex='1';zoneModal._title=title;
    const cancel=document.createElement('button');cancel.textContent='Annuler';
    const ok=document.createElement('button');ok.textContent='✓ Valider';
    for(const b of[cancel,ok])Object.assign(b.style,{padding:'10px 14px',borderRadius:'10px',border:'1px solid #555',background:'#26262a',color:'#fff',fontWeight:'800'});
    ok.style.background='#0a84ff';cancel.onclick=()=>finishZone(null);ok.onclick=()=>finishZone(drag?.rect||null);top.append(title,cancel,ok);
    const body=document.createElement('div');Object.assign(body.style,{flex:'1',minHeight:'0',display:'flex',alignItems:'center',justifyContent:'center',padding:'12px'});
    zoneCanvas=document.createElement('canvas');Object.assign(zoneCanvas.style,{maxWidth:'100%',maxHeight:'100%',background:'#111',touchAction:'none',borderRadius:'12px'});zoneCtx=zoneCanvas.getContext('2d');body.appendChild(zoneCanvas);
    const foot=document.createElement('div');foot.textContent='Trace un rectangle autour de l’œil ou du phare avec le doigt / Apple Pencil.';Object.assign(foot.style,{padding:'10px',textAlign:'center',fontSize:'12px',opacity:.8});
    zoneModal.append(top,body,foot);document.body.appendChild(zoneModal);
    const p=e=>{const r=zoneCanvas.getBoundingClientRect();return{x:(e.clientX-r.left)*zoneCanvas.width/r.width,y:(e.clientY-r.top)*zoneCanvas.height/r.height};};
    zoneCanvas.onpointerdown=e=>{e.preventDefault();const a=p(e);drag={start:a,rect:null};zoneCanvas.setPointerCapture?.(e.pointerId);drawZone();};
    zoneCanvas.onpointermove=e=>{if(!drag)return;e.preventDefault();const b=p(e),a=drag.start;drag.rect={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};drawZone();};
  }
  function drawZone(){
    const im=src();if(!im)return;zoneCtx.clearRect(0,0,zoneCanvas.width,zoneCanvas.height);const f=fit(im,zoneCanvas.width,zoneCanvas.height);zoneCtx.drawImage(im,f.x,f.y,f.w,f.h);
    if(drag?.rect){const r=drag.rect;zoneCtx.save();zoneCtx.strokeStyle='#00e5ff';zoneCtx.lineWidth=Math.max(2,zoneCanvas.width/300);zoneCtx.setLineDash([10,7]);zoneCtx.strokeRect(r.x,r.y,r.w,r.h);zoneCtx.fillStyle='rgba(0,229,255,.10)';zoneCtx.fillRect(r.x,r.y,r.w,r.h);zoneCtx.restore();}
  }
  function finishZone(rect){
    zoneModal.style.display='none';const res=rect&&rect.w>8&&rect.h>8?{x:rect.x/zoneCanvas.width,y:rect.y/zoneCanvas.height,w:rect.w/zoneCanvas.width,h:rect.h/zoneCanvas.height}:null;
    const cb=zoneResolve;zoneResolve=null;drag=null;cb?.(res);
  }
  function chooseZone(s,label){
    ensureZoneUI();const im=src();if(!im)return Promise.resolve(null);const max=1000,sw=im.naturalWidth||im.width,sh=im.naturalHeight||im.height,sc=Math.min(1,max/Math.max(sw,sh));zoneCanvas.width=Math.round(sw*sc);zoneCanvas.height=Math.round(sh*sc);zoneModal._title.textContent=label;zoneModal.style.display='flex';drag=s.actionZone?{start:{x:s.actionZone.x*zoneCanvas.width,y:s.actionZone.y*zoneCanvas.height},rect:{x:s.actionZone.x*zoneCanvas.width,y:s.actionZone.y*zoneCanvas.height,w:s.actionZone.w*zoneCanvas.width,h:s.actionZone.h*zoneCanvas.height}}:null;drawZone();return new Promise(r=>zoneResolve=r);
  }

  function patchControls(){
    const card=document.getElementById('happyHoloSelectionControls');if(!card)return;
    const rows=[...card.children].filter(n=>n.style?.display==='grid');
    rows.forEach((row,i)=>{
      const s=plan()[i];if(!s)return;const selects=row.querySelectorAll('select');const asel=selects[selects.length-1];if(!asel)return;
      [...asel.options].forEach(o=>{if(!enabledActions.has(o.value)){o.disabled=true;o.textContent=o.textContent+' — bientôt';}});
      if(!enabledActions.has(asel.value)){s.action='none';asel.value='none';}
      const awrap=asel.parentElement;
      if(awrap.querySelector('.hh327-extra'))return;
      const box=document.createElement('div');box.className='hh327-extra';Object.assign(box.style,{marginTop:'8px',paddingTop:'8px',borderTop:'1px dashed #ccc'});
      const speedLine=document.createElement('div');Object.assign(speedLine.style,{display:'flex',gap:'8px',alignItems:'center'});const lab=document.createElement('span');lab.textContent='Vitesse';Object.assign(lab.style,{fontSize:'10px',color:'#666'});const speed=document.createElement('select');[['Rapide · 1 s',1000],['Normal · 2 s',2000],['Doux · 3 s',3000]].forEach(([t,v])=>speed.append(new Option(t,String(v))));speed.value=String(s.actionSpeed||2000);speed.onchange=()=>s.actionSpeed=Number(speed.value);Object.assign(speed.style,{flex:'1',padding:'6px',borderRadius:'8px'});speedLine.append(lab,speed);box.append(speedLine);
      const zoneBtn=document.createElement('button');zoneBtn.type='button';Object.assign(zoneBtn.style,{width:'100%',marginTop:'7px',padding:'8px',borderRadius:'9px',border:'1px solid #888',background:'#fff',fontWeight:'750',fontSize:'11px'});
      const update=()=>{const a=s.action;if(a==='person_wink'){zoneBtn.style.display='block';zoneBtn.textContent=s.actionZone?'✓ Modifier zone œil':'◎ Définir zone œil';}else if(a==='headlight'){zoneBtn.style.display='block';zoneBtn.textContent=s.actionZone?'✓ Modifier zone phare':'◎ Définir zone phare';}else zoneBtn.style.display='none';};
      zoneBtn.onclick=async()=>{const a=s.action;if(a!=='person_wink'&&a!=='headlight')return;const z=await chooseZone(s,a==='person_wink'?'Zone du clin d’œil':'Zone de l’appel de phare');if(z){s.actionZone=z;update();}};
      asel.addEventListener('change',()=>{s.action=asel.value;if(asel.value!=='person_wink'&&asel.value!=='headlight')delete s.actionZone;update();});box.append(zoneBtn);update();
      const note=document.createElement('div');note.textContent='V3.2.7 OFFLINE · 7 images intermédiaires locales';Object.assign(note.style,{fontSize:'9px',color:'#167337',fontWeight:'800',marginTop:'6px'});box.append(note);awrap.append(box);
    });
  }

  // Remplace le lecteur V3.2.6 par un lecteur de 7 frames réellement précalculées.
  const oldOpen=window.openMainActionPreview;
  function open327(indices,title){
    const engine=window.HappyHoloActionPreviewEngine;if(!engine){alert('Moteur action-preview-engine.js non chargé.');return;}
    const ss=plan(),im=src();if(!ss.length||!im)return;
    const valid=indices.filter(i=>ss[i]);
    for(const i of valid){const s=ss[i];if((s.action==='person_wink'||s.action==='headlight')&&!s.actionZone){alert(s.action==='person_wink'?'Définis d’abord la zone œil.':'Définis d’abord la zone phare.');return;}}
    if(typeof ensureMainActionPreviewUI==='function')ensureMainActionPreviewUI();
    // Les fonctions V3.2.6 sont lexicales; si elles ne sont pas accessibles, on réutilise son modal via le DOM.
    let modal=document.getElementById('happyHoloMainActionPreview'),canvas=modal?.querySelector('canvas');
    if(!modal||!canvas){ if(typeof oldOpen==='function')return oldOpen(indices,title); return; }
    const W=Math.max(2,Math.round((im.naturalWidth||im.width)*Math.min(1,1050/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height)))),H=Math.max(2,Math.round((im.naturalHeight||im.height)*Math.min(1,1050/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height))));canvas.width=W;canvas.height=H;
    const layers=new Map();ss.forEach((_,i)=>layers.set(i,layerFor(i,W,H)));const frames=engine.generateActionFrames({base:baseFor(W,H),layers,selections:ss,activeIndices:valid,W,H});window.happyHoloActionFrames={indices:valid,frames,selections:ss.map((s,i)=>({index:i,action:s.action,intensity:s.intensity,speed:s.actionSpeed||2000,zone:s.actionZone||null}))};
    const titleEl=modal.querySelector('div[style*="font-weight: 850"],div[style*="font-weight:850"]');if(titleEl)titleEl.textContent=title||'Aperçu action';const foot=modal.lastElementChild;if(foot)foot.textContent='Aperçu OFFLINE — 7 images intermédiaires locales. Aucune API, aucun réseau.';modal.style.display='flex';
    const x=canvas.getContext('2d');let raf=0,start=performance.now();const speed=Math.max(700,Math.min(...valid.map(i=>Number(ss[i].actionSpeed||2000))));
    const loop=now=>{if(modal.style.display==='none')return;const cycle=((now-start)%speed)/speed;const idx=Math.min(6,Math.floor(cycle*7));x.clearRect(0,0,W,H);x.drawImage(frames[idx],0,0,W,H);raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);modal._hh327raf=raf;
    const stop=[...modal.querySelectorAll('button')].find(b=>b.textContent.includes('Stop'));if(stop&&!stop._hh327){stop._hh327=true;stop.addEventListener('click',()=>{cancelAnimationFrame(modal._hh327raf||0);});}
    const back=[...modal.querySelectorAll('button')].find(b=>b.textContent.includes('Retour'));if(back&&!back._hh327){back._hh327=true;back.addEventListener('click',()=>cancelAnimationFrame(modal._hh327raf||0));}
  }

  // On intercepte les boutons du panneau après chaque reconstruction.
  function wireButtons(){
    patchControls();const card=document.getElementById('happyHoloSelectionControls');if(!card)return;
    const rows=[...card.children].filter(n=>n.style?.display==='grid');rows.forEach((row,i)=>{const btns=[...row.querySelectorAll('button')];const one=btns.find(b=>b.textContent.includes('Voir cette action'));const all=btns.find(b=>b.textContent.includes('Voir toutes'));if(one&&!one._hh327){one._hh327=true;one.addEventListener('click',e=>{e.stopImmediatePropagation();open327([i],`Aperçu — ${plan()[i]?.name||`Sélection ${i+1}`}`);},true);}if(all&&!all._hh327){all._hh327=true;all.addEventListener('click',e=>{e.stopImmediatePropagation();open327(plan().map((_,j)=>j),'Aperçu — toutes les actions');},true);}});
  }
  window.addEventListener('happyholo:selection-plan',()=>setTimeout(wireButtons,20));window.addEventListener('happyholo-relief-ready',()=>setTimeout(wireButtons,20));setTimeout(wireButtons,600);
  console.log('[HAPPYHOLO] V3.2.7 OFFLINE · 7 frames · zones action actif');
})();
