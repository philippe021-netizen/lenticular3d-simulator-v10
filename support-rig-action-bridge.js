/* HappyHolo — bridge rig V3.27 -> aperçu support / porte-clé.
   Réutilise le chemin yaw3d déjà compris par support-preview, mais remplace
   ses frames par le rendu articulé validé quand le rig personne est actif.
*/
(()=>{
'use strict';
let installed=false;
function install(){
  if(installed)return true;
  const engine=window.HappyHoloActionPreviewEngine;
  if(!engine||typeof engine.generateActionFrames!=='function')return false;
  const original=engine.generateActionFrames.bind(engine);
  engine.generateActionFrames=function(opts={}){
    try{
      const rig=window.HappyHoloActionLocal;
      const rs=window.HappyHoloReliefState;
      const phases=Array.isArray(opts.phases)&&opts.phases.length?opts.phases:[-1,-.66,-.33,0,.33,.66,1];
      const W=Number(opts.W)||420,H=Number(opts.H)||420;
      if(rig?.enabled&&rig?.ready&&typeof rig.renderSubject==='function'&&rs?.subjectImg){
        return phases.map(n=>rig.renderSubject(rs.subjectImg,W,H,Math.max(-1,Math.min(1,Number(n)||0))));
      }
    }catch(e){console.warn('[HAPPYHOLO] bridge support rig fallback',e);}
    return original(opts);
  };
  installed=true;
  window.HappyHoloSupportRigBridge={installed:true,refresh(){
    try{window.dispatchEvent(new CustomEvent('happyholo-action-plan-changed'));}catch(_){ }
  }};
  console.log('[HAPPYHOLO] Support rig bridge installed');
  return true;
}
[0,300,800,1600,2800].forEach(ms=>setTimeout(install,ms));
window.addEventListener('happyholo-relief-ready',install);
window.addEventListener('happyholo-action-plan-changed',()=>{install();});
})();