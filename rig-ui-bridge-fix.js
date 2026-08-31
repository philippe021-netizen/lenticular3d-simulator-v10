/* HappyHolo — pont UI rig V3.27 / mini-actions
   Corrige l'iPad : rend le bloc articulé visible sous Mini-actions et
   transforme le bouton "Léger déhanché / rotation" en entrée vers le vrai rig torso.
*/
(()=>{
  'use strict';

  function requestRigUI(){
    if(!document.getElementById('hhLocalRigCard')){
      window.dispatchEvent(new CustomEvent('happyholo-selection-plan-changed'));
    }
  }

  function placeRigCard(){
    requestRigUI();
    const card=document.getElementById('hhLocalRigCard');
    const mini=document.getElementById('happyHoloLocalMiniActions');
    const controls=document.getElementById('happyHoloSelectionControls');
    if(!card) return false;
    const anchor=mini||controls;
    if(anchor && anchor.nextElementSibling!==card){
      anchor.insertAdjacentElement('afterend',card);
    }
    card.style.display='block';
    card.style.visibility='visible';
    return true;
  }

  function openTorsoRig(){
    placeRigCard();
    const cfg=document.getElementById('hhRigConfigure');
    if(!cfg || cfg.disabled){
      alert('Crée d’abord le relief 3D, puis réessaie le déhanché articulé.');
      return;
    }
    cfg.click();
    setTimeout(()=>{
      const torso=document.querySelector('#hhRigActions button[data-action="torso"]');
      torso?.click();
      const status=document.getElementById('hhRigStatus');
      if(status) status.textContent='Déhanché articulé sélectionné. Place les 8 points puis touche ▶ Aperçu local.';
    },80);
  }

  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('button');
    if(!b) return;
    const txt=(b.textContent||'').trim().toLowerCase();
    if(txt.includes('léger déhanché') || txt==='déhanché articulé'){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      openTorsoRig();
    }
  },true);

  window.addEventListener('happyholo-relief-ready',()=>setTimeout(placeRigCard,150));
  window.addEventListener('happyholo-selection-plan-changed',()=>setTimeout(placeRigCard,120));
  window.addEventListener('happyholo-action-plan-changed',()=>setTimeout(placeRigCard,120));
  [500,1000,1800,3000,5000].forEach(ms=>setTimeout(placeRigCard,ms));
  console.log('[HAPPYHOLO] rig UI bridge fix loaded');
})();