/* HappyHolo V3.7.6 — recto individualisé + hauteur iframe synchronisée */
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

    // Le recto possède désormais ses propres réglages dans le simulateur.
    // On ne réinitialise plus zoom/position à chaque changement de composition.
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

  console.log('[HAPPYHOLO] recto individualisé V3.7.6 + iframe auto-height actif');
})();
