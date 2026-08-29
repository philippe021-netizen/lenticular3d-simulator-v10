/* HappyHolo V3.7.9 — recto + iPad + bascule simulation + mode normal stable */
(() => {
  'use strict';

  const $ = s => document.querySelector(s);

  function showControl(inputId){
    const input=$(inputId);
    if(!input)return;
    const label=input.previousElementSibling;
    if(label?.tagName==='LABEL')label.style.display='';
    input.style.display='';
  }

  function enableIndependentFrontPlacement(){
    const fit=$('#supportFit');
    if(!fit)return false;
    showControl('#supportFit');showControl('#supportMargin');showControl('#supportZoom');showControl('#supportX');showControl('#supportY');
    let note=document.getElementById('happyHoloMasterPlacementNote');
    if(!note){
      note=document.createElement('div');note.id='happyHoloMasterPlacementNote';note.className='support-note';note.style.marginTop='12px';
      const supportType=$('#supportType');const controls=supportType?.closest('.support-controls');if(controls&&supportType)controls.insertBefore(note,supportType.nextSibling);
    }
    note.innerHTML='<b>Recto individualisé</b><br>Le cadrage du recto est indépendant : ajuste ici le cadrage, le zoom et la position sans modifier la composition principale.';
    return true;
  }

  function syncFrameHeight(){
    try{
      const frame=window.frameElement;if(!frame)return;
      const h=Math.max(document.documentElement?.scrollHeight||0,document.body?.scrollHeight||0,900);
      frame.style.height=`${h+24}px`;frame.style.minHeight=`${h+24}px`;frame.style.overflow='visible';frame.setAttribute('scrolling','no');
    }catch(_){ }
  }

  function findMaskEditor(){
    return [...document.body.children].find(el=>el instanceof HTMLElement&&el.style.zIndex==='999999'&&(el.textContent||'').includes('Correction du sujet'))||null;
  }

  function positionMaskEditor(){
    const modal=findMaskEditor();if(!modal||modal.style.display==='none')return;
    try{
      const frame=window.frameElement,parentWin=window.parent;
      if(!frame||!parentWin||parentWin===window){modal.style.position='fixed';modal.style.inset='0';modal.style.width='100vw';modal.style.height='100dvh';modal.style.maxHeight='100dvh';return;}
      const r=frame.getBoundingClientRect(),viewportH=parentWin.innerHeight||800,viewportW=parentWin.innerWidth||1200;
      const top=Math.max(0,-r.top),bottom=Math.min(r.height,viewportH-r.top),visibleH=Math.max(480,bottom-top);
      modal.style.position='absolute';modal.style.inset='auto';modal.style.left='0';modal.style.top=`${top}px`;
      modal.style.width=`${Math.max(320,Math.min(r.width||viewportW,viewportW))}px`;modal.style.height=`${visibleH}px`;modal.style.maxHeight=`${visibleH}px`;modal.style.overflow='hidden';
      requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    }catch(_){ }
  }

  function installMaskEditorViewportFix(){
    let raf=0;const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;positionMaskEditor();});};
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
    window.addEventListener('resize',schedule,{passive:true});
    try{window.parent?.addEventListener('scroll',schedule,{passive:true});window.parent?.addEventListener('resize',schedule,{passive:true});}catch(_){ }
    setInterval(()=>{const m=findMaskEditor();if(m&&m.style.display!=='none')schedule();},250);
  }

  function parentDoc(){try{return window.parent&&window.parent!==window?window.parent.document:null;}catch(_){return null;}}
  function pixverseToggle(){return document.getElementById('pixverseSimulatorToggle');}
  function pixverseAvailable(){const t=pixverseToggle();return !!t&&!t.disabled&&!/indisponible/i.test(t.textContent||'');}
  function pixverseIsOn(){return /ON/i.test(pixverseToggle()?.textContent||'');}
  function currentFamily(){return parentDoc()?.getElementById('family')?.value||'';}

  function stabilizeNormalPreview(){
    const stop=document.getElementById('supportStop');
    const play=document.getElementById('supportPlay');
    const product=document.getElementById('productObject');
    const isLogo=currentFamily()==='logo';
    if(isLogo){
      // Les cartes de profondeur sur un logo très contrasté peuvent fragmenter le dessin.
      // En mode normal, on garde donc la vue centrale propre et stable.
      stop?.click();
      if(product){product.classList.remove('support-playing');product.style.transform='perspective(620px) rotateY(0deg)';}
    }else{
      // Pour photo/personne/animal, conserver la simulation locale déjà prévue.
      if(play && !product?.classList.contains('support-playing'))play.click();
    }
  }

  function setSimulationMode(mode){
    const t=pixverseToggle();
    if(mode==='pixverse'){
      if(!pixverseAvailable())return false;
      if(!pixverseIsOn())t.click();
    }else{
      if(t&&pixverseIsOn())t.click();
      requestAnimationFrame(stabilizeNormalPreview);
    }
    refreshParentSwitch();
    return true;
  }

  function refreshParentSwitch(){
    const pd=parentDoc();if(!pd)return;
    const normal=pd.getElementById('hhSimNormal'),pix=pd.getElementById('hhSimPixverse'),msg=pd.getElementById('hhSimSwitchMsg');if(!normal||!pix)return;
    const available=pixverseAvailable(),on=pixverseIsOn(),isLogo=currentFamily()==='logo';
    normal.style.background=on?'#ececec':'#111';normal.style.color=on?'#111':'#fff';
    pix.style.background=on?'#17652c':'#ececec';pix.style.color=on?'#fff':'#111';pix.disabled=!available;
    if(msg)msg.textContent=available?(on?'Simulation PixVerse active':(isLogo?'Simulation normale stable — logo':'Simulation normale active')):'PixVerse disponible après génération';
  }

  function installParentSimulationSwitch(){
    const pd=parentDoc();if(!pd)return;
    let box=pd.getElementById('hhSimSwitch');
    if(!box){
      box=pd.createElement('div');box.id='hhSimSwitch';
      Object.assign(box.style,{position:'fixed',right:'14px',top:'64px',zIndex:'10050',background:'#fff',border:'2px solid #111',borderRadius:'14px',padding:'8px',boxShadow:'0 4px 18px rgba(0,0,0,.18)',width:'220px'});
      box.innerHTML='<div style="font-size:11px;font-weight:900;margin-bottom:6px">SIMULATION</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><button id="hhSimNormal" type="button" style="margin:0;padding:9px;border-radius:9px;border:0;font-weight:850">Normale</button><button id="hhSimPixverse" type="button" style="margin:0;padding:9px;border-radius:9px;border:0;font-weight:850">PixVerse</button></div><div id="hhSimSwitchMsg" style="font-size:10px;color:#555;margin-top:5px"></div>';
      pd.body.appendChild(box);
      pd.getElementById('hhSimNormal').onclick=()=>setSimulationMode('normal');
      pd.getElementById('hhSimPixverse').onclick=()=>setSimulationMode('pixverse');
      pd.getElementById('family')?.addEventListener('change',()=>{if(!pixverseIsOn())requestAnimationFrame(stabilizeNormalPreview);refreshParentSwitch();});
    }
    refreshParentSwitch();setInterval(refreshParentSwitch,500);
  }

  function invalidateStalePixVerseUI(){
    try{
      setSimulationMode('normal');
      const pd=parentDoc();if(!pd)return;
      const frames=pd.getElementById('framesBlock'),grid=pd.getElementById('framesGrid'),diag=pd.getElementById('framesDiag'),meta=pd.getElementById('framesMeta');
      const video=pd.getElementById('video'),zip=pd.getElementById('downloadPixVerse'),rerun=pd.getElementById('rerun'),status=pd.getElementById('status');
      if(frames)frames.style.display='none';if(grid)grid.innerHTML='';if(diag)diag.textContent='';if(meta)meta.textContent='';
      if(video){try{video.pause();}catch(_){}video.style.display='none';}
      if(zip)zip.disabled=true;if(rerun)rerun.style.display='none';
      if(status){status.textContent='Composition modifiée : ancien résultat PixVerse retiré. Relance PixVerse pour cette nouvelle image.';status.style.background='#fff4d8';status.style.color='#725400';}
      refreshParentSwitch();
    }catch(_){ }
  }

  function bindSceneInvalidation(){
    if(window.__hhSceneInvalidationBound)return;window.__hhSceneInvalidationBound=true;
    window.addEventListener('happyholo-background-changed',invalidateStalePixVerseUI);
    window.addEventListener('happyholo-subject-placement-changed',()=>{setTimeout(syncFrameHeight,50);invalidateStalePixVerseUI();});
  }

  function boot(){
    if(!enableIndependentFrontPlacement()){let tries=0;const timer=setInterval(()=>{tries++;if(enableIndependentFrontPlacement()||tries>40)clearInterval(timer);},100);}
    syncFrameHeight();setTimeout(syncFrameHeight,150);setTimeout(syncFrameHeight,600);setTimeout(syncFrameHeight,1500);
    installMaskEditorViewportFix();installParentSimulationSwitch();bindSceneInvalidation();
    if('ResizeObserver' in window){const ro=new ResizeObserver(()=>requestAnimationFrame(syncFrameHeight));ro.observe(document.documentElement);if(document.body)ro.observe(document.body);}
    new MutationObserver(()=>requestAnimationFrame(syncFrameHeight)).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',syncFrameHeight);window.addEventListener('resize',syncFrameHeight);
  console.log('[HAPPYHOLO] V3.7.9 — mode normal stable pour logos + bascule PixVerse');
})();
