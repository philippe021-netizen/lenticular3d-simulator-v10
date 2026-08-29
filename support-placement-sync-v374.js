/* HappyHolo V3.7.5 — placement support + hauteur iframe synchronisée */
(() => {
  'use strict';

  const $ = s => document.querySelector(s);

  function hideControl(inputId){
    const input=$(inputId);
    if(!input)return;
    const label=input.previousElementSibling;
    if(label?.tagName==='LABEL')label.style.display='none';
    input.style.display='none';
  }

  function setValue(id,value){
    const el=$(id);
    if(!el)return;
    el.value=String(value);
  }

  function neutralizeSupportPlacement(){
    const fit=$('#supportFit');
    if(!fit)return false;

    setValue('#supportFit','contain');
    setValue('#supportMargin',0);
    setValue('#supportZoom',100);
    setValue('#supportX',0);
    setValue('#supportY',0);

    hideControl('#supportFit');
    hideControl('#supportMargin');
    hideControl('#supportZoom');
    hideControl('#supportX');
    hideControl('#supportY');

    let note=document.getElementById('happyHoloMasterPlacementNote');
    if(!note){
      note=document.createElement('div');
      note.id='happyHoloMasterPlacementNote';
      note.className='support-note';
      note.style.marginTop='12px';
      note.innerHTML='<b>Placement du recto synchronisé</b><br>Le sujet et le fond reprennent automatiquement la composition principale. Les réglages de déplacement se font uniquement dans « Sujet et arrière-plan ».';
      const supportType=$('#supportType');
      const controls=supportType?.closest('.support-controls');
      if(controls && supportType)controls.insertBefore(note,supportType.nextSibling);
    }

    fit.dispatchEvent(new Event('input',{bubbles:true}));
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
    if(!neutralizeSupportPlacement()){
      let tries=0;
      const timer=setInterval(()=>{
        tries++;
        if(neutralizeSupportPlacement()||tries>40)clearInterval(timer);
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
  window.addEventListener('happyholo-subject-placement-changed',()=>{
    setValue('#supportFit','contain');
    setValue('#supportMargin',0);
    setValue('#supportZoom',100);
    setValue('#supportX',0);
    setValue('#supportY',0);
    setTimeout(syncFrameHeight,50);
  });

  console.log('[HAPPYHOLO] support placement sync V3.7.5 + iframe auto-height actif');
})();
