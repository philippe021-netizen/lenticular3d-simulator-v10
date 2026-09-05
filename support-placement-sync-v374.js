/* HappyHolo V3.8.4 — photo originale ou fond choisi + cadrage recto manuel
   Neutralise les anciens modes de remplissage sans toucher au verso, aux cartes,
   à la zone de sécurité ni à la démo 360.
*/
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

  function showControl(inputId,title){
    const input=$(inputId);
    if(!input)return;
    const label=input.previousElementSibling;
    if(label?.tagName==='LABEL'){
      label.style.display='';
      const text=label.querySelector('span');
      if(text)text.textContent=title;
    }
    input.style.display='';
  }

  function setValue(id,value){
    const el=$(id);
    if(!el)return;
    el.value=String(value);
  }

  function scheduleSupportRebuild(){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window.dispatchEvent(new CustomEvent('happyholo-subject-placement-changed'));
    }));
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
    showControl('#supportZoom','Zoom photo');
    showControl('#supportX','Photo horizontale');
    showControl('#supportY','Photo verticale');

    let note=document.getElementById('happyHoloMasterPlacementNote');
    if(!note){
      note=document.createElement('div');
      note.id='happyHoloMasterPlacementNote';
      note.className='support-note';
      note.style.marginTop='12px';
      note.innerHTML='<b>Cadrage du recto</b><br>Le support reprend la photo originale ou le nouveau fond choisi, sans reconstruction floue. Ajuste le zoom et la position du sujet pour chaque format.';
      const supportType=$('#supportType');
      const controls=supportType?.closest('.support-controls');
      if(controls && supportType)controls.insertBefore(note,supportType.nextSibling);
    }

    fit.dispatchEvent(new Event('input',{bubbles:true}));

    const supportType=$('#supportType');
    if(supportType && !supportType.dataset.hhRatioSync){
      supportType.dataset.hhRatioSync='1';
      supportType.addEventListener('input',scheduleSupportRebuild);
      supportType.addEventListener('change',scheduleSupportRebuild);
    }
    return true;
  }

  function boot(){
    if(neutralizeSupportPlacement())return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(neutralizeSupportPlacement()||tries>40)clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  window.addEventListener('happyholo-subject-placement-changed',()=>{
    setValue('#supportFit','contain');
    setValue('#supportMargin',0);
  });

  console.log('[HAPPYHOLO] support placement sync V3.8.4 · fond choisi + cadrage recto');
})();
