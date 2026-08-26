/* HappyHolo V3.4.1 — réglages par sélection + reflet lumineux local */
(() => {
  'use strict';

  let originalRenderAt = null;
  try {
    if (typeof renderAt === 'function') originalRenderAt = renderAt;
  } catch (_) {}

  const actionOptions = [
    ['Aucune action','none'],
    ['Moto/voiture — appel de phare','headlight'],
    ['Reflet lumineux local','glint'],
    ['Objet rigide — pivot léger','pivot']
  ];

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function plan(){
    return Array.isArray(window.happyHoloSelectionPlan)
      ? window.happyHoloSelectionPlan
      : [];
  }

  function notifyActionPlan(){
    window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));
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

  function resolveRenderTarget(target){
    if(target) return target;
    try{ if(typeof view!=='undefined'&&view) return view; }catch(_){ }
    return window.HappyHoloReliefState?.view||null;
  }

  function drawGlintForSelection(ctx,s,layer,norm,W,H,shift=0){
    if(s?.action!=='glint'||!Array.isArray(s.actionZones)||!s.actionZones.length||!layer) return;
    const engine=window.HappyHoloActionPreviewEngine;
    if(typeof engine?.buildGlintOverlay!=='function') return;
    const fx=engine.buildGlintOverlay({
      layer,phase:clamp((Number(norm)||0)+1,0,2)/2,
      intensity:clamp(Number(s.intensity||50)/100,.1,1),W,H,zones:s.actionZones
    });
    ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(fx,shift,0);ctx.restore();
  }

  function drawSinglePlanGlints(norm,target){
    const selections=plan(),out=resolveRenderTarget(target);
    if(!out||!selections.length) return;
    const x=out.getContext('2d'),W=out.width,H=out.height;
    let amplitude=1.75;
    try{ if(typeof angle!=='undefined') amplitude=Number(angle.value)/4; }catch(_){ }
    selections.forEach((s,i)=>{
      if(s.action!=='glint') return;
      const layer=getExclusiveLayer(i,W,H),k=clamp((Number(s.depth)||.35)/.30,.05,3);
      drawGlintForSelection(x,s,layer,norm,W,H,Number(norm||0)*18*amplitude*k);
    });
  }

  function multiRenderAt(norm,target){
    const selections=plan();
    if(!sourceImage() || !bgImage()){
      if(originalRenderAt) return originalRenderAt(norm,target);
      return;
    }

    if(selections.length<2){
      if(originalRenderAt) originalRenderAt(norm,target);
      drawSinglePlanGlints(norm,target);
      return;
    }

    target=resolveRenderTarget(target);
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

    const textDepth=Number(window.happyHoloTextLayer?.depth)||0;
    if(textDepth<0) window.HappyHoloTextLayer?.draw?.(x,norm,{x:0,y:0,w:W,h:H});

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
      drawGlintForSelection(x,it.s,layer,norm,W,H,shift);
    }

    if(textDepth>=0) window.HappyHoloTextLayer?.draw?.(x,norm,{x:0,y:0,w:W,h:H});
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
    if(valid.every(i=>(selections[i].action||'none')==='none')){
      alert('Choisis d’abord une action pour cette sélection.');
      return;
    }
    const maxSide=1050;
    const sw=src.naturalWidth||src.width||1, sh=src.naturalHeight||src.height||1;
    const scale=Math.min(1,maxSide/Math.max(sw,sh));
    const W=Math.max(2,Math.round(sw*scale)), H=Math.max(2,Math.round(sh*scale));
    mainActionPreviewCanvas.width=W; mainActionPreviewCanvas.height=H;

    // Layer exclusif de chaque sélection, déjà aligné sur le cadrage de production.
    const layers=new Map();
    selections.forEach((s,i)=>layers.set(i,getExclusiveLayer(i,W,H)));

    const engine=window.HappyHoloActionPreviewEngine;
    if(!engine){alert('Moteur actions indisponible. Recharge la page.');return;}
    for(const i of valid){
      const s=selections[i];
      if(s.action==='person_wink'&&!s.actionZone){alert('Définis d’abord la zone de l’œil.');return;}
      if(s.action==='headlight'&&!(Array.isArray(s.actionZones)&&s.actionZones.length)){alert('Définis d’abord au moins une zone de phare.');return;}
      if(s.action==='glint'&&!(Array.isArray(s.actionZones)&&s.actionZones.length)){alert('Définis d’abord au moins une zone de reflet.');return;}
    }
    const base=document.createElement('canvas');base.width=W;base.height=H;
    const bx=base.getContext('2d'),bg=bgImage()||src,bf=fitCoverLocal(bg,W,H);bx.drawImage(bg,bf.x,bf.y,bf.w,bf.h);
    const frames=engine.generateActionFrames({base,layers,selections,activeIndices:valid,W,H});

    mainActionPreviewModal._title.textContent=titleText||'Aperçu action';
    mainActionPreviewModal.style.display='flex';
    cancelAnimationFrame(mainActionPreviewRAF);
    const start=performance.now();
    const speed=Math.max(700,Math.min(...valid.map(i=>Number(selections[i].actionSpeed||2000))));

    const frame=(now)=>{
      if(mainActionPreviewModal.style.display==='none') return;
      const t=((now-start)%speed)/speed;
      const x=mainActionPreviewCtx;
      x.clearRect(0,0,W,H);
      x.drawImage(frames[Math.min(6,Math.floor(t*7))],0,0,W,H);

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
      awrap.appendChild(asel);

      const speed=document.createElement('select');
      [['Rapide · 1 s',1000],['Normal · 2 s',2000],['Doux · 3 s',3000]].forEach(([t,v])=>speed.appendChild(new Option(t,String(v))));
      speed.value=String(s.actionSpeed||2000);s.actionSpeed=Number(speed.value);
      Object.assign(speed.style,{width:'100%',padding:'7px',borderRadius:'8px',marginTop:'7px'});
      speed.addEventListener('change',()=>{s.actionSpeed=Number(speed.value);notifyActionPlan();});awrap.appendChild(speed);

      const headlightMode=document.createElement('select');
      [['Réaliste · déjà allumé → appel','already_on'],['Visible · quasi éteint → 100 %','off_to_on']].forEach(([t,v])=>headlightMode.appendChild(new Option(t,v)));
      headlightMode.value=s.headlightMode||'already_on';s.headlightMode=headlightMode.value;
      Object.assign(headlightMode.style,{display:'none',width:'100%',padding:'7px',borderRadius:'8px',marginTop:'7px'});
      headlightMode.addEventListener('change',()=>{s.headlightMode=headlightMode.value;notifyActionPlan();});awrap.appendChild(headlightMode);

      const zoneBtn=document.createElement('button');zoneBtn.type='button';
      Object.assign(zoneBtn.style,{display:'none',width:'100%',padding:'9px',borderRadius:'9px',border:'1px solid #888',background:'#fff',fontWeight:'800',marginTop:'7px'});
      const removeZone=document.createElement('button');removeZone.type='button';removeZone.textContent='− Supprimer dernière zone';
      Object.assign(removeZone.style,{display:'none',width:'100%',padding:'7px',borderRadius:'9px',border:'1px solid #bbb',background:'#f3f3f3',marginTop:'5px'});
      const updateZone=()=>{
        headlightMode.style.display=s.action==='headlight'?'block':'none';
        if(s.action==='person_wink'){zoneBtn.style.display='block';removeZone.style.display='none';zoneBtn.textContent=s.actionZone?'✓ Modifier zone œil':'🎯 Définir zone œil';}
        else if(s.action==='headlight'||s.action==='glint'){s.actionZones=Array.isArray(s.actionZones)?s.actionZones:[];zoneBtn.style.display='block';removeZone.style.display=s.actionZones.length?'block':'none';zoneBtn.textContent=`＋ Ajouter zone ${s.action==='glint'?'reflet':'plein phare'} (${s.actionZones.length}/4)`;}
        else{zoneBtn.style.display='none';removeZone.style.display='none';}
      };
      zoneBtn.addEventListener('click',async()=>{
        if(typeof window.HappyHoloChooseActionZone!=='function'){alert('Outil de zone indisponible. Recharge la page.');return;}
        if(s.action==='person_wink'){
          const z=await window.HappyHoloChooseActionZone({actionZone:s.actionZone||null},'Zone précise de l’œil');if(z)s.actionZone=z;
        }else if(s.action==='headlight'||s.action==='glint'){
          s.actionZones=Array.isArray(s.actionZones)?s.actionZones:[];if(s.actionZones.length>=4){alert('4 zones maximum.');return;}
          const z=await window.HappyHoloChooseActionZone({actionZone:null},`${s.action==='glint'?'Zone reflet':'Zone plein phare'} ${s.actionZones.length+1}`);if(z)s.actionZones.push(z);
        }
        updateZone();notifyActionPlan();
      });
      removeZone.addEventListener('click',()=>{if(Array.isArray(s.actionZones)&&s.actionZones.length)s.actionZones.pop();updateZone();notifyActionPlan();});
      asel.addEventListener('change',()=>{s.action=asel.value;if(s.action!=='person_wink')delete s.actionZone;if(s.action!=='headlight'&&s.action!=='glint')s.actionZones=[];updateZone();notifyActionPlan();});
      awrap.append(zoneBtn,removeZone);

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
      intensity.addEventListener('input',()=>{ s.intensity=Number(intensity.value); intensityOut.textContent=`${s.intensity}%`; notifyActionPlan(); });
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
      updateZone();
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

  console.log('[HAPPYHOLO] V3.3.6 panneau sélections + aperçu local actif');
})();
