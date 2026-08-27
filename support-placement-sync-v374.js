/* HappyHolo V3.7.4 — placement support synchronisé avec la composition principale
   Neutralise le second cadrage du recto sans toucher au verso, aux cartes,
   aux actions locales, à la zone de sécurité ni à la démo 360.
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

  function setValue(id,value){
    const el=$(id);
    if(!el)return;
    el.value=String(value);
  }

  function neutralizeSupportPlacement(){
    const fit=$('#supportFit');
    if(!fit)return false;

    // Le recto reprend désormais le cadrage maître : aucune seconde translation/échelle.
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

    // Un seul événement suffit pour faire relire les valeurs par la V3.7.3.
    fit.dispatchEvent(new Event('input',{bubbles:true}));
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

  // Si le placement maître change, le support reste neutre et se reconstruit via
  // l'événement déjà écouté par support-preview-v316.js.
  window.addEventListener('happyholo-subject-placement-changed',()=>{
    setValue('#supportFit','contain');
    setValue('#supportMargin',0);
    setValue('#supportZoom',100);
    setValue('#supportX',0);
    setValue('#supportY',0);
  });

  console.log('[HAPPYHOLO] support placement sync V3.7.4 actif');
})();
