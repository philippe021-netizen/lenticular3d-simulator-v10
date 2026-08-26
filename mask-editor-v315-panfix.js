/* HappyHolo — éditeur masque V3.16
   iPad / Apple Pencil
   Correction clin d’œil :
   - plus de rectangle imposé
   - Apple Pencil = tracé libre
   - 1 doigt = déplacement
   - 2 doigts = zoom + déplacement
   - sortie compatible actionZone {x,y,w,h}
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
      d.data[o]=255;
      d.data[o+1]=255;
      d.data[o+2]=255;
      d.data[o+3]=0;
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
      margin:'0',
      padding:'12px 14px',
      borderRadius:'10px',
      minHeight:'44px',
      border:accent?'2px solid #0a84ff':'1px solid #444',
      background:accent?'#0a84ff':'#242424',
      color:'#fff',
      fontWeight:'750',
      fontSize:'14px'
    }},parent);
    b.addEventListener('click',fn);
    return b;
  }

  function makeSelect(parent){
    return el('select',{style:{
      width:'100%',
      padding:'9px',
      borderRadius:'9px',
      border:'1px solid #555',
      background:'#101014',
      color:'#fff',
      font:'inherit'
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

    const w=maskCanvas.width;
    const h=maskCanvas.height;
    const blank=blankMask(w,h);

    selections.push({
      id:Date.now()+Math.random(),
      name:`Sélection ${selections.length+1}`,
      depth:0.35,
      action:'none',
      intensity:50,
      timing:'all',
      actionZones:[],
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
        width:'100%',
        margin:'0 0 5px',
        padding:'9px 8px',
        borderRadius:'9px',
        border:i===activeSelection?'2px solid #0a84ff':'1px solid #555',
        background:i===activeSelection?'#0a84ff':'#151519',
        color:'#fff',
        fontWeight:'750',
        textAlign:'left'
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

    try{
      planAction.dispatchEvent(new Event('input'));
    }catch(_){}
  }

  function buildPlanCard(parent){
    const card=el('div',{style:{
      padding:'10px',
      border:'1px solid #3b3b3f',
      borderRadius:'12px',
      background:'#1e1e22',
      display:'flex',
      flexDirection:'column',
      gap:'8px'
    }},parent);

    el('div',{
      text:'Plans / sélections',
      style:{fontSize:'13px',fontWeight:'850'}
    },card);

    el('div',{
      text:'Chaque zone peut avoir sa propre profondeur et sa propre action.',
      style:{fontSize:'10px',opacity:'.72',lineHeight:'1.3'}
    },card);

    planList=el('div',{},card);

    const add=button('＋ Nouvelle sélection',card,addSelection);
    add.style.padding='9px';
    add.style.minHeight='38px';

    const del=button('Supprimer sélection',card,removeActiveSelection);
    del.style.padding='8px';
    del.style.minHeight='34px';
    del.style.fontSize='11px';
    del.style.background='#3a2424';

    const depthLab=el('label',{
      style:{display:'flex',flexDirection:'column',gap:'5px',fontSize:'11px'}
    },card);

    const depthHead=el('div',{
      style:{display:'flex',justifyContent:'space-between'}
    },depthLab);

    el('span',{text:'Profondeur'},depthHead);
    planDepthOut=el('b',{text:'0.48'},depthHead);

    planDepth=el('input',{
      type:'range',
      min:'0.02',
      max:'0.80',
      step:'0.01',
      value:'0.48',
      style:{width:'100%'}
    },depthLab);

    planDepth.addEventListener('input',()=>{
      const s=selections[activeSelection];
      if(!s) return;

      s.depth=Number(planDepth.value);
      planDepthOut.textContent=s.depth.toFixed(2);
    });

    el('label',{
      text:'Action',
      style:{fontSize:'11px',fontWeight:'700'}
    },card);

    planAction=makeSelect(card);

    [
      ['Aucune action','none'],
      ['Moto/voiture — appel de phare','headlight'],
      ['Reflet lumineux local','glint'],
      ['Sujet — rotation 3D verticale légère','yaw3d'],
      ['Couple — rapprochement léger','couple_approach'],
      ['Animal — mouvement d’oreille','animal_ear'],
      ['Objet rigide — pivot léger','pivot']
    ].forEach(([t,v])=>{
      planAction.appendChild(new Option(t,v));
    });

    const editorZoneWrap=el('div',{
      style:{
        display:'none',
        flexDirection:'column',
        gap:'6px'
      }
    },card);

    const editorZoneBtn=button(
      '＋ Ajouter zone plein phare (0/4)',
      editorZoneWrap,
      async()=>{
        const s=selections[activeSelection];
        if(!s) return;

        if(s.action==='person_wink'||s.action==='animal_ear'){
          if(typeof window.HappyHoloChooseActionZone!=='function'){
            alert('Outil de zone action non chargé. Recharge la page puis réessaie.');
            return;
          }

          const z=await window.HappyHoloChooseActionZone(
            {actionZone:s.actionZone||null},
            s.action==='animal_ear'
              ? 'Zone précise de l’oreille — peins uniquement l’oreille'
              : 'Zone du clin d’œil'
          );

          if(z){
            s.actionZone=z;
            updateEditorZoneButton();
          }
          return;
        }

        if(s.action!=='headlight'&&s.action!=='glint') return;

        s.actionZones=Array.isArray(s.actionZones)?s.actionZones:[];

        if(s.actionZones.length>=4){
          alert('4 zones maximum pour cette action.');
          return;
        }

        if(typeof window.HappyHoloChooseActionZone!=='function'){
          alert('Outil de zone action non chargé. Recharge la page puis réessaie.');
          return;
        }

        const isGlint=s.action==='glint';
        const z=await window.HappyHoloChooseActionZone(
          {actionZone:null},
          isGlint
            ? `Zone reflet ${s.actionZones.length+1} — peins uniquement la matière à faire briller`
            : `Zone plein phare ${s.actionZones.length+1} — serre autour de l’optique`
        );

        if(z){
          s.actionZones.push(z);
          updateEditorZoneButton();
        }
      },
      true
    );

    editorZoneBtn.style.width='100%';
    editorZoneBtn.style.margin='2px 0 0';
    editorZoneBtn.style.background='#0a84ff';

    const editorZoneInfo=el('div',{
      text:'',
      style:{
        fontSize:'10px',
        color:'#cfcfcf',
        lineHeight:'1.3'
      }
    },editorZoneWrap);

    const editorRemoveZoneBtn=button(
      '− Supprimer dernière zone',
      editorZoneWrap,
      ()=>{
        const s=selections[activeSelection];

        if(
          !s ||
          !Array.isArray(s.actionZones) ||
          !s.actionZones.length
        ) return;

        s.actionZones.pop();
        updateEditorZoneButton();
      }
    );

    editorRemoveZoneBtn.style.display='none';
    editorRemoveZoneBtn.style.background='#3a3a3a';
    editorRemoveZoneBtn.style.minHeight='36px';
    editorRemoveZoneBtn.style.padding='8px';

    const updateEditorZoneButton=()=>{
      const s=selections[activeSelection];

      if(!s){
        editorZoneWrap.style.display='none';
        return;
      }

      if(s.action==='headlight'||s.action==='glint'){
        s.actionZones=Array.isArray(s.actionZones)?s.actionZones:[];
        const isGlint=s.action==='glint';

        editorZoneWrap.style.display='flex';

        editorZoneBtn.textContent=
          s.actionZones.length>=4
            ? `✓ 4 zones ${isGlint?'reflet':'plein phare'} définies`
            : `＋ Ajouter zone ${isGlint?'reflet':'plein phare'} (${s.actionZones.length}/4)`;

        editorZoneInfo.textContent=
          s.actionZones.length
            ? `${s.actionZones.length} zone${s.actionZones.length>1?'s':''} ${isGlint?'de reflet':'de plein phare'} synchronisée${s.actionZones.length>1?'s':''}.`
            : (isGlint
              ? 'Peins uniquement les yeux, bijoux, médailles, chromes ou carrosseries à faire briller.'
              : 'Sélectionne uniquement les optiques de plein phare. 1 à 4 zones.');

        editorRemoveZoneBtn.style.display=
          s.actionZones.length?'block':'none';

      }else if(s.action==='person_wink'||s.action==='animal_ear'){

        editorZoneWrap.style.display='flex';

        editorZoneBtn.textContent=
          s.actionZone
            ? `✓ Modifier zone ${s.action==='animal_ear'?'oreille':'œil'}`
            : `🎯 Définir zone ${s.action==='animal_ear'?'oreille':'œil'}`;

        editorZoneInfo.textContent=
          s.action==='animal_ear'
            ? 'Apple Pencil : peins uniquement l’oreille, jusqu’à sa base. 1 doigt : déplacer. 2 doigts : zoom.'
            : 'Apple Pencil : entoure librement l’œil. 1 doigt : déplacer. 2 doigts : zoom.';

        editorRemoveZoneBtn.style.display='none';

      }else{
        editorZoneWrap.style.display='none';
      }
    };

    planAction.addEventListener('change',()=>{
      const s=selections[activeSelection];
      if(!s) return;

      const previous=s.action;
      s.action=planAction.value;

      if(previous!==s.action && s.action!=='person_wink' && s.action!=='animal_ear'){
        delete s.actionZone;
      }

      if(previous!==s.action && s.action!=='headlight' && s.action!=='glint'){
        s.actionZones=[];
      }

      updateEditorZoneButton();
    });

    planAction.addEventListener('input',updateEditorZoneButton);
    setTimeout(updateEditorZoneButton,0);

    const intLab=el('label',{
      style:{
        display:'flex',
        flexDirection:'column',
        gap:'5px',
        fontSize:'11px'
      }
    },card);

    const intHead=el('div',{
      style:{
        display:'flex',
        justifyContent:'space-between'
      }
    },intLab);

    el('span',{text:'Intensité'},intHead);
    planIntensityOut=el('b',{text:'50%'},intHead);

    planIntensity=el('input',{
      type:'range',
      min:'10',
      max:'100',
      step:'5',
      value:'50',
      style:{width:'100%'}
    },intLab);

    planIntensity.addEventListener('input',()=>{
      const s=selections[activeSelection];
      if(!s) return;

      s.intensity=Number(planIntensity.value);
      planIntensityOut.textContent=`${s.intensity}%`;
    });

    el('label',{
      text:'Moment dans les 9 vues',
      style:{fontSize:'11px',fontWeight:'700'}
    },card);

    planTiming=makeSelect(card);

    [
      ['Toute la séquence','all'],
      ['Vues 1–3','1-3'],
      ['Vues 4–6','4-6'],
      ['Vues 7–9','7-9']
    ].forEach(([t,v])=>{
      planTiming.appendChild(new Option(t,v));
    });

    planTiming.addEventListener('change',()=>{
      const s=selections[activeSelection];
      if(s) s.timing=planTiming.value;
    });
  }

  /* ==========================================================
     V3.16 — SÉLECTEUR ZONE ACTION
     Apple Pencil = tracé libre
     doigt = déplacement
     deux doigts = zoom
     ========================================================== */

  let zoneModal=null;
  let zoneCanvas=null;
  let zoneCtx=null;
  let zoneResolve=null;
  let zoneState=null;

  function zoneSource(){
    try{
      if(typeof sourceImg!=='undefined' && sourceImg) return sourceImg;
    }catch(_){}

    return originalCanvas?.width
      ? originalCanvas
      : null;
  }

  function zoneFit(img,W,H){
    const iw=img.naturalWidth||img.width||1;
    const ih=img.naturalHeight||img.height||1;

    const s=Math.min(W/iw,H/ih);
    const w=iw*s;
    const h=ih*s;

    return {
      x:(W-w)/2,
      y:(H-h)/2,
      w,
      h
    };
  }

  function zoneImagePoint(clientX,clientY){
    const r=zoneCanvas.getBoundingClientRect();

    const cx=(clientX-r.left)*zoneCanvas.width/r.width;
    const cy=(clientY-r.top)*zoneCanvas.height/r.height;

    const z=zoneState;

    return {
      x:(cx-z.panX)/z.zoom,
      y:(cy-z.panY)/z.zoom
    };
  }

  function pointToCanvas(p){
    const z=zoneState;

    return {
      x:p.x*z.zoom+z.panX,
      y:p.y*z.zoom+z.panY
    };
  }

  function drawZone(){
    if(!zoneCtx || !zoneCanvas || !zoneState) return;

    const im=zoneSource();
    if(!im) return;

    const W=zoneCanvas.width;
    const H=zoneCanvas.height;

    zoneCtx.clearRect(0,0,W,H);

    zoneCtx.save();
    zoneCtx.translate(zoneState.panX,zoneState.panY);
    zoneCtx.scale(zoneState.zoom,zoneState.zoom);

    zoneCtx.drawImage(
      im,
      0,
      0,
      zoneState.imgW,
      zoneState.imgH
    );

    zoneCtx.restore();

    for(const st of zoneState.strokes||[]){
      if(!st?.points?.length)continue;
      zoneCtx.save();zoneCtx.lineJoin='round';zoneCtx.lineCap='round';
      zoneCtx.globalCompositeOperation=st.erase?'destination-out':'source-over';
      zoneCtx.strokeStyle=st.erase?'rgba(255,75,90,.85)':'rgba(0,229,255,.72)';zoneCtx.fillStyle=zoneCtx.strokeStyle;
      zoneCtx.lineWidth=Math.max(3,(Number(st.size)||.02)*Math.max(zoneState.imgW,zoneState.imgH)*zoneState.zoom);
      const toPoint=p=>pointToCanvas({x:p[0]*zoneState.imgW,y:p[1]*zoneState.imgH});
      const first=toPoint(st.points[0]);zoneCtx.beginPath();zoneCtx.moveTo(first.x,first.y);
      if(st.points.length===1){zoneCtx.arc(first.x,first.y,zoneCtx.lineWidth/2,0,Math.PI*2);zoneCtx.fill();}
      else{for(let i=1;i<st.points.length;i++){const p=toPoint(st.points[i]);zoneCtx.lineTo(p.x,p.y);}zoneCtx.stroke();}
      zoneCtx.restore();
    }

    const cx=W/2,cy=H/2;zoneCtx.save();zoneCtx.strokeStyle='rgba(255,255,255,.86)';zoneCtx.lineWidth=1.5;
    zoneCtx.beginPath();zoneCtx.moveTo(cx-11,cy);zoneCtx.lineTo(cx+11,cy);zoneCtx.moveTo(cx,cy-11);zoneCtx.lineTo(cx,cy+11);zoneCtx.stroke();zoneCtx.restore();
  }

  function zoneFromStrokes(){
    const strokes=(zoneState?.strokes||[]).filter(st=>st?.points?.length);
    const points=strokes.filter(st=>!st.erase).flatMap(st=>st.points||[]);
    if(!points.length)return null;

    let minX=Infinity;
    let minY=Infinity;
    let maxX=-Infinity;
    let maxY=-Infinity;

    for(const p of points){
      const x=p[0]*zoneState.imgW,y=p[1]*zoneState.imgH;
      if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;
    }

    const pad=Math.max(4,(Number(zoneState.brush)||.02)*Math.max(zoneState.imgW,zoneState.imgH)*.6);
    const padX=pad,padY=pad;

    minX-=padX;
    maxX+=padX;
    minY-=padY;
    maxY+=padY;

    minX=clamp(minX,0,zoneState.imgW);
    maxX=clamp(maxX,0,zoneState.imgW);
    minY=clamp(minY,0,zoneState.imgH);
    maxY=clamp(maxY,0,zoneState.imgH);

    const w=maxX-minX;
    const h=maxY-minY;

    if(w<5 || h<5) return null;

    return {
      kind:'paint',sourceW:zoneState.imgW,sourceH:zoneState.imgH,
      strokes:strokes.map(st=>({erase:!!st.erase,size:Number(st.size)||zoneState.brush,points:st.points.map(p=>[p[0],p[1]])})),
      x:minX/zoneState.imgW,
      y:minY/zoneState.imgH,
      w:w/zoneState.imgW,
      h:h/zoneState.imgH
    };
  }

  function finishZone(value){
    if(!zoneModal) return;

    zoneModal.style.display='none';

    document.body.style.overflow='';

    const r=zoneResolve;
    zoneResolve=null;

    if(r) r(value);
  }

  function ensureZoneUI(){
    if(zoneModal) return;

    zoneModal=document.createElement('div');

    Object.assign(zoneModal.style,{
      position:'fixed',
      inset:'0',
      zIndex:'1000005',
      background:'rgba(6,6,10,.97)',
      display:'none',
      flexDirection:'column',
      color:'#fff',
      fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'
    });

    const top=document.createElement('div');

    Object.assign(top.style,{
      padding:'10px 12px',
      display:'flex',
      gap:'10px',
      alignItems:'center',
      background:'#17171a'
    });

    const title=document.createElement('b');
    title.textContent='Définir zone action';
    title.style.flex='1';

    zoneModal._title=title;

    const cancel=document.createElement('button');
    cancel.textContent='Annuler';

    const clear=document.createElement('button');
    clear.textContent='Effacer';

    const ok=document.createElement('button');
    ok.textContent='✓ Valider';

    for(const b of[cancel,clear,ok]){
      Object.assign(b.style,{
        padding:'10px 14px',
        borderRadius:'10px',
        border:'1px solid #555',
        background:'#26262a',
        color:'#fff',
        fontWeight:'800'
      });
    }

    ok.style.background='#0a84ff';

    cancel.onclick=()=>finishZone(null);

    clear.onclick=()=>{
      if(!zoneState) return;
      zoneState.strokes=[];
      drawZone();
    };

    ok.onclick=()=>{
      const z=zoneFromStrokes();

      if(!z){
        alert('Peins d’abord précisément la zone avec l’Apple Pencil.');
        return;
      }

      finishZone(z);
    };

    top.append(title,cancel,clear,ok);

    const tools=document.createElement('div');Object.assign(tools.style,{display:'flex',gap:'8px',padding:'8px 12px',background:'#111',alignItems:'center',flexWrap:'wrap'});
    const add=document.createElement('button');add.textContent='✏️ Sélectionner';const erase=document.createElement('button');erase.textContent='⌫ Gomme';
    const brush=document.createElement('input');brush.type='range';brush.min='8';brush.max='90';brush.value='28';Object.assign(brush.style,{flex:'1',minWidth:'130px'});
    for(const b of[add,erase])Object.assign(b.style,{padding:'9px 11px',borderRadius:'9px',border:'1px solid #555',background:'#26262a',color:'#fff',fontWeight:'800'});
    const refresh=()=>{add.style.background=zoneState?.erase?'#26262a':'#087544';erase.style.background=zoneState?.erase?'#8b2732':'#26262a';};
    add.onclick=()=>{if(zoneState)zoneState.erase=false;refresh();drawZone();};erase.onclick=()=>{if(zoneState)zoneState.erase=true;refresh();drawZone();};
    brush.oninput=()=>{if(zoneState)zoneState.brush=Number(brush.value)/Math.max(1,Math.max(zoneState.imgW,zoneState.imgH));drawZone();};tools.append(add,erase,brush);zoneModal._refreshTools=refresh;

    const body=document.createElement('div');

    Object.assign(body.style,{
      flex:'1',
      minHeight:'0',
      position:'relative',
      overflow:'hidden',
      background:'#090909'
    });

    zoneCanvas=document.createElement('canvas');

    Object.assign(zoneCanvas.style,{
      width:'100%',
      height:'100%',
      display:'block',
      background:'#111',
      touchAction:'none'
    });

    zoneCtx=zoneCanvas.getContext('2d');

    body.appendChild(zoneCanvas);

    const foot=document.createElement('div');

    foot.textContent=
      'Apple Pencil : peindre plusieurs zones • Gomme : corriger • 1 doigt : déplacer • 2 doigts : zoom + déplacement';

    Object.assign(foot.style,{
      padding:'10px',
      textAlign:'center',
      fontSize:'12px',
      opacity:.8
    });

    zoneModal.append(top,tools,body,foot);
    document.body.appendChild(zoneModal);

    const activePointers=new Map();

    let drawingPointer=null;
    let panPointer=null;
    let panStartX=0;
    let panStartY=0;

    let pinchStartDist=0;
    let pinchStartZoom=1;
    let pinchStartPanX=0;
    let pinchStartPanY=0;
    let pinchCenterX=0;
    let pinchCenterY=0;

    zoneCanvas.addEventListener('pointerdown',e=>{
      e.preventDefault();

      zoneCanvas.setPointerCapture?.(e.pointerId);

      const r=zoneCanvas.getBoundingClientRect();

      const cx=(e.clientX-r.left)*zoneCanvas.width/r.width;
      const cy=(e.clientY-r.top)*zoneCanvas.height/r.height;

      activePointers.set(e.pointerId,{
        x:cx,
        y:cy,
        type:e.pointerType
      });

      if(e.pointerType==='pen'){
        drawingPointer=e.pointerId;

        const p=zoneImagePoint(e.clientX,e.clientY);
        zoneState.activeStroke={erase:!!zoneState.erase,size:zoneState.brush,points:[[clamp(p.x/zoneState.imgW,0,1),clamp(p.y/zoneState.imgH,0,1)]]};
        zoneState.strokes.push(zoneState.activeStroke);

        drawZone();
        return;
      }

      const touches=[...activePointers.values()]
        .filter(p=>p.type!=='pen');

      if(touches.length===1){
        panPointer=e.pointerId;

        panStartX=cx-zoneState.panX;
        panStartY=cy-zoneState.panY;

      }else if(touches.length>=2){

        const a=touches[0];
        const b=touches[1];

        pinchStartDist=Math.hypot(
          b.x-a.x,
          b.y-a.y
        );

        pinchStartZoom=zoneState.zoom;
        pinchStartPanX=zoneState.panX;
        pinchStartPanY=zoneState.panY;

        pinchCenterX=(a.x+b.x)/2;
        pinchCenterY=(a.y+b.y)/2;
      }
    },{passive:false});

    zoneCanvas.addEventListener('pointermove',e=>{
      e.preventDefault();

      if(!activePointers.has(e.pointerId)) return;

      const r=zoneCanvas.getBoundingClientRect();

      const cx=(e.clientX-r.left)*zoneCanvas.width/r.width;
      const cy=(e.clientY-r.top)*zoneCanvas.height/r.height;

      activePointers.set(e.pointerId,{
        x:cx,
        y:cy,
        type:e.pointerType
      });

      if(
        e.pointerType==='pen' &&
        e.pointerId===drawingPointer
      ){
        const p=zoneImagePoint(e.clientX,e.clientY);

        const q=[clamp(p.x/zoneState.imgW,0,1),clamp(p.y/zoneState.imgH,0,1)],pts=zoneState.activeStroke?.points,last=pts?.[pts.length-1];
        if(pts&&(!last||Math.hypot((q[0]-last[0])*zoneState.imgW,(q[1]-last[1])*zoneState.imgH)>1.2))pts.push(q);

        drawZone();
        return;
      }

      const touches=[...activePointers.values()]
        .filter(p=>p.type!=='pen');

      if(touches.length>=2){

        const a=touches[0];
        const b=touches[1];

        const d=Math.hypot(
          b.x-a.x,
          b.y-a.y
        );

        if(pinchStartDist>0){

          const oldZoom=zoneState.zoom;

          const newZoom=clamp(
            pinchStartZoom*d/pinchStartDist,
            .25,
            12
          );

          const centerX=(a.x+b.x)/2;
          const centerY=(a.y+b.y)/2;

          const imgX=
            (pinchCenterX-pinchStartPanX)/
            pinchStartZoom;

          const imgY=
            (pinchCenterY-pinchStartPanY)/
            pinchStartZoom;

          zoneState.zoom=newZoom;

          zoneState.panX=
            centerX-imgX*newZoom;

          zoneState.panY=
            centerY-imgY*newZoom;

          if(oldZoom!==newZoom){
            drawZone();
          }
        }

        return;
      }

      if(
        touches.length===1 &&
        e.pointerId===panPointer
      ){
        zoneState.panX=cx-panStartX;
        zoneState.panY=cy-panStartY;

        drawZone();
      }

    },{passive:false});

    const end=e=>{
      activePointers.delete(e.pointerId);

      if(e.pointerId===drawingPointer){
        drawingPointer=null;
        if(zoneState)zoneState.activeStroke=null;
      }

      if(e.pointerId===panPointer){
        panPointer=null;
      }

      const touches=[...activePointers.values()]
        .filter(p=>p.type!=='pen');

      if(touches.length<2){
        pinchStartDist=0;
      }

      if(touches.length===1){
        const p=touches[0];

        panStartX=p.x-zoneState.panX;
        panStartY=p.y-zoneState.panY;
      }

      drawZone();
    };

    zoneCanvas.addEventListener('pointerup',end);
    zoneCanvas.addEventListener('pointercancel',end);
  }

  window.HappyHoloChooseActionZone=
    async function(current={},title='Définir zone action'){

      ensureZoneUI();

      const im=zoneSource();

      if(!im){
        alert('Image source indisponible.');
        return null;
      }

      zoneModal._title.textContent=title;

      zoneModal.style.display='flex';
      document.body.style.overflow='hidden';

      await new Promise(r=>requestAnimationFrame(r));

      const rect=zoneCanvas.getBoundingClientRect();
      const dpr=Math.min(window.devicePixelRatio||1,1.5);

      zoneCanvas.width=
        Math.max(300,Math.round(rect.width*dpr));

      zoneCanvas.height=
        Math.max(300,Math.round(rect.height*dpr));

      const iw=im.naturalWidth||im.width;
      const ih=im.naturalHeight||im.height;

      zoneState={
        imgW:iw,
        imgH:ih,
        zoom:1,
        panX:0,
        panY:0,
        strokes:[],activeStroke:null,erase:false,brush:28/Math.max(iw,ih)
      };

      const f=zoneFit(
        {naturalWidth:iw,naturalHeight:ih},
        zoneCanvas.width,
        zoneCanvas.height
      );

      zoneState.zoom=f.w/iw;
      zoneState.panX=f.x;
      zoneState.panY=f.y;

      if(current?.actionZone?.kind==='paint'&&Array.isArray(current.actionZone.strokes)){
        zoneState.strokes=current.actionZone.strokes.map(st=>({erase:!!st.erase,size:Number(st.size)||zoneState.brush,points:(st.points||[]).map(p=>[Number(p[0])||0,Number(p[1])||0])}));
      }else if(current?.actionZone){
        const z=current.actionZone;

        const x=z.x*iw;
        const y=z.y*ih;
        const w=z.w*iw;
        const h=z.h*ih;

        zoneState.strokes=[{erase:false,size:zoneState.brush,points:[[x/iw,y/ih],[(x+w)/iw,y/ih],[(x+w)/iw,(y+h)/ih],[x/iw,(y+h)/ih],[x/iw,y/ih]]}];
      }

      zoneModal._refreshTools?.();
      drawZone();

      return new Promise(resolve=>{
        zoneResolve=resolve;
      });
    };

  function buildUI(){
    if(modal) return;

    modal=el('div',{style:{
      position:'fixed',
      inset:'0',
      zIndex:'999999',
      background:'#0c0c0f',
      display:'none',
      flexDirection:'column',
      color:'#fff',
      fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'
    }},document.body);

    const top=el('div',{style:{
      display:'flex',
      alignItems:'center',
      gap:'8px',
      padding:'9px 12px',
      background:'#17171a',
      borderBottom:'1px solid #333',
      flexWrap:'wrap'
    }},modal);

    button('← Annuler',top,cancelEditor);

    el('div',{
      text:'Correction du sujet',
      style:{
        fontWeight:'800',
        fontSize:'18px',
        flex:'1'
      }
    },top);

    modal._undo=button('↶',top,undo);
    modal._redo=button('↷',top,redo);

    button('✓ Valider',top,validateEditor,true);

    const body=el('div',{
      style:{
        display:'flex',
        flex:'1',
        minHeight:'0',
        overflow:'hidden'
      }
    },modal);

    tools=el('div',{style:{
      width:'188px',
      maxWidth:'42vw',
      padding:'10px',
      background:'#17171a',
      borderRight:'1px solid #333',
      display:'flex',
      flexDirection:'column',
      gap:'8px',
      overflowY:'auto'
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
      marginTop:'2px',
      padding:'10px',
      border:'1px solid #3b3b3f',
      borderRadius:'12px',
      background:'#1e1e22',
      display:'flex',
      flexDirection:'column',
      gap:'8px'
    }},tools);

    el('div',{
      text:'Baguette',
      style:{
        fontSize:'13px',
        fontWeight:'800',
        opacity:'.95'
      }
    },wandCard);

    el('label',{
      text:'Action',
      style:{
        fontSize:'12px',
        fontWeight:'700'
      }
    },wandCard);

    modal._wandAction=makeSelect(wandCard);

    modal._wandAction.appendChild(
      new Option('Ajouter au masque','add')
    );

    modal._wandAction.appendChild(
      new Option('Retirer du masque','erase')
    );

    modal._wandAction.value=wandAction;

    modal._wandAction.addEventListener('change',()=>{
      wandAction=
        modal._wandAction.value==='erase'
          ? 'erase'
          : 'add';

      requestRender(false,true);
    });

    el('label',{
      text:'Portée',
      style:{
        fontSize:'12px',
        fontWeight:'700'
      }
    },wandCard);

    modal._wandMode=makeSelect(wandCard);

    modal._wandMode.appendChild(
      new Option('Zone connectée','connected')
    );

    modal._wandMode.appendChild(
      new Option('Toutes couleurs similaires','global')
    );

    modal._wandMode.value=wandMode;

    modal._wandMode.addEventListener('change',()=>{
      wandMode=modal._wandMode.value;
    });

    const tolWrap=el('label',{
      style:{
        display:'flex',
        flexDirection:'column',
        gap:'6px'
      }
    },wandCard);

    modal._wandTolLabel=el('div',{
      text:`Tolérance ${wandTolerance}`,
      style:{
        fontSize:'12px',
        fontWeight:'700'
      }
    },tolWrap);

    modal._wandTolerance=el('input',{
      type:'range',
      min:0,
      max:120,
      value:wandTolerance,
      style:{width:'100%'}
    },tolWrap);

    modal._wandTolerance.addEventListener('input',()=>{
      wandTolerance=Number(
        modal._wandTolerance.value
      );

      modal._wandTolLabel.textContent=
        `Tolérance ${wandTolerance}`;
    });

    modal._wandHint=el('div',{
      text:'Touchez une couleur pour sélectionner. Le pinceau reste disponible pour les retouches.',
      style:{
        fontSize:'11px',
        opacity:'.82',
        lineHeight:'1.35'
      }
    },wandCard);

    work=el('div',{style:{
      position:'relative',
      flex:'1',
      minWidth:'0',
      minHeight:'0',
      overflow:'hidden',
      background:'#111'
    }},body);

    const canvasStyle={
      position:'absolute',
      left:'0',
      top:'0',
      right:'0',
      bottom:'0',
      width:'100%',
      height:'100%',
      display:'block',
      aspectRatio:'auto',
      objectFit:'fill',
      borderRadius:'0',
      background:'transparent',
      maxWidth:'none',
      maxHeight:'none',
      margin:'0',
      padding:'0'
    };

    baseCanvas=el('canvas',{
      style:{
        ...canvasStyle,
        pointerEvents:'none'
      }
    },work);

    baseCtx=baseCanvas.getContext('2d');

    editCanvas=el('canvas',{
      style:{
        ...canvasStyle,
        touchAction:'none'
      }
    },work);

    editCtx=editCanvas.getContext('2d');

    const lw=el('div',{style:{
      position:'absolute',
      right:'14px',
      top:'14px',
      width:'190px',
      height:'190px',
      maxWidth:'40vw',
      maxHeight:'40vw',
      border:'2px solid white',
      borderRadius:'50%',
      overflow:'hidden',
      background:'#000',
      boxShadow:'0 4px 22px #0009',
      pointerEvents:'none'
    }},work);

    loupe=el('canvas',{
      width:260,
      height:260,
      style:{
        width:'100%',
        height:'100%',
        display:'block',
        background:'#000'
      }
    },lw);

    lctx=loupe.getContext('2d');

    const bottom=el('div',{style:{
      padding:'9px 12px',
      background:'#17171a',
      borderTop:'1px solid #333',
      display:'flex',
      gap:'14px',
      alignItems:'center',
      flexWrap:'wrap'
    }},modal);

    const lab=el('label',{
      text:'Pinceau',
      style:{
        display:'flex',
        gap:'8px',
        alignItems:'center',
        margin:'0',
        color:'#fff'
      }
    },bottom);

    const range=el('input',{
      type:'range',
      min:4,
      max:160,
      value:brush,
      style:{width:'155px'}
    },lab);

    range.addEventListener('input',()=>{
      brush=Number(range.value);

      requestRender(false,true);
      requestLoupe(true);
    });

    modal._statusText=el('span',{
      text:'Vert = ajouter • Rouge = retirer • 2 doigts = zoom',
      style:{
        fontSize:'12px',
        opacity:'.75'
      }
    },bottom);

    originalCanvas=document.createElement('canvas');
    octx=originalCanvas.getContext('2d');

    maskCanvas=document.createElement('canvas');
    mctx=maskCanvas.getContext('2d',{
      willReadFrequently:true
    });

    colorMaskCanvas=document.createElement('canvas');
    cmctx=colorMaskCanvas.getContext('2d');

    bindEvents();
  }

  function rect(){
    return editCanvas.getBoundingClientRect();
  }

  function updateToolUI(){
    [
      ['add',modal._add],
      ['erase',modal._erase],
      ['wand',modal._wand],
      ['pan',modal._pan]
    ].forEach(([k,b])=>{
      const active=k===tool;

      b.style.background=
        active?'#0a84ff':'#242424';

      b.style.borderColor=
        active?'#0a84ff':'#444';
    });

    const wandOn=tool==='wand';

    modal._wandAction.disabled=!wandOn;
    modal._wandMode.disabled=!wandOn;
    modal._wandTolerance.disabled=!wandOn;

    modal._wandHint.style.opacity=
      wandOn?'.95':'.55';

    if(modal._statusText){

      if(tool==='wand'){
        modal._statusText.textContent=
          `Baguette — ${selections[activeSelection]?.name||''} • toucher pour sélectionner • 2 doigts = zoom`;

      }else if(tool==='pan'){
        modal._statusText.textContent=
          'Déplacer : glisser pour translater l’image';

      }else{
        modal._statusText.textContent=
          `${selections[activeSelection]?.name||''} • Vert = ajouter • Rouge = retirer • 2 doigts = zoom`;
      }
    }
  }

  function setTool(t){
    tool=t;

    updateToolUI();
    requestRender(false,true);
    requestLoupe(true);
  }

  function resize(){
    const r=rect();
    const dpr=Math.min(
      window.devicePixelRatio||1,
      1.5
    );

    const w=Math.max(
      2,
      Math.round(r.width*dpr)
    );

    const h=Math.max(
      2,
      Math.round(r.height*dpr)
    );

    if(
      baseCanvas.width!==w ||
      baseCanvas.height!==h
    ){
      baseCanvas.width=w;
      baseCanvas.height=h;
      editCanvas.width=w;
      editCanvas.height=h;

      baseDirty=true;
      maskDirty=true;
    }

    requestRender(true,true);
  }

  function fit(){
    const r=rect();

    if(
      !originalCanvas.width ||
      r.width<10 ||
      r.height<10
    ) return;

    zoom=Math.min(
      r.width/originalCanvas.width,
      r.height/originalCanvas.height
    )*.94;

    panX=
      (r.width-originalCanvas.width*zoom)/2;

    panY=
      (r.height-originalCanvas.height*zoom)/2;

    baseDirty=true;
    maskDirty=true;

    requestRender(true,true);
    requestLoupe(true);
  }

  function setZoom(z,cx,cy){
    const r=rect();

    cx=cx??r.width/2;
    cy=cy??r.height/2;

    const old=zoom||1;

    const ix=(cx-panX)/old;
    const iy=(cy-panY)/old;

    zoom=clamp(z,.03,16);

    panX=cx-ix*zoom;
    panY=cy-iy*zoom;

    baseDirty=true;
    maskDirty=true;

    requestRender(true,true);
    requestLoupe(true);
  }

  function rebuildColorMask(){
    if(!maskDirty) return;

    maskDirty=false;

    if(
      colorMaskCanvas.width!==maskCanvas.width ||
      colorMaskCanvas.height!==maskCanvas.height
    ){
      colorMaskCanvas.width=maskCanvas.width;
      colorMaskCanvas.height=maskCanvas.height;
    }

    cmctx.setTransform(1,0,0,1,0,0);
    cmctx.clearRect(
      0,
      0,
      colorMaskCanvas.width,
      colorMaskCanvas.height
    );

    cmctx.fillStyle=
      'rgba(0,160,255,.46)';

    cmctx.fillRect(
      0,
      0,
      colorMaskCanvas.width,
      colorMaskCanvas.height
    );

    cmctx.globalCompositeOperation=
      'destination-in';

    cmctx.drawImage(maskCanvas,0,0);

    cmctx.globalCompositeOperation=
      'source-over';
  }

  function requestRender(base=false,overlay=true){
    if(base) baseDirty=true;
    if(overlay) maskDirty=true;

    if(renderRAF) return;

    renderRAF=requestAnimationFrame(()=>{
      renderRAF=0;

      drawBase();
      drawOverlay();
    });
  }

  function drawBase(){
    if(!baseDirty) return;

    baseDirty=false;

    const r=rect();

    const sx=
      baseCanvas.width/
      Math.max(1,r.width);

    const sy=
      baseCanvas.height/
      Math.max(1,r.height);

    baseCtx.setTransform(1,0,0,1,0,0);

    baseCtx.clearRect(
      0,
      0,
      baseCanvas.width,
      baseCanvas.height
    );

    baseCtx.imageSmoothingEnabled=true;

    baseCtx.drawImage(
      originalCanvas,
      0,
      0,
      originalCanvas.width,
      originalCanvas.height,
      panX*sx,
      panY*sy,
      originalCanvas.width*zoom*sx,
      originalCanvas.height*zoom*sy
    );
  }

  function drawOverlay(){
    rebuildColorMask();

    const r=rect();

    const sx=
      editCanvas.width/
      Math.max(1,r.width);

    const sy=
      editCanvas.height/
      Math.max(1,r.height);

    editCtx.setTransform(1,0,0,1,0,0);

    editCtx.clearRect(
      0,
      0,
      editCanvas.width,
      editCanvas.height
    );

    editCtx.imageSmoothingEnabled=true;

    editCtx.drawImage(
      colorMaskCanvas,
      0,
      0,
      colorMaskCanvas.width,
      colorMaskCanvas.height,
      panX*sx,
      panY*sy,
      originalCanvas.width*zoom*sx,
      originalCanvas.height*zoom*sy
    );

    if(tool!=='pan' && pointers.size<2){

      if(tool==='wand'){

        const px=pointerX*sx;
        const py=pointerY*sy;

        editCtx.beginPath();

        editCtx.moveTo(px-18*sx,py);
        editCtx.lineTo(px+18*sx,py);

        editCtx.moveTo(px,py-18*sy);
        editCtx.lineTo(px,py+18*sy);

        editCtx.lineWidth=
          2*Math.max(sx,sy);

        editCtx.strokeStyle=
          wandAction==='erase'
            ? '#ff6b6b'
            : '#7ef3ac';

        editCtx.stroke();

      }else{

        const radiusCss=
          Math.max(
            5,
            brush*zoom/2
          );

        editCtx.beginPath();

        editCtx.ellipse(
          pointerX*sx,
          pointerY*sy,
          radiusCss*sx,
          radiusCss*sy,
          0,
          0,
          Math.PI*2
        );

        editCtx.lineWidth=
          2*Math.max(sx,sy);

        editCtx.strokeStyle=
          tool==='erase'
            ? '#ff5252'
            : '#22e67b';

        editCtx.stroke();
      }
    }
  }

  function requestLoupe(force=false){
    if(force) lastLoupe=0;
    if(loupeRAF) return;

    loupeRAF=requestAnimationFrame(ts=>{
      loupeRAF=0;

      const delay=
        drawing?70:40;

      if(
        force ||
        ts-lastLoupe>=delay
      ){
        lastLoupe=ts;
        renderLoupe();
      }
    });
  }

  function renderLoupe(){
    if(!lctx || !originalCanvas.width) return;

    rebuildColorMask();

    const p=toImage(pointerX,pointerY);

    const src=Math.max(
      30,
      Math.min(
        190,
        130/Math.max(.05,zoom)
      )
    );

    const sx=p.x-src/2;
    const sy=p.y-src/2;

    lctx.clearRect(
      0,
      0,
      loupe.width,
      loupe.height
    );

    lctx.imageSmoothingEnabled=true;

    lctx.drawImage(
      originalCanvas,
      sx,
      sy,
      src,
      src,
      0,
      0,
      loupe.width,
      loupe.height
    );

    lctx.drawImage(
      colorMaskCanvas,
      sx,
      sy,
      src,
      src,
      0,
      0,
      loupe.width,
      loupe.height
    );

    const c=loupe.width/2;

    lctx.beginPath();

    lctx.moveTo(c-22,c);
    lctx.lineTo(c+22,c);

    lctx.moveTo(c,c-22);
    lctx.lineTo(c,c+22);

    lctx.strokeStyle='#fff';
    lctx.lineWidth=2;
    lctx.stroke();
  }

  function toImage(x,y){
    return {
      x:(x-panX)/zoom,
      y:(y-panY)/zoom
    };
  }

  function pos(e){
    const r=rect();

    return {
      x:e.clientX-r.left,
      y:e.clientY-r.top
    };
  }

  function paintAt(x,y){
    if(
      x<0 ||
      y<0 ||
      x>maskCanvas.width ||
      y>maskCanvas.height
    ) return;

    mctx.save();

    mctx.globalCompositeOperation=
      tool==='erase'
        ? 'destination-out'
        : 'source-over';

    mctx.fillStyle='#fff';

    mctx.beginPath();

    mctx.arc(
      x,
      y,
      brush/2,
      0,
      Math.PI*2
    );

    mctx.fill();

    mctx.restore();

    maskDirty=true;
  }

  function paintLine(x1,y1,x2,y2){
    const a=toImage(x1,y1);
    const b=toImage(x2,y2);

    const d=Math.hypot(
      b.x-a.x,
      b.y-a.y
    );

    const step=Math.max(
      1.2,
      brush*.18
    );

    const n=Math.max(
      1,
      Math.ceil(d/step)
    );

    for(let i=0;i<=n;i++){
      const t=i/n;

      paintAt(
        a.x+(b.x-a.x)*t,
        a.y+(b.y-a.y)*t
      );
    }
  }

  function colorDistanceSq(i,tr,tg,tb){
    const dr=originalPixels[i]-tr;
    const dg=originalPixels[i+1]-tg;
    const db=originalPixels[i+2]-tb;

    return dr*dr+dg*dg+db*db;
  }

  function applyMaskIndices(selected){
    const img=mctx.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    );

    const data=img.data;

    for(let i=0;i<selected.length;i++){
      const o=selected[i]*4;

      data[o]=255;
      data[o+1]=255;
      data[o+2]=255;
      data[o+3]=
        wandAction==='erase'
          ? 0
          : 255;
    }

    mctx.putImageData(img,0,0);

    maskDirty=true;
  }

  function buildConnectedSelection(seedX,seedY,tolSq){
    const w=originalCanvas.width;
    const h=originalCanvas.height;
    const total=w*h;

    const sx=clamp(
      Math.round(seedX),
      0,
      w-1
    );

    const sy=clamp(
      Math.round(seedY),
      0,
      h-1
    );

    const seedIndex=
      sy*w+sx;

    const base=
      seedIndex*4;

    const tr=originalPixels[base];
    const tg=originalPixels[base+1];
    const tb=originalPixels[base+2];

    const visited=
      new Uint8Array(total);

    const queue=
      new Int32Array(total);

    const selected=[];

    let qh=0;
    let qt=0;

    queue[qt++]=seedIndex;
    visited[seedIndex]=1;

    while(qh<qt){

      const idx=queue[qh++];
      const off=idx*4;

      if(
        colorDistanceSq(
          off,
          tr,
          tg,
          tb
        )>tolSq
      ) continue;

      selected.push(idx);

      const x=idx%w;
      const y=(idx/w)|0;

      let n;

      if(x>0){
        n=idx-1;

        if(!visited[n]){
          visited[n]=1;
          queue[qt++]=n;
        }
      }

      if(x<w-1){
        n=idx+1;

        if(!visited[n]){
          visited[n]=1;
          queue[qt++]=n;
        }
      }

      if(y>0){
        n=idx-w;

        if(!visited[n]){
          visited[n]=1;
          queue[qt++]=n;
        }
      }

      if(y<h-1){
        n=idx+w;

        if(!visited[n]){
          visited[n]=1;
          queue[qt++]=n;
        }
      }
    }

    return selected;
  }

  function buildGlobalSelection(seedX,seedY,tolSq){
    const w=originalCanvas.width;
    const h=originalCanvas.height;

    const sx=clamp(
      Math.round(seedX),
      0,
      w-1
    );

    const sy=clamp(
      Math.round(seedY),
      0,
      h-1
    );

    const seedIndex=
      (sy*w+sx)*4;

    const tr=originalPixels[seedIndex];
    const tg=originalPixels[seedIndex+1];
    const tb=originalPixels[seedIndex+2];

    const selected=[];

    for(let i=0;i<w*h;i++){
      if(
        colorDistanceSq(
          i*4,
          tr,
          tg,
          tb
        )<=tolSq
      ){
        selected.push(i);
      }
    }

    return selected;
  }

  function applyWandAt(cssX,cssY){
    if(
      !originalPixels ||
      !originalCanvas.width ||
      !originalCanvas.height
    ) return;

    const q=toImage(cssX,cssY);

    const tolSq=
      Math.max(
        0,
        wandTolerance*
        wandTolerance*
        3.2
      );

    const selected=
      wandMode==='global'
        ? buildGlobalSelection(
            q.x,
            q.y,
            tolSq
          )
        : buildConnectedSelection(
            q.x,
            q.y,
            tolSq
          );

    if(!selected.length) return;

    applyMaskIndices(selected);

    snapshot();
    requestRender(false,true);
    requestLoupe(true);
  }

  function snapshot(){
    history.push(
      mctx.getImageData(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height
      )
    );

    if(history.length>20){
      history.shift();
    }

    redoStack=[];

    updateHistory();
  }

  function updateHistory(){
    if(!modal) return;

    modal._undo.disabled=
      history.length<=1;

    modal._redo.disabled=
      !redoStack.length;

    modal._undo.style.opacity=
      modal._undo.disabled
        ? '.4'
        : '1';

    modal._redo.style.opacity=
      modal._redo.disabled
        ? '.4'
        : '1';
  }

  function undo(){
    if(history.length<=1) return;

    redoStack.push(history.pop());

    mctx.putImageData(
      history[history.length-1],
      0,
      0
    );

    maskDirty=true;

    updateHistory();
    requestRender(false,true);
    requestLoupe(true);
  }

  function redo(){
    if(!redoStack.length) return;

    const s=redoStack.pop();

    history.push(s);

    mctx.putImageData(s,0,0);

    maskDirty=true;

    updateHistory();
    requestRender(false,true);
    requestLoupe(true);
  }

  function resetMask(){
    const s=selections[activeSelection];

    if(!s?.initialMask) return;

    mctx.putImageData(
      cloneImageData(s.initialMask),
      0,
      0
    );

    history=[
      cloneImageData(s.initialMask)
    ];

    redoStack=[];
    maskDirty=true;

    updateHistory();
    requestRender(false,true);
    requestLoupe(true);
  }

  function bindEvents(){
    editCanvas.addEventListener('pointerdown',e=>{
      e.preventDefault();

      const p=pos(e);

      pointerX=p.x;
      pointerY=p.y;

      if(tool==='pan'){
        if(
          activePanPointer!==null &&
          activePanPointer!==e.pointerId
        ) return;

        activePanPointer=e.pointerId;

        pointers.clear();
        pointers.set(e.pointerId,p);

        editCanvas.setPointerCapture?.(
          e.pointerId
        );

        panning=true;
        drawing=false;
        tapCandidate=false;

        startPanX=p.x-panX;
        startPanY=p.y-panY;

        return;
      }

      pointers.set(e.pointerId,p);

      editCanvas.setPointerCapture?.(
        e.pointerId
      );

      if(pointers.size>=2){

        const a=[
          ...pointers.values()
        ];

        pinchDist=Math.hypot(
          a[1].x-a[0].x,
          a[1].y-a[0].y
        );

        pinchZoom=zoom;

        drawing=false;
        panning=false;
        tapCandidate=false;

        return;
      }

      if(tool==='wand'){

        tapCandidate=true;
        tapPointerId=e.pointerId;
        tapStartX=p.x;
        tapStartY=p.y;

        drawing=false;
        panning=false;

        requestRender(false,true);
        requestLoupe();

        return;
      }

      drawing=true;

      lastX=p.x;
      lastY=p.y;

      const q=toImage(
        p.x,
        p.y
      );

      paintAt(q.x,q.y);

      requestRender(false,true);
      requestLoupe();

    },{passive:false});

    editCanvas.addEventListener('pointermove',e=>{
      e.preventDefault();

      const evs=
        typeof e.getCoalescedEvents==='function'
          ? e.getCoalescedEvents()
          : [e];

      for(const ev of evs){

        const p=pos(ev);

        pointerX=p.x;
        pointerY=p.y;

        if(tool==='pan'){

          if(
            e.pointerId!==activePanPointer ||
            !panning
          ) continue;

          panX=p.x-startPanX;
          panY=p.y-startPanY;

          baseDirty=true;
          maskDirty=true;

          continue;
        }

        if(pointers.has(e.pointerId)){
          pointers.set(e.pointerId,p);
        }

        if(
          tool==='wand' &&
          tapCandidate &&
          e.pointerId===tapPointerId &&
          Math.hypot(
            p.x-tapStartX,
            p.y-tapStartY
          )>8
        ){
          tapCandidate=false;
        }

        if(pointers.size>=2) continue;

        if(drawing){
          paintLine(
            lastX,
            lastY,
            p.x,
            p.y
          );

          lastX=p.x;
          lastY=p.y;
        }
      }

      if(
        tool!=='pan' &&
        pointers.size>=2
      ){

        const a=[
          ...pointers.values()
        ];

        if(
          a.length>=2 &&
          pinchDist
        ){

          const d=Math.hypot(
            a[1].x-a[0].x,
            a[1].y-a[0].y
          );

          const cx=
            (a[0].x+a[1].x)/2;

          const cy=
            (a[0].y+a[1].y)/2;

          setZoom(
            pinchZoom*d/pinchDist,
            cx,
            cy
          );

          return;
        }
      }

      requestRender(
        tool==='pan',
        true
      );

      requestLoupe();

    },{passive:false});

    const end=e=>{

      const wasDrawing=drawing;

      const shouldApplyWand=
        tool==='wand' &&
        tapCandidate &&
        e.pointerId===tapPointerId &&
        pointers.size<=1;

      pointers.delete(e.pointerId);

      if(
        e.pointerId===activePanPointer
      ){
        activePanPointer=null;
        panning=false;
      }

      drawing=false;

      if(wasDrawing){
        snapshot();
      }

      if(shouldApplyWand){
        applyWandAt(
          pointerX,
          pointerY
        );
      }

      if(
        e.pointerId===tapPointerId
      ){
        tapCandidate=false;
        tapPointerId=null;
      }

      requestRender(false,true);
      requestLoupe(true);
    };

    editCanvas.addEventListener(
      'pointerup',
      end
    );

    editCanvas.addEventListener(
      'pointercancel',
      end
    );

    window.addEventListener(
      'resize',
      ()=>{
        if(
          modal &&
          modal.style.display!=='none'
        ){
          resize();
          fit();
        }
      }
    );
  }

  function cancelEditor(){
    modal.style.display='none';
    document.body.style.overflow='';

    if(resolveEditor){
      resolveEditor(null);
      resolveEditor=null;
    }
  }

  function buildUnionMask(){
    saveActiveSelection();

    const w=maskCanvas.width;
    const h=maskCanvas.height;

    const union=blankMask(w,h);
    const ud=union.data;

    selections.forEach(s=>{
      const d=s.mask?.data;

      if(!d) return;

      for(let i=0;i<w*h;i++){
        const o=i*4;

        if(d[o+3]>ud[o+3]){
          ud[o+3]=d[o+3];
        }
      }
    });

    return union;
  }

  async function validateEditor(){
    const union=buildUnionMask();

    window.happyHoloSelectionPlan=
      selections.map((s,i)=>({
        index:i+1,
        name:s.name,
        depth:s.depth,
        action:s.action,
        intensity:s.intensity,
        timing:s.timing,
        actionZone:s.actionZone||null,
        actionZones:Array.isArray(s.actionZones)
          ? s.actionZones
          : [],
        width:s.mask.width,
        height:s.mask.height,
        mask:cloneImageData(s.mask)
      }));

    window.dispatchEvent(
      new CustomEvent(
        'happyholo:selection-plan',
        {
          detail:{
            count:selections.length
          }
        }
      )
    );

    const out=
      document.createElement('canvas');

    out.width=
      originalCanvas.width;

    out.height=
      originalCanvas.height;

    const x=out.getContext('2d');

    x.drawImage(
      originalCanvas,
      0,
      0
    );

    const uc=
      document.createElement('canvas');

    uc.width=out.width;
    uc.height=out.height;

    uc.getContext('2d')
      .putImageData(
        union,
        0,
        0
      );

    x.globalCompositeOperation=
      'destination-in';

    x.drawImage(uc,0,0);

    const blob=
      await new Promise((res,rej)=>
        out.toBlob(
          b=>b
            ? res(b)
            : rej(
                new Error(
                  'PNG masque impossible'
                )
              ),
          'image/png'
        )
      );

    modal.style.display='none';
    document.body.style.overflow='';

    if(resolveEditor){
      resolveEditor(blob);
      resolveEditor=null;
    }
  }

  async function editSegmentation(segmentedBlob){
    buildUI();

    const segmented=
      await new Promise((res,rej)=>{
        const u=
          URL.createObjectURL(
            segmentedBlob
          );

        const i=new Image();

        i.onload=()=>{
          URL.revokeObjectURL(u);
          res(i);
        };

        i.onerror=rej;
        i.src=u;
      });

    let original=null;

    try{
      if(
        typeof sourceImg!=='undefined' &&
        sourceImg
      ){
        original=sourceImg;
      }
    }catch(_){}

    if(!original){
      original=segmented;
    }

    const w=
      original.naturalWidth||
      original.width;

    const h=
      original.naturalHeight||
      original.height;

    originalCanvas.width=w;
    originalCanvas.height=h;

    octx.clearRect(0,0,w,h);
    octx.drawImage(original,0,0,w,h);

    originalImageData=
      octx.getImageData(
        0,
        0,
        w,
        h
      );

    originalPixels=
      originalImageData.data;

    maskCanvas.width=w;
    maskCanvas.height=h;

    mctx.clearRect(
      0,
      0,
      w,
      h
    );

    const sc=
      document.createElement('canvas');

    sc.width=w;
    sc.height=h;

    const sx=
      sc.getContext(
        '2d',
        {willReadFrequently:true}
      );

    sx.drawImage(
      segmented,
      0,
      0,
      w,
      h
    );

    const d=
      sx.getImageData(
        0,
        0,
        w,
        h
      );

    const out=
      mctx.createImageData(
        w,
        h
      );

    for(let i=0;i<w*h;i++){

      const a=
        d.data[i*4+3];

      const o=i*4;

      out.data[o]=255;
      out.data[o+1]=255;
      out.data[o+2]=255;
      out.data[o+3]=a;
    }

    mctx.putImageData(
      out,
      0,
      0
    );

    colorMaskCanvas.width=w;
    colorMaskCanvas.height=h;

    selections=[{
      id:Date.now(),
      name:'Sélection 1',
      depth:0.48,
      action:'none',
      intensity:50,
      timing:'all',
      actionZones:[],
      mask:cloneImageData(out),
      initialMask:cloneImageData(out)
    }];

    activeSelection=0;

    history=[
      cloneImageData(out)
    ];

    redoStack=[];

    pointers.clear();

    drawing=false;
    panning=false;
    tapCandidate=false;
    tapPointerId=null;

    baseDirty=true;
    maskDirty=true;

    renderPlanList();
    updatePlanControls();
    updateHistory();
    setTool('add');

    modal.style.display='flex';
    document.body.style.overflow='hidden';

    setTimeout(()=>{
      resize();
      fit();
    },60);

    setTimeout(()=>{
      resize();
      fit();
    },220);

    return new Promise(resolve=>{
      resolveEditor=resolve;
    });
  }

  window.localRemoveBackground=
    async function(file){

      const workFile=
        await prepareSegmentationFile(
          file,
          1280
        );

      try{
        const originalLongSide=
          Math.max(
            (
              typeof sourceImg!=='undefined' &&
              sourceImg?.naturalWidth
            )||0,
            (
              typeof sourceImg!=='undefined' &&
              sourceImg?.naturalHeight
            )||0
          );

        if(originalLongSide>1280){

          const status=
            document.querySelector(
              '#status'
            );

          if(status){
            status.textContent=
              'Optimisation mémoire iPad : détourage calculé sur une copie 1280 px, original conservé pour le rendu.';
          }
        }

      }catch(_){}

      const segmented=
        await originalLocalRemoveBackground(
          workFile
        );

      const corrected=
        await editSegmentation(
          segmented
        );

      if(!corrected){
        throw new Error(
          'Correction du masque annulée.'
        );
      }

      return corrected;
    };

  console.log(
    '[HAPPYHOLO] mask-editor V3.16 — clin d’œil Pencil + zoom + pan actif'
  );

})();
