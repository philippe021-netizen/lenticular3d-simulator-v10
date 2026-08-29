/* HappyHolo V3.7.7 — recto individualisé + hauteur iframe + masque iPad */
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

    showControl('#supportFit');
    showControl('#supportMargin');
    showControl('#supportZoom');
    showControl('#supportX');
    showControl('#supportY');

    let note=document.getElementById('happyHoloMasterPlacementNote');
    if(!note){
      note=document.createElement('div');
      note.id='happyHoloMasterPlacementNote';
      note.className='support-note';
      note.style.marginTop='12px';
      const supportType=$('#supportType');
      const controls=supportType?.closest('.support-controls');
      if(controls && supportType)controls.insertBefore(note,supportType.nextSibling);
    }
    note.innerHTML='<b>Recto individualisé</b><br>Le cadrage du recto est indépendant : ajuste ici le cadrage, le zoom et la position sans modifier la composition principale.';
    return true;
  }

  function syncFrameHeight(){
    try{
      const frame=window.frameElement;
      if(!frame)return;
      const h=Math.max(document.documentElement?.scrollHeight||0,document.body?.scrollHeight||0,900);
      frame.style.height=`${h+24}px`;
      frame.style.minHeight=`${h+24}px`;
      frame.style.overflow='visible';
      frame.setAttribute('scrolling','no');
    }catch(_){ }
  }

  function findMaskEditor(){
    return [...document.body.children].find(el=>{
      if(!(el instanceof HTMLElement))return false;
      if(el.style.zIndex!=='999999')return false;
      return (el.textContent||'').includes('Correction du sujet');
    })||null;
  }

  function positionMaskEditor(){
    const modal=findMaskEditor();
    if(!modal || modal.style.display==='none')return;
    try{
      const frame=window.frameElement;
      const parentWin=window.parent;
      if(!frame || !parentWin || parentWin===window){
        modal.style.position='fixed';
        modal.style.inset='0';
        modal.style.width='100vw';
        modal.style.height='100dvh';
        modal.style.maxHeight='100dvh';
        return;
      }

      const r=frame.getBoundingClientRect();
      const viewportH=parentWin.innerHeight||800;
      const viewportW=parentWin.innerWidth||1200;
      const top=Math.max(0,-r.top);
      const bottom=Math.min(r.height,viewportH-r.top);
      const visibleH=Math.max(480,bottom-top);

      modal.style.position='absolute';
      modal.style.inset='auto';
      modal.style.left='0';
      modal.style.top=`${top}px`;
      modal.style.width=`${Math.max(320,Math.min(r.width||viewportW,viewportW))}px`;
      modal.style.height=`${visibleH}px`;
      modal.style.maxHeight=`${visibleH}px`;
      modal.style.overflow='hidden';

      requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    }catch(_){ }
  }

  function installMaskEditorViewportFix(){
    let raf=0;
    const schedule=()=>{
      if(raf)return;
      raf=requestAnimationFrame(()=>{raf=0;positionMaskEditor();});
    };
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
    window.addEventListener('resize',schedule,{passive:true});
    try{
      window.parent?.addEventListener('scroll',schedule,{passive:true});
      window.parent?.addEventListener('resize',schedule,{passive:true});
    }catch(_){ }
    setInterval(()=>{
      const m=findMaskEditor();
      if(m&&m.style.display!=='none')schedule();
    },250);
  }

  function boot(){
    if(!enableIndependentFrontPlacement()){
      let tries=0;
      const timer=setInterval(()=>{
        tries++;
        if(enableIndependentFrontPlacement()||tries>40)clearInterval(timer);
      },100);
    }

    syncFrameHeight();
    setTimeout(syncFrameHeight,150);
    setTimeout(syncFrameHeight,600);
    setTimeout(syncFrameHeight,1500);
    installMaskEditorViewportFix();

    if('ResizeObserver' in window){
      const ro=new ResizeObserver(()=>requestAnimationFrame(syncFrameHeight));
      ro.observe(document.documentElement);
      if(document.body)ro.observe(document.body);
    }
    new MutationObserver(()=>requestAnimationFrame(syncFrameHeight)).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  window.addEventListener('load',syncFrameHeight);
  window.addEventListener('resize',syncFrameHeight);
  window.addEventListener('happyholo-subject-placement-changed',()=>setTimeout(syncFrameHeight,50));

  console.log('[HAPPYHOLO] recto individualisé V3.7.7 + correctif écran noir masque iPad actif');
})();
