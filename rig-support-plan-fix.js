/* HappyHolo — correctif de liaison rig V3.27 -> plan d'action support.
   Le pont UI intercepte le clic "Léger déhanché" avant que l'ancien bouton
   n'écrive yaw3d dans happyHoloSelectionPlan. Sans yaw3d, support-preview
   n'appelle jamais generateActionFrames, donc le rig validé reste invisible.
*/
(()=>{
  'use strict';
  let syncing=false;

  function syncRigToPlan(){
    if(syncing) return false;
    const rig=window.HappyHoloActionLocal;
    const plan=window.happyHoloSelectionPlan;
    if(!rig?.ready || !rig?.enabled || !Array.isArray(plan) || !plan.length) return false;

    // Si une sélection était déjà associée au mouvement local, on la garde.
    // Sinon, sur le workflow courant à une seule sélection, on utilise le plan actif/1er plan.
    let item=plan.find(s=>s?.action==='yaw3d') || plan.find(s=>s?.active) || plan[0];
    if(!item) return false;

    const changed=item.action!=='yaw3d' || item.__happyHoloRig327!==true;
    item.action='yaw3d';
    item.intensity=Math.round(Math.max(.1,Math.min(1,Number(rig.intensity)||.45))*100);
    item.__happyHoloRig327=true;
    item.__happyHoloRigAction=rig.action||'torso';

    if(changed){
      syncing=true;
      setTimeout(()=>{
        syncing=false;
        try{window.dispatchEvent(new CustomEvent('happyholo-selection-plan-changed'));}catch(_){ }
        try{window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));}catch(_){ }
        try{window.HappyHoloSupportRigBridge?.refresh?.();}catch(_){ }
      },0);
    }
    return true;
  }

  window.addEventListener('happyholo-action-plan-changed',()=>setTimeout(syncRigToPlan,0));
  window.addEventListener('happyholo-selection-plan-changed',()=>setTimeout(syncRigToPlan,0));
  window.addEventListener('happyholo-relief-ready',()=>setTimeout(syncRigToPlan,100));
  [800,1600,3000].forEach(ms=>setTimeout(syncRigToPlan,ms));

  window.HappyHoloRigSupportPlanFix={sync:syncRigToPlan};
  console.log('[HAPPYHOLO] rig support plan fix loaded');
})();
